package inventory

import (
	"context"
	"errors"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type Operation string

const (
	Read    Operation = "read"
	Write   Operation = "write"
	Publish Operation = "publish"
)

type DealerAccess struct {
	OwnerUserID string
	UserActive  bool
	Membership  dealer.Membership
}
type MembershipReader interface {
	DealerAccess(context.Context, string, string) (DealerAccess, error)
}
type PermissionChecker interface {
	Check(context.Context, string, string, string, string) (bool, error)
}
type DecisionAudits interface {
	AppendAuditEvent(context.Context, audit.Event) error
}
type AccessDependencies struct {
	Auth        ports.Authenticator
	Memberships MembershipReader
	Authorizer  PermissionChecker
	Audits      DecisionAudits
	Limiter     ports.AuditRateLimiter
	Clock       ports.Clock
}
type AccessPolicy struct{ dependencies AccessDependencies }

// Access is request-local context, not a durable or reusable authorization token.
type Access struct {
	ActorID, OwnerUserID, DealerID string
	Operation                      Operation
}

func NewAccessPolicy(dependencies AccessDependencies) *AccessPolicy {
	return &AccessPolicy{dependencies: dependencies}
}
func validID(id string) bool {
	if strings.TrimSpace(id) != id || id == "" || len(id) > 128 || !utf8.ValidString(id) {
		return false
	}
	for _, r := range id {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}
func (p *AccessPolicy) deny(ctx context.Context, actor string, cause error) error {
	outcome := audit.Denied
	if !errors.Is(cause, ports.ErrNotFound) {
		outcome = audit.Failed
	}
	event := shared.NewAuditEvent(ctx, p.dependencies.Clock, actor, actor, audit.ResourceAccessDenied, "inventory", "inventory", outcome)
	if err := p.dependencies.Audits.AppendAuditEvent(ctx, event); err != nil {
		return err
	}
	return cause
}
func (p *AccessPolicy) Require(ctx context.Context, credential, dealerID string, operation Operation) (Access, error) {
	d := p.dependencies
	if d.Auth == nil {
		return Access{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	actor, err := d.Auth.Authenticate(ctx, credential)
	if err != nil {
		return Access{}, err
	}
	if !validID(actor.UserID) || !slices.Contains(actor.Scopes, "api:user") {
		return Access{}, ports.ErrInvalidCredential
	}
	if d.Memberships == nil || d.Authorizer == nil || d.Audits == nil || d.Limiter == nil || d.Clock == nil {
		return Access{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !d.Limiter.Allow(actor.UserID, d.Clock.Now().UTC()) {
		return Access{}, ports.ErrRateLimited
	}
	if !validID(dealerID) {
		return Access{}, ports.ErrInvalidArgument
	}
	var capability dealer.Capability
	switch operation {
	case Read:
		capability = dealer.View
	case Write:
		capability = dealer.ManageInventory
	case Publish:
		capability = dealer.PublishInventory
	default:
		return Access{}, ports.ErrInvalidArgument
	}
	local, err := d.Memberships.DealerAccess(ctx, actor.UserID, dealerID)
	if err != nil {
		return Access{}, p.deny(ctx, actor.UserID, err)
	}
	member := local.Membership
	if !validID(local.OwnerUserID) || !local.UserActive || string(member.DealerID) != dealerID || member.UserID != actor.UserID || !member.Allows(capability) || (member.Role == dealer.RoleOwner) != (local.OwnerUserID == actor.UserID) {
		return Access{}, p.deny(ctx, actor.UserID, ports.ErrNotFound)
	}
	allowed, err := d.Authorizer.Check(ctx, "dealer", dealerID, string(capability), actor.UserID)
	if err != nil {
		return Access{}, p.deny(ctx, actor.UserID, err)
	}
	if !allowed {
		return Access{}, p.deny(ctx, actor.UserID, ports.ErrNotFound)
	}
	return Access{ActorID: actor.UserID, OwnerUserID: local.OwnerUserID, DealerID: dealerID, Operation: operation}, nil
}
