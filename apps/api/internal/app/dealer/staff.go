package dealer

import (
	"context"
	"errors"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (s *Service) RevokeMembership(ctx context.Context, authorization string, id domain.ID, user string, expected int64) (domain.Membership, error) {
	return s.mutateStaff(ctx, authorization, id, user, expected, true, "")
}
func (s *Service) ChangeMembershipRole(ctx context.Context, authorization string, id domain.ID, user string, role domain.Role, expected int64) (domain.Membership, error) {
	return s.mutateStaff(ctx, authorization, id, user, expected, false, role)
}
func (s *Service) mutateStaff(ctx context.Context, authorization string, id domain.ID, user string, expected int64, remove bool, role domain.Role) (domain.Membership, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return domain.Membership{}, err
	}
	if id == "" || user == "" || expected < 1 || (!remove && role != domain.RoleEditor && role != domain.RoleViewer) {
		return domain.Membership{}, ports.ErrInvalidArgument
	}
	if s.NewID == nil {
		return domain.Membership{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	entity, err := s.Repository.Get(ctx, actor, id)
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, err)
		}
		return domain.Membership{}, err
	}
	if entity.OwnerUserID != actor {
		return domain.Membership{}, s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
	}
	allowed, err := s.Authorizer.Check(ctx, "dealer", string(id), "manage_members", actor)
	if err != nil {
		return domain.Membership{}, s.deniedDecision(ctx, actor, id, err)
	}
	if !allowed {
		return domain.Membership{}, s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
	}
	event := shared.NewAuditEvent(ctx, s.Clock, actor, actor, audit.ResourceUpdated, "dealer_membership", domain.MembershipKey(id, user), audit.Succeeded)
	var member domain.Membership
	if remove {
		member, err = s.Repository.RevokeMembership(ctx, actor, id, user, expected, s.NewID(), event)
	} else {
		member, err = s.Repository.ChangeMembershipRole(ctx, actor, id, user, role, expected, s.NewID(), s.NewID(), event)
	}
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, err)
		}
		if errors.Is(err, domain.ErrOwnerImmutable) || errors.Is(err, domain.ErrInvalidStaffRole) || errors.Is(err, domain.ErrInvalidMembership) {
			err = ports.ErrInvalidArgument
		}
		if errors.Is(err, domain.ErrInactiveMembership) {
			err = ports.ErrConflict
		}
		return domain.Membership{}, err
	}
	name := "dealer.staff_role_changed"
	if remove {
		name = "dealer.staff_revoked"
	}
	s.observeSuccess(ctx, name)
	return member, nil
}
