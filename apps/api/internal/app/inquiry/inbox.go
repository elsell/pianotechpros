package inquiry

import (
	"context"
	"errors"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type InboxDependencies struct {
	Access           InboxAccessDependencies
	Repository       InboxRepository
	CursorSigningKey []byte
	Probe            ports.Probe
}
type Inbox struct {
	dependencies InboxDependencies
	policy       *InboxAccessPolicy
}

func NewInbox(d InboxDependencies) *Inbox {
	d.CursorSigningKey = append([]byte(nil), d.CursorSigningKey...)
	return &Inbox{dependencies: d, policy: NewInboxAccessPolicy(d.Access)}
}
func (i *Inbox) require(ctx context.Context, credential, dealerID string) (InboxAccess, error) {
	access, err := i.policy.Require(ctx, credential, dealerID)
	if err != nil {
		return InboxAccess{}, err
	}
	if i.dependencies.Repository == nil {
		return InboxAccess{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	return access, nil
}
func (i *Inbox) event(ctx context.Context, access InboxAccess, id string, action audit.Action) audit.Event {
	return shared.NewAuditEvent(ctx, i.dependencies.Access.Clock, access.OwnerUserID, access.ActorID, action, "inquiry", id, audit.Succeeded)
}
func (i *Inbox) observe(ctx context.Context, name string, err error) {
	if i.dependencies.Probe != nil {
		outcome := "succeeded"
		if err != nil {
			outcome = "failed"
		}
		i.dependencies.Probe.Observe(ctx, ports.ProbeEvent{Name: name, Outcome: outcome, CorrelationID: shared.CorrelationID(ctx)})
	}
}
func (i *Inbox) readResult(ctx context.Context, access InboxAccess, id string, entry domain.Inquiry, err error) (domain.Inquiry, error) {
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = i.policy.deny(ctx, access.ActorID, err)
		}
		return domain.Inquiry{}, err
	}
	state := entry.State()
	if state.ID != id || state.Piano.DealerID != access.DealerID {
		return domain.Inquiry{}, ports.ErrInvalidArgument
	}
	if _, err := domain.Restore(state); err != nil {
		return domain.Inquiry{}, err
	}
	return entry, nil
}
func (i *Inbox) Get(ctx context.Context, credential, dealerID, id string) (entry domain.Inquiry, err error) {
	defer func() { i.observe(ctx, "inquiry.viewed", err) }()
	access, err := i.require(ctx, credential, dealerID)
	if err != nil {
		return domain.Inquiry{}, err
	}
	if !validID(id, 128) {
		return domain.Inquiry{}, ports.ErrInvalidArgument
	}
	entry, err = i.dependencies.Repository.GetInboxInquiry(ctx, access.ActorID, dealerID, id, i.event(ctx, access, id, audit.ResourceViewed))
	return i.readResult(ctx, access, id, entry, err)
}
func (i *Inbox) MarkRead(ctx context.Context, credential, dealerID, id string, expected int64) (entry domain.Inquiry, err error) {
	defer func() { i.observe(ctx, "inquiry.acknowledged", err) }()
	access, err := i.require(ctx, credential, dealerID)
	if err != nil {
		return domain.Inquiry{}, err
	}
	if !validID(id, 128) || (expected != 1 && expected != 2) {
		return domain.Inquiry{}, ports.ErrInvalidArgument
	}
	entry, err = i.dependencies.Repository.MarkInboxInquiryRead(ctx, access.ActorID, dealerID, id, expected, i.event(ctx, access, id, audit.ResourceUpdated))
	return i.readResult(ctx, access, id, entry, err)
}
