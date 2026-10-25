package customer

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type TimezoneCatalog interface {
	domain.TimezoneCatalog
	Names() []string
}
type Profiles struct {
	Dependencies
	Zones TimezoneCatalog
}

func NewProfiles(dependencies Dependencies, zones TimezoneCatalog) *Profiles {
	return &Profiles{Dependencies: dependencies, Zones: zones}
}
func (s *Profiles) principal(ctx context.Context, credential string) (string, error) {
	if s.Auth == nil {
		return "", ports.ErrAuthorizationPolicyNotConfigured
	}
	p, err := s.Auth.Authenticate(ctx, credential)
	if err != nil {
		return "", err
	}
	if p.UserID == "" {
		return "", ports.ErrInvalidCredential
	}
	if s.Repository == nil || s.Authorizer == nil || s.Clock == nil || s.Audits == nil || s.AuditRateLimiter == nil || s.Zones == nil {
		return "", ports.ErrAuthorizationPolicyNotConfigured
	}
	if !s.AuditRateLimiter.Allow(p.UserID, s.Clock.Now().UTC()) {
		return "", ports.ErrRateLimited
	}
	if !slices.Contains(p.Scopes, "api:user") {
		return "", s.denied(ctx, p.UserID, "self", ports.ErrInvalidCredential)
	}
	return p.UserID, nil
}
func (s *Profiles) event(ctx context.Context, actor, id string, action audit.Action, outcome audit.Outcome, at time.Time) audit.Event {
	e := shared.NewAuditEvent(ctx, s.Clock, actor, actor, action, "customer", id, outcome)
	e.OccurredAt = at.UTC().Truncate(time.Microsecond)
	return e
}
func (s *Profiles) denied(ctx context.Context, actor, id string, cause error) error {
	outcome := audit.Failed
	if errors.Is(cause, ports.ErrNotFound) || errors.Is(cause, ports.ErrInvalidCredential) {
		outcome = audit.Denied
	}
	e := s.event(ctx, actor, id, audit.ResourceAccessDenied, outcome, s.Clock.Now())
	if err := s.Audits.AppendAuditEvent(ctx, e); err != nil {
		return err
	}
	return cause
}
func (s *Profiles) owned(ctx context.Context, actor string) (domain.Entity, error) {
	e, err := s.Repository.GetOwn(ctx, actor)
	if err != nil {
		return domain.Entity{}, s.denied(ctx, actor, "self", err)
	}
	if e.ID == "" || e.OwnerUserID != actor {
		return domain.Entity{}, s.denied(ctx, actor, "self", ports.ErrNotFound)
	}
	return e, nil
}
func (s *Profiles) authorize(ctx context.Context, actor string, e domain.Entity, permission string) error {
	ready, err := s.Repository.AuthorizationReady(ctx, actor, e.ID)
	if err != nil {
		return s.denied(ctx, actor, string(e.ID), err)
	}
	if !ready {
		return s.denied(ctx, actor, string(e.ID), ports.ErrAuthorizationPending)
	}
	allowed, err := s.Authorizer.Check(ctx, "customer", string(e.ID), permission, actor)
	if err != nil {
		return s.denied(ctx, actor, string(e.ID), err)
	}
	if !allowed {
		return s.denied(ctx, actor, string(e.ID), ports.ErrNotFound)
	}
	return nil
}
func (s *Profiles) GetProfile(ctx context.Context, credential string) (domain.Entity, error) {
	actor, err := s.principal(ctx, credential)
	if err != nil {
		return domain.Entity{}, err
	}
	e, err := s.owned(ctx, actor)
	if err != nil {
		return domain.Entity{}, err
	}
	if err := s.authorize(ctx, actor, e, "view"); err != nil {
		return domain.Entity{}, err
	}
	if err := s.Audits.AppendAuditEvent(ctx, s.event(ctx, actor, string(e.ID), audit.ResourceViewed, audit.Succeeded, s.Clock.Now())); err != nil {
		return domain.Entity{}, err
	}
	s.observe(ctx, "customer.viewed")
	return e, nil
}
func (s *Profiles) SaveProfile(ctx context.Context, credential string, expected int64, attrs domain.Attributes) (domain.Entity, error) {
	actor, err := s.principal(ctx, credential)
	if err != nil {
		return domain.Entity{}, err
	}
	if s.AuthorizationSerializer == nil {
		return domain.Entity{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if expected < 1 || expected > domain.MaxRevision {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	current, err := s.owned(ctx, actor)
	if err != nil {
		return domain.Entity{}, err
	}
	var result domain.Entity
	err = s.AuthorizationSerializer.WithinResource(ctx, "customer", string(current.ID), func(locked context.Context) error {
		if err := s.authorize(locked, actor, current, "update"); err != nil {
			return err
		}
		at := s.Clock.Now().UTC().Truncate(time.Microsecond)
		event := s.event(locked, actor, string(current.ID), audit.ResourceUpdated, audit.Succeeded, at)
		var err error
		result, _, err = s.Repository.Save(locked, actor, current.ID, expected, attrs, at, event)
		if errors.Is(err, ports.ErrNotFound) {
			return s.denied(locked, actor, string(current.ID), err)
		}
		if errors.Is(err, domain.ErrInvalidFields) {
			return ports.ErrInvalidArgument
		}
		return err
	})
	if err != nil {
		return domain.Entity{}, err
	}
	s.observe(ctx, "customer.updated")
	return result, nil
}
func (s *Profiles) Timezones(ctx context.Context, credential string) ([]string, error) {
	actor, err := s.principal(ctx, credential)
	if err != nil {
		return nil, err
	}
	if err := s.Audits.AppendAuditEvent(ctx, s.event(ctx, actor, "timezones", audit.ResourceViewed, audit.Succeeded, s.Clock.Now())); err != nil {
		return nil, err
	}
	return append([]string(nil), s.Zones.Names()...), nil
}
func (s *Profiles) observe(ctx context.Context, name string) {
	if s.Probe != nil {
		s.Probe.Observe(ctx, ports.ProbeEvent{Name: name, Outcome: "succeeded", CorrelationID: shared.CorrelationID(ctx)})
	}
}
