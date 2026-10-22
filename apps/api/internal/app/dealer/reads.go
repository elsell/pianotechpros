package dealer

import (
	"context"
	"errors"
	"slices"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (s *Service) principalForAuditedOperation(ctx context.Context, authorization string) (string, error) {
	if s.Auth == nil {
		return "", ports.ErrAuthorizationPolicyNotConfigured
	}
	principal, err := s.Auth.Authenticate(ctx, authorization)
	if err != nil {
		return "", err
	}
	if s.Repository == nil || s.Authorizer == nil || s.Audits == nil || s.Clock == nil || s.AuditRateLimiter == nil {
		return "", ports.ErrAuthorizationPolicyNotConfigured
	}
	if principal.UserID == "" || !slices.Contains(principal.Scopes, "api:user") {
		return "", ports.ErrInvalidCredential
	}
	if !s.AuditRateLimiter.Allow(principal.UserID, s.Clock.Now().UTC()) {
		return "", ports.ErrRateLimited
	}
	return principal.UserID, nil
}
func (s *Service) readEvent(ctx context.Context, owner, actor string, action audit.Action, id string, outcome audit.Outcome) error {
	return s.Audits.AppendAuditEvent(ctx, shared.NewAuditEvent(ctx, s.Clock, owner, actor, action, "dealer", id, outcome))
}
func (s *Service) deniedDecision(ctx context.Context, actor string, id domain.ID, cause error) error {
	outcome := audit.Denied
	if !errors.Is(cause, ports.ErrNotFound) {
		outcome = audit.Failed
	}
	if err := s.readEvent(ctx, actor, actor, audit.ResourceAccessDenied, string(id), outcome); err != nil {
		return err
	}
	return cause
}
func (s *Service) canView(ctx context.Context, actor string, id, auditTarget domain.ID) (bool, error) {
	allowed, err := s.Authorizer.Check(ctx, "dealer", string(id), "view", actor)
	if err != nil {
		return false, s.deniedDecision(ctx, actor, auditTarget, err)
	}
	if !allowed {
		if err := s.readEvent(ctx, actor, actor, audit.ResourceAccessDenied, string(auditTarget), audit.Denied); err != nil {
			return false, err
		}
	}
	return allowed, nil
}
func (s *Service) observeSuccess(ctx context.Context, name string) {
	if s.Probe != nil {
		s.Probe.Observe(ctx, ports.ProbeEvent{Name: name, Outcome: "succeeded", CorrelationID: shared.CorrelationID(ctx)})
	}
}
func (s *Service) Get(ctx context.Context, authorization string, id domain.ID) (domain.Entity, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return domain.Entity{}, err
	}
	if id == "" {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	item, err := s.Repository.Get(ctx, actor, id)
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
		}
		return domain.Entity{}, err
	}
	allowed, err := s.canView(ctx, actor, id, id)
	if err != nil {
		return domain.Entity{}, err
	}
	if !allowed {
		return domain.Entity{}, ports.ErrNotFound
	}
	if err := s.readEvent(ctx, item.OwnerUserID, actor, audit.ResourceViewed, string(id), audit.Succeeded); err != nil {
		return domain.Entity{}, err
	}
	s.observeSuccess(ctx, "dealer.viewed")
	return item, nil
}
func (s *Service) List(ctx context.Context, authorization, cursor string, limit int) ([]domain.Entity, string, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return nil, "", err
	}
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 100 {
		return nil, "", ports.ErrInvalidArgument
	}
	if len(s.CursorSigningKey) < 32 {
		return nil, "", ports.ErrAuthorizationPolicyNotConfigured
	}
	request := PageRequest{Limit: limit, Snapshot: s.Clock.Now().UTC()}
	if cursor != "" {
		payload, err := s.decodeCursor(cursor)
		if err != nil || payload.Owner != actor || payload.Domain != "dealer" {
			return nil, "", ports.ErrInvalidArgument
		}
		request.AfterID, request.AfterCreated, request.Snapshot = domain.ID(payload.AfterID), payload.AfterCreated, payload.Snapshot
	}
	page, err := s.Repository.List(ctx, actor, request)
	if err != nil {
		return nil, "", err
	}
	items := make([]domain.Entity, 0, len(page.Items))
	for _, item := range page.Items {
		allowed, err := s.canView(ctx, actor, item.ID, "dealer")
		if err != nil {
			return nil, "", err
		}
		if allowed {
			items = append(items, item)
		}
	}
	next := ""
	if page.HasMore && len(page.Items) > 0 {
		last := page.Items[len(page.Items)-1]
		next, err = s.encodeCursor(shared.CursorPayload{Version: 1, Owner: actor, Domain: "dealer", AfterID: string(last.ID), AfterCreated: last.CreatedAt, Snapshot: request.Snapshot})
		if err != nil {
			return nil, "", err
		}
	}
	if err := s.readEvent(ctx, actor, actor, audit.ResourceListed, "dealer", audit.Succeeded); err != nil {
		return nil, "", err
	}
	s.observeSuccess(ctx, "dealer.listed")
	return items, next, nil
}
