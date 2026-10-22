package dealer

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (s *Service) Create(ctx context.Context, authorization, key string, attributes domain.Attributes) (domain.Entity, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return domain.Entity{}, err
	}
	if s.NewID == nil || s.AuthorizationOutbox == nil || s.AuthorizationSerializer == nil || s.AuthorizationWorker == "" || s.AuthorizationLease <= 0 {
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
	entity, err := domain.New(domain.ID(s.NewID()), actor, attributes)
	if err != nil {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	canonical, err := json.Marshal(entity.Attributes)
	if err != nil {
		return domain.Entity{}, err
	}
	digest := sha256.Sum256(canonical)
	entity.CreatedAt = s.Clock.Now().UTC()
	entity.UpdatedAt = entity.CreatedAt
	worker := s.AuthorizationWorker + "/" + s.NewID()
	change := ports.AuthorizationChange{ID: s.NewID(), ResourceType: "dealer", ResourceID: string(entity.ID), Relation: "owner", SubjectType: "user", SubjectID: actor, OwnerUserID: actor, ActorUserID: actor, Operation: ports.AuthorizationTouch, LockedBy: worker, Lease: s.AuthorizationLease}
	event := shared.NewAuditEvent(ctx, s.Clock, actor, actor, audit.ResourceCreated, "dealer", string(entity.ID), audit.Succeeded)
	entity, replayed, err := s.Repository.Create(ctx, entity, change, ports.Idempotency{PrincipalID: actor, Operation: "dealer.create", Key: key, RequestHash: digest[:]}, event)
	if err != nil {
		return domain.Entity{}, err
	}
	// A retry must not use a stale idempotency reservation to restore revoked access.
	if _, err := s.activeOwner(ctx, actor, entity.ID); err != nil {
		return domain.Entity{}, err
	}
	if replayed {
		change, err = s.AuthorizationOutbox.ClaimAuthorizationChangeForResource(ctx, "dealer", string(entity.ID), worker, s.AuthorizationLease)
		if err != nil && !errors.Is(err, ports.ErrNotFound) {
			return domain.Entity{}, err
		}
	}
	if err == nil {
		if change.ResourceType != "dealer" || change.ResourceID != string(entity.ID) || change.Relation != "owner" || change.SubjectType != "user" || change.SubjectID != actor || change.OwnerUserID != actor || change.ActorUserID != actor || change.Operation != ports.AuthorizationTouch {
			return domain.Entity{}, ports.ErrAuthorizationPending
		}
		if err := s.publishOwner(ctx, change, worker); err != nil {
			return domain.Entity{}, err
		}
	}
	entity, err = s.activeOwner(ctx, actor, entity.ID)
	if err != nil {
		return domain.Entity{}, err
	}
	allowed, err := s.Authorizer.Check(ctx, "dealer", string(entity.ID), "manage_profile", actor)
	if err != nil {
		return domain.Entity{}, s.deniedDecision(ctx, actor, entity.ID, err)
	}
	if !allowed {
		return domain.Entity{}, s.deniedDecision(ctx, actor, entity.ID, ports.ErrNotFound)
	}
	if replayed {
		if err := s.readEvent(ctx, actor, actor, audit.ResourceViewed, string(entity.ID), audit.Succeeded); err != nil {
			return domain.Entity{}, err
		}
	}
	s.observeSuccess(ctx, "dealer.created")
	return entity, nil
}
func (s *Service) activeOwner(ctx context.Context, actor string, id domain.ID) (domain.Entity, error) {
	entity, err := s.Repository.Get(ctx, actor, id)
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
		}
		return domain.Entity{}, err
	}
	if entity.OwnerUserID != actor {
		return domain.Entity{}, s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
	}
	return entity, nil
}
func (s *Service) publishOwner(ctx context.Context, change ports.AuthorizationChange, worker string) error {
	err := s.AuthorizationSerializer.WithinResource(ctx, change.ResourceType, change.ResourceID, func(locked context.Context) error {
		if err := s.AuthorizationOutbox.RenewAuthorizationChange(locked, change.ID, worker, s.AuthorizationLease); err != nil {
			return err
		}
		timeout := min(s.AuthorizationLease/2, 10*time.Second)
		call, cancel := context.WithTimeout(locked, timeout)
		defer cancel()
		if err := s.Authorizer.WriteRelationship(call, "dealer", change.ResourceID, "owner", "user", change.SubjectID); err != nil {
			event := shared.NewAuditEvent(locked, s.Clock, change.OwnerUserID, change.ActorUserID, audit.AuthorizationFailed, "dealer", change.ResourceID, audit.Failed)
			return errors.Join(err, s.Audits.AppendAuditEvent(locked, event))
		}
		event := shared.NewAuditEvent(locked, s.Clock, change.OwnerUserID, change.ActorUserID, audit.AuthorizationApplied, "dealer", change.ResourceID, audit.Succeeded)
		return s.AuthorizationOutbox.CompleteAuthorizationChangeWithAudit(locked, change.ID, worker, event)
	})
	if err != nil {
		return errors.Join(ports.ErrAuthorizationPending, err)
	}
	return nil
}
