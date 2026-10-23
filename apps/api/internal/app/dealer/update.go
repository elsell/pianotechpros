package dealer

import (
	"context"
	"errors"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (s *Service) Update(ctx context.Context, authorization string, id domain.ID, expectedRevision int64, attributes domain.Attributes) (domain.Entity, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return domain.Entity{}, err
	}
	if id == "" || expectedRevision < 1 {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	existing, err := s.Repository.Get(ctx, actor, id)
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
		}
		return domain.Entity{}, err
	}
	allowed, err := s.Authorizer.Check(ctx, "dealer", string(id), "manage_profile", actor)
	if err != nil {
		return domain.Entity{}, s.deniedDecision(ctx, actor, id, err)
	}
	if !allowed || existing.OwnerUserID != actor {
		return domain.Entity{}, s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
	}
	updated, err := domain.New(id, existing.OwnerUserID, attributes)
	if err != nil {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	updated.CreatedAt = existing.CreatedAt
	updated.UpdatedAt = s.Clock.Now().UTC()
	updated.Revision = expectedRevision
	event := shared.NewAuditEvent(ctx, s.Clock, existing.OwnerUserID, actor, audit.ResourceUpdated, "dealer", string(id), audit.Succeeded)
	if err := s.Repository.Update(ctx, actor, updated, event); err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
		}
		return domain.Entity{}, err
	}
	updated.Revision++
	s.observeSuccess(ctx, "dealer.updated")
	return updated, nil
}
