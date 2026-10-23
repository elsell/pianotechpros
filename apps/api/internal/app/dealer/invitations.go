package dealer

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func previewInvitation(i domain.StaffInvitation, name string) domain.InvitationPreview {
	return domain.InvitationPreview{ID: i.ID, DealerID: i.DealerID, DealerName: name, Role: i.Role, ExpiresAt: i.ExpiresAt}
}

func (s *Service) CreateStaffInvitation(ctx context.Context, authorization string, id domain.ID, role domain.Role, hours int) (domain.IssuedInvitation, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return domain.IssuedInvitation{}, err
	}
	if hours == 0 {
		hours = 72
	}
	if id == "" || hours < 1 || hours > 168 || (role != domain.RoleEditor && role != domain.RoleViewer) {
		return domain.IssuedInvitation{}, ports.ErrInvalidArgument
	}
	if s.NewID == nil {
		return domain.IssuedInvitation{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	entity, err := s.authorizedStaffOwner(ctx, actor, id)
	if err != nil {
		return domain.IssuedInvitation{}, err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return domain.IssuedInvitation{}, err
	}
	now := s.Clock.Now().UTC()
	invite, err := domain.NewStaffInvitation(s.NewID(), id, actor, role, sha256.Sum256(raw), now, now.Add(time.Duration(hours)*time.Hour))
	if err != nil {
		return domain.IssuedInvitation{}, ports.ErrInvalidArgument
	}
	event := shared.NewAuditEvent(ctx, s.Clock, actor, actor, audit.InvitationCreated, "dealer_staff_invitation", invite.ID, audit.Succeeded)
	event.OccurredAt = now
	if err := s.Repository.CreateStaffInvitation(ctx, actor, invite, event); err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = s.deniedDecision(ctx, actor, id, err)
		}
		return domain.IssuedInvitation{}, err
	}
	s.observeSuccess(ctx, "dealer.staff_invitation_created")
	return domain.IssuedInvitation{Invitation: previewInvitation(invite, entity.Name), Token: base64.RawURLEncoding.EncodeToString(raw)}, nil
}
func (s *Service) RevokeStaffInvitation(ctx context.Context, authorization string, id domain.ID, invitationID string) error {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return err
	}
	if id == "" || invitationID == "" {
		return ports.ErrInvalidArgument
	}
	if _, err := s.authorizedStaffOwner(ctx, actor, id); err != nil {
		return err
	}
	event := shared.NewAuditEvent(ctx, s.Clock, actor, actor, audit.InvitationRevoked, "dealer_staff_invitation", invitationID, audit.Succeeded)
	if err := s.Repository.RevokeStaffInvitation(ctx, actor, id, invitationID, event); err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			return s.deniedDecision(ctx, actor, id, err)
		}
		if errors.Is(err, domain.ErrInvalidInvitation) {
			return ports.ErrConflict
		}
		return err
	}
	s.observeSuccess(ctx, "dealer.staff_invitation_revoked")
	return nil
}
func (s *Service) invitationFailure(ctx context.Context, actor string, cause error) error {
	outcome := audit.Failed
	if errors.Is(cause, domain.ErrInvalidInvitation) || errors.Is(cause, ports.ErrConflict) {
		outcome = audit.Denied
	}
	event := shared.NewAuditEvent(ctx, s.Clock, actor, actor, audit.ResourceAccessDenied, "dealer_staff_invitation", "collection", outcome)
	if err := s.Audits.AppendAuditEvent(ctx, event); err != nil {
		return err
	}
	return cause
}
func (s *Service) invitationCandidate(ctx context.Context, actor string, id domain.ID, invitationID, token string) (InvitationCandidate, [32]byte, error) {
	invalid := func() (InvitationCandidate, [32]byte, error) {
		return InvitationCandidate{}, [32]byte{}, s.invitationFailure(ctx, actor, domain.ErrInvalidInvitation)
	}
	if id == "" || invitationID == "" || len(token) != 43 {
		return invalid()
	}
	raw, err := base64.RawURLEncoding.Strict().DecodeString(token)
	if err != nil || len(raw) != 32 || base64.RawURLEncoding.EncodeToString(raw) != token {
		return invalid()
	}
	digest := sha256.Sum256(raw)
	candidate, err := s.Repository.StaffInvitationCandidate(ctx, actor, id, invitationID, digest)
	if err != nil {
		return InvitationCandidate{}, [32]byte{}, s.invitationFailure(ctx, actor, err)
	}
	invite := candidate.Invitation
	if invite.ID != invitationID || invite.DealerID != id || invite.TokenDigest != digest || !invite.Available(s.Clock.Now().UTC()) {
		return invalid()
	}
	allowed, err := s.Authorizer.Check(ctx, "dealer", string(id), "manage_members", invite.OwnerUserID)
	if err != nil {
		return InvitationCandidate{}, [32]byte{}, s.invitationFailure(ctx, actor, err)
	}
	if !allowed {
		return invalid()
	}
	return candidate, digest, nil
}
func (s *Service) PreviewStaffInvitation(ctx context.Context, authorization string, id domain.ID, invitationID, token string) (domain.InvitationPreview, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return domain.InvitationPreview{}, err
	}
	candidate, _, err := s.invitationCandidate(ctx, actor, id, invitationID, token)
	if err != nil {
		return domain.InvitationPreview{}, err
	}
	invite := candidate.Invitation
	event := shared.NewAuditEvent(ctx, s.Clock, invite.OwnerUserID, actor, audit.ResourceViewed, "dealer_staff_invitation", invite.ID, audit.Succeeded)
	if err := s.Audits.AppendAuditEvent(ctx, event); err != nil {
		return domain.InvitationPreview{}, err
	}
	s.observeSuccess(ctx, "dealer.staff_invitation_viewed")
	return previewInvitation(invite, candidate.DealerName), nil
}
func (s *Service) AcceptStaffInvitation(ctx context.Context, authorization string, id domain.ID, invitationID, token string) (domain.Membership, error) {
	actor, err := s.principalForAuditedOperation(ctx, authorization)
	if err != nil {
		return domain.Membership{}, err
	}
	if s.NewID == nil {
		return domain.Membership{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	candidate, digest, err := s.invitationCandidate(ctx, actor, id, invitationID, token)
	if err != nil {
		return domain.Membership{}, err
	}
	event := shared.NewAuditEvent(ctx, s.Clock, candidate.Invitation.OwnerUserID, actor, audit.InvitationConsumed, "dealer_staff_invitation", invitationID, audit.Succeeded)
	member, err := s.Repository.AcceptStaffInvitation(ctx, actor, id, invitationID, digest, s.NewID(), event, s.Clock)
	if err != nil {
		if errors.Is(err, domain.ErrActiveMembership) {
			err = ports.ErrConflict
		}
		if errors.Is(err, domain.ErrInvalidInvitation) || errors.Is(err, ports.ErrConflict) {
			err = s.invitationFailure(ctx, actor, err)
		}
		return domain.Membership{}, err
	}
	s.observeSuccess(ctx, "dealer.staff_invitation_consumed")
	return member, nil
}
