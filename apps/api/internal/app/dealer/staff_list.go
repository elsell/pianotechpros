package dealer

import (
	"context"
	"errors"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func staffCursorDomain(id domain.ID, kind string) string { return kind + ":" + string(id) }
func (s *Service) staffListRequest(ctx context.Context, authorization string, id domain.ID, kind, cursor string, limit int) (string, StaffPageRequest, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return "", StaffPageRequest{}, err
	}
	if limit == 0 {
		limit = 50
	}
	if id == "" || limit < 1 || limit > 100 {
		return "", StaffPageRequest{}, ports.ErrInvalidArgument
	}
	if len(s.CursorSigningKey) < 32 {
		return "", StaffPageRequest{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	request := StaffPageRequest{Limit: limit, Snapshot: s.Clock.Now().UTC()}
	if cursor != "" {
		payload, err := s.decodeCursor(cursor)
		if err != nil || payload.Owner != actor || payload.Domain != staffCursorDomain(id, kind) {
			return "", StaffPageRequest{}, ports.ErrInvalidArgument
		}
		request.AfterID, request.AfterCreated, request.Snapshot = payload.AfterID, payload.AfterCreated, payload.Snapshot
	}
	if _, err := s.authorizedStaffOwner(ctx, actor, id); err != nil {
		return "", StaffPageRequest{}, err
	}
	return actor, request, nil
}
func (s *Service) ListStaff(ctx context.Context, authorization string, id domain.ID, cursor string, limit int) ([]domain.Membership, string, error) {
	const kind = "dealer.staff"
	actor, request, err := s.staffListRequest(ctx, authorization, id, kind, cursor, limit)
	if err != nil {
		return nil, "", err
	}
	page, err := s.Repository.ListStaff(ctx, actor, id, request)
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, err)
		}
		return nil, "", err
	}
	next := ""
	if page.HasMore && len(page.Items) > 0 {
		last := page.Items[len(page.Items)-1]
		next, err = s.encodeCursor(shared.CursorPayload{Version: 1, Owner: actor, Domain: staffCursorDomain(id, kind), AfterID: last.UserID, AfterCreated: last.CreatedAt, Snapshot: request.Snapshot})
		if err != nil {
			return nil, "", err
		}
	}
	event := shared.NewAuditEvent(ctx, s.Clock, actor, actor, audit.ResourceListed, "dealer_staff", string(id), audit.Succeeded)
	if err := s.Audits.AppendAuditEvent(ctx, event); err != nil {
		return nil, "", err
	}
	s.observeSuccess(ctx, "dealer.staff_listed")
	return page.Items, next, nil
}
func (s *Service) ListStaffInvitations(ctx context.Context, authorization string, id domain.ID, cursor string, limit int) ([]domain.InvitationSummary, string, error) {
	const kind = "dealer.staff-invitations"
	actor, request, err := s.staffListRequest(ctx, authorization, id, kind, cursor, limit)
	if err != nil {
		return nil, "", err
	}
	page, err := s.Repository.ListStaffInvitations(ctx, actor, id, request)
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, err)
		}
		return nil, "", err
	}
	next := ""
	if page.HasMore && len(page.Items) > 0 {
		last := page.Items[len(page.Items)-1]
		next, err = s.encodeCursor(shared.CursorPayload{Version: 1, Owner: actor, Domain: staffCursorDomain(id, kind), AfterID: last.ID, AfterCreated: last.CreatedAt, Snapshot: request.Snapshot})
		if err != nil {
			return nil, "", err
		}
	}
	event := shared.NewAuditEvent(ctx, s.Clock, actor, actor, audit.InvitationListed, "dealer_staff_invitations", string(id), audit.Succeeded)
	if err := s.Audits.AppendAuditEvent(ctx, event); err != nil {
		return nil, "", err
	}
	s.observeSuccess(ctx, "dealer.staff_invitations_listed")
	return page.Items, next, nil
}
