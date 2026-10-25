package inquiry

import (
	"context"
	"errors"
	"slices"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type DealerAccess struct {
	OwnerUserID string
	UserActive  bool
	Membership  dealer.Membership
}
type InboxMembershipReader interface {
	InquiryAccess(context.Context, string, string) (DealerAccess, error)
}
type InboxPermissionChecker interface {
	Check(context.Context, string, string, string, string) (bool, error)
}
type InboxDecisionAudits interface {
	AppendAuditEvent(context.Context, audit.Event) error
}
type InboxAccessDependencies struct {
	Auth        ports.Authenticator
	Memberships InboxMembershipReader
	Authorizer  InboxPermissionChecker
	Audits      InboxDecisionAudits
	Limiter     ports.AuditRateLimiter
	Clock       ports.Clock
}
type InboxAccessPolicy struct{ d InboxAccessDependencies }

// InboxAccess is request-local preflight context, never a reusable authority lease.
type InboxAccess struct{ ActorID, OwnerUserID, DealerID string }

func NewInboxAccessPolicy(d InboxAccessDependencies) *InboxAccessPolicy {
	return &InboxAccessPolicy{d: d}
}
func (p *InboxAccessPolicy) deny(ctx context.Context, actor string, cause error) error {
	outcome := audit.Denied
	if !errors.Is(cause, ports.ErrNotFound) {
		outcome = audit.Failed
	}
	event := shared.NewAuditEvent(ctx, p.d.Clock, actor, actor, audit.ResourceAccessDenied, "inquiry", "inquiry", outcome)
	if err := p.d.Audits.AppendAuditEvent(ctx, event); err != nil {
		return err
	}
	return cause
}
func (p *InboxAccessPolicy) Require(ctx context.Context, credential, dealerID string) (InboxAccess, error) {
	d := p.d
	if d.Auth == nil {
		return InboxAccess{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	actor, err := d.Auth.Authenticate(ctx, credential)
	if err != nil {
		return InboxAccess{}, err
	}
	if !validID(actor.UserID, 128) || !slices.Contains(actor.Scopes, "api:user") {
		return InboxAccess{}, ports.ErrInvalidCredential
	}
	if d.Memberships == nil || d.Authorizer == nil || d.Audits == nil || d.Limiter == nil || d.Clock == nil {
		return InboxAccess{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !d.Limiter.Allow(actor.UserID, d.Clock.Now().UTC()) {
		return InboxAccess{}, ports.ErrRateLimited
	}
	if !validID(dealerID, 128) {
		return InboxAccess{}, ports.ErrInvalidArgument
	}
	local, err := d.Memberships.InquiryAccess(ctx, actor.UserID, dealerID)
	if err != nil {
		return InboxAccess{}, p.deny(ctx, actor.UserID, err)
	}
	member := local.Membership
	if !validID(local.OwnerUserID, 128) || !local.UserActive || string(member.DealerID) != dealerID || member.UserID != actor.UserID || !member.Allows(dealer.ManageInquiries) || (member.Role == dealer.RoleOwner) != (local.OwnerUserID == actor.UserID) {
		return InboxAccess{}, p.deny(ctx, actor.UserID, ports.ErrNotFound)
	}
	allowed, err := d.Authorizer.Check(ctx, "dealer", dealerID, string(dealer.ManageInquiries), actor.UserID)
	if err != nil {
		return InboxAccess{}, p.deny(ctx, actor.UserID, err)
	}
	if !allowed {
		return InboxAccess{}, p.deny(ctx, actor.UserID, ports.ErrNotFound)
	}
	return InboxAccess{ActorID: actor.UserID, OwnerUserID: local.OwnerUserID, DealerID: dealerID}, nil
}
