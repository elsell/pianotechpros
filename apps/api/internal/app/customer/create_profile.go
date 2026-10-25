package customer

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (s *Profiles) CreateProfile(ctx context.Context, credential, key string, attrs domain.Attributes) (domain.Entity, error) {
	actor, err := s.principal(ctx, credential)
	if err != nil {
		return domain.Entity{}, err
	}
	if s.NewID == nil || s.AuthorizationOutbox == nil || s.AuthorizationSerializer == nil || s.AuthorizationWorker == "" || s.AuthorizationLease <= 0 || s.AuthorizationLease > time.Hour {
		return domain.Entity{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if len(key) < 16 || len(key) > 128 {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	for _, b := range []byte(key) {
		if b < 0x20 || b > 0x7e {
			return domain.Entity{}, ports.ErrInvalidArgument
		}
	}
	at := s.Clock.Now().UTC().Truncate(time.Microsecond)
	entity, err := domain.New(domain.ID(s.NewID()), actor, attrs, s.Zones, at)
	if err != nil {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	canonical, err := json.Marshal(entity.Attributes)
	if err != nil {
		return domain.Entity{}, err
	}
	digest := sha256.Sum256(canonical)
	worker := s.AuthorizationWorker + "/" + s.NewID()
	change := ports.AuthorizationChange{ID: s.NewID(), ResourceType: "customer", ResourceID: string(entity.ID), Relation: "owner", SubjectType: "user", SubjectID: actor, OwnerUserID: actor, ActorUserID: actor, Operation: ports.AuthorizationTouch, LockedBy: worker, Lease: s.AuthorizationLease}
	event := s.event(ctx, actor, string(entity.ID), audit.ResourceCreated, audit.Succeeded, at)
	entity, replayed, err := s.Repository.Create(ctx, entity, change, ports.Idempotency{PrincipalID: actor, Operation: "customer.create", Key: key, RequestHash: digest[:]}, event)
	if err != nil {
		return domain.Entity{}, err
	}
	if entity.ID == "" || entity.OwnerUserID != actor {
		return domain.Entity{}, s.denied(ctx, actor, "self", ports.ErrNotFound)
	}
	current, err := s.Repository.Get(ctx, actor, entity.ID)
	if err != nil {
		return domain.Entity{}, s.denied(ctx, actor, string(entity.ID), err)
	}
	if current.ID != entity.ID || current.OwnerUserID != actor {
		return domain.Entity{}, s.denied(ctx, actor, "self", ports.ErrNotFound)
	}
	if replayed {
		change, err = s.AuthorizationOutbox.ClaimAuthorizationChangeForResource(ctx, "customer", string(entity.ID), worker, s.AuthorizationLease)
		if err != nil && !errors.Is(err, ports.ErrNotFound) {
			return domain.Entity{}, errors.Join(ports.ErrAuthorizationPending, err)
		}
	}
	if err == nil {
		if change.ResourceType != "customer" || change.ResourceID != string(entity.ID) || change.Relation != "owner" || change.SubjectType != "user" || change.SubjectID != actor || change.OwnerUserID != actor || change.ActorUserID != actor || change.Operation != ports.AuthorizationTouch {
			return domain.Entity{}, ports.ErrAuthorizationPending
		}
		if err := s.publishOwner(ctx, change, worker); err != nil {
			return domain.Entity{}, err
		}
	}
	current, err = s.owned(ctx, actor)
	if err != nil {
		return domain.Entity{}, err
	}
	if current.ID != entity.ID {
		return domain.Entity{}, s.denied(ctx, actor, "self", ports.ErrNotFound)
	}
	if err := s.authorize(ctx, actor, current, "view"); err != nil {
		return domain.Entity{}, err
	}
	if replayed {
		if err := s.Audits.AppendAuditEvent(ctx, s.event(ctx, actor, string(entity.ID), audit.ResourceViewed, audit.Succeeded, s.Clock.Now())); err != nil {
			return domain.Entity{}, err
		}
	}
	s.observe(ctx, "customer.created")
	return current, nil
}
func (s *Profiles) publishOwner(ctx context.Context, change ports.AuthorizationChange, worker string) error {
	err := s.AuthorizationSerializer.WithinResource(ctx, "customer", change.ResourceID, func(locked context.Context) error {
		if err := s.AuthorizationOutbox.RenewAuthorizationChange(locked, change.ID, worker, s.AuthorizationLease); err != nil {
			return err
		}
		call, cancel := context.WithTimeout(locked, min(s.AuthorizationLease/2, 10*time.Second))
		defer cancel()
		if err := s.Authorizer.WriteRelationship(call, "customer", change.ResourceID, "owner", "user", change.SubjectID); err != nil {
			event := s.event(locked, change.ActorUserID, change.ResourceID, audit.AuthorizationFailed, audit.Failed, s.Clock.Now())
			return errors.Join(err, s.Audits.AppendAuditEvent(locked, event))
		}
		event := s.event(locked, change.ActorUserID, change.ResourceID, audit.AuthorizationApplied, audit.Succeeded, s.Clock.Now())
		return s.AuthorizationOutbox.CompleteAuthorizationChangeWithAudit(locked, change.ID, worker, event)
	})
	if err != nil {
		return errors.Join(ports.ErrAuthorizationPending, err)
	}
	return nil
}
