package inventory

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type CommandDependencies struct {
	SupportedCurrency func(string) bool
	Access            AccessDependencies
	Records           RecordRepository
	NewID             func() string
	Probe             ports.Probe
}
type Commands struct {
	dependencies CommandDependencies
	policy       *AccessPolicy
}

func NewCommands(d CommandDependencies) *Commands {
	return &Commands{dependencies: d, policy: NewAccessPolicy(d.Access)}
}
func (c *Commands) require(ctx context.Context, credential, dealerID string, op Operation) (Access, error) {
	access, err := c.policy.Require(ctx, credential, dealerID, op)
	if err != nil {
		return Access{}, err
	}
	if c.dependencies.Records == nil || c.dependencies.SupportedCurrency == nil {
		return Access{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	return access, nil
}
func (c *Commands) result(ctx context.Context, access Access, result domain.Record, err error, name string) (domain.Record, error) {
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = c.policy.deny(ctx, access.ActorID, err)
		}
		if errors.Is(err, domain.ErrInvalidFields) || errors.Is(err, domain.ErrNoChange) || errors.Is(err, domain.ErrRevisionExhausted) {
			err = ports.ErrInvalidArgument
		}
		if errors.Is(err, domain.ErrConflict) {
			err = ports.ErrConflict
		}
		return domain.Record{}, err
	}
	if c.dependencies.Probe != nil {
		c.dependencies.Probe.Observe(ctx, ports.ProbeEvent{Name: name, Outcome: "succeeded", CorrelationID: shared.CorrelationID(ctx)})
	}
	return result, nil
}
func (c *Commands) event(ctx context.Context, access Access, id string, action audit.Action) audit.Event {
	return shared.NewAuditEvent(ctx, c.dependencies.Access.Clock, access.OwnerUserID, access.ActorID, action, "inventory", id, audit.Succeeded)
}
func (c *Commands) CreateDraft(ctx context.Context, credential, dealerID, key string) (domain.Record, error) {
	access, err := c.require(ctx, credential, dealerID, Write)
	if err != nil {
		return domain.Record{}, err
	}
	if c.dependencies.NewID == nil {
		return domain.Record{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if len(key) < 16 || len(key) > 128 {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	for _, b := range []byte(key) {
		if b < 0x20 || b > 0x7e {
			return domain.Record{}, ports.ErrInvalidArgument
		}
	}
	id := c.dependencies.NewID()
	if !validID(id) || len(id) > 77 {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	event := c.event(ctx, access, id, audit.ResourceCreated)
	draft, err := domain.NewDraft(id, dealerID, "PT-"+id, event.OccurredAt)
	if err != nil {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	result, _, err := c.dependencies.Records.CreateDraft(ctx, access.ActorID, draft, key, event)
	return c.result(ctx, access, result, err, "inventory.draft_created")
}
func (c *Commands) GetRecord(ctx context.Context, credential, dealerID, id string) (domain.Record, error) {
	access, err := c.require(ctx, credential, dealerID, Read)
	if err != nil {
		return domain.Record{}, err
	}
	if !validID(id) {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	result, err := c.dependencies.Records.GetRecord(ctx, access.ActorID, dealerID, id, c.event(ctx, access, id, audit.ResourceViewed))
	return c.result(ctx, access, result, err, "inventory.viewed")
}
func (c *Commands) EditRecord(ctx context.Context, credential, dealerID, id string, expected int64, attributes domain.Attributes) (domain.Record, error) {
	access, err := c.require(ctx, credential, dealerID, Write)
	if err != nil {
		return domain.Record{}, err
	}
	if !validID(id) || expected < 1 || expected > 9007199254740991 {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	for _, money := range []*domain.Money{attributes.AskingPrice, attributes.AcquisitionCost} {
		if money != nil && !c.dependencies.SupportedCurrency(money.Currency) {
			return domain.Record{}, ports.ErrInvalidArgument
		}
	}
	result, err := c.dependencies.Records.ReviseRecord(ctx, access.ActorID, dealerID, id, expected, attributes, domain.Manual, c.event(ctx, access, id, audit.ResourceUpdated))
	return c.result(ctx, access, result, err, "inventory.updated")
}
