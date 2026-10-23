package inventory

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (c *Commands) requirePublication(ctx context.Context, credential, dealerID, id string, operation Operation) (Access, error) {
	access, err := c.require(ctx, credential, dealerID, operation)
	if err != nil {
		return Access{}, err
	}
	if c.dependencies.Publications == nil {
		return Access{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !validID(id) {
		return Access{}, ports.ErrInvalidArgument
	}
	return access, nil
}
func (c *Commands) publicationResult(ctx context.Context, access Access, state PublicationState, err error, probe string) (PublicationState, error) {
	if _, err := c.result(ctx, access, state.Record, err, probe); err != nil {
		return PublicationState{}, err
	}
	return state, nil
}
func validExpectedRevision(revision int64) bool { return revision >= 1 && revision <= 9007199254740991 }
func (c *Commands) GetPublication(ctx context.Context, credential, dealerID, id string) (PublicationState, error) {
	access, err := c.requirePublication(ctx, credential, dealerID, id, Read)
	if err != nil {
		return PublicationState{}, err
	}
	state, err := c.dependencies.Publications.GetPublication(ctx, access.ActorID, dealerID, id, c.event(ctx, access, id, audit.ResourceViewed))
	return c.publicationResult(ctx, access, state, err, "inventory.publication_viewed")
}
func (c *Commands) PublishRecord(ctx context.Context, credential, dealerID, id string, expected int64) (PublicationState, error) {
	access, err := c.requirePublication(ctx, credential, dealerID, id, Publish)
	if err != nil {
		return PublicationState{}, err
	}
	if !validExpectedRevision(expected) {
		return PublicationState{}, ports.ErrInvalidArgument
	}
	state, err := c.dependencies.Publications.PublishRecord(ctx, access.ActorID, dealerID, id, expected, c.event(ctx, access, id, audit.ResourceUpdated))
	return c.publicationResult(ctx, access, state, err, "inventory.published")
}
func (c *Commands) UnpublishRecord(ctx context.Context, credential, dealerID, id string, expected int64) (PublicationState, error) {
	access, err := c.requirePublication(ctx, credential, dealerID, id, Publish)
	if err != nil {
		return PublicationState{}, err
	}
	if !validExpectedRevision(expected) {
		return PublicationState{}, ports.ErrInvalidArgument
	}
	state, err := c.dependencies.Publications.UnpublishRecord(ctx, access.ActorID, dealerID, id, expected, c.event(ctx, access, id, audit.ResourceUpdated))
	return c.publicationResult(ctx, access, state, err, "inventory.unpublished")
}
func (c *Commands) TransitionRecord(ctx context.Context, credential, dealerID, id string, expected int64, status domain.Status, price *domain.Money, reason string) (PublicationState, error) {
	access, err := c.requirePublication(ctx, credential, dealerID, id, Write)
	if err != nil {
		return PublicationState{}, err
	}
	if !validExpectedRevision(expected) || (price != nil && !c.dependencies.SupportedCurrency(price.Currency)) {
		return PublicationState{}, ports.ErrInvalidArgument
	}
	state, err := c.dependencies.Publications.TransitionRecord(ctx, access.ActorID, dealerID, id, expected, status, price, reason, c.event(ctx, access, id, audit.ResourceUpdated))
	return c.publicationResult(ctx, access, state, err, "inventory.lifecycle_changed")
}
