package inventory

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"time"
)

func (c *Commands) scanEvent(ctx context.Context, access Access, id string, action audit.Action) audit.Event {
	event := shared.NewAuditEvent(ctx, c.dependencies.Access.Clock, access.OwnerUserID, access.ActorID, action, "inventory_scan", id, audit.Succeeded)
	event.OccurredAt = event.OccurredAt.UTC().Truncate(time.Microsecond)
	return event
}
func (c *Commands) scanFailure(ctx context.Context, access Access, err error) error {
	if errors.Is(err, ports.ErrNotFound) {
		return c.policy.deny(ctx, access.ActorID, ports.ErrNotFound)
	}
	return ErrScanUnavailable
}
func validScanResult(label domain.ScanLabel, dealerID string) bool {
	checked, err := domain.NewScanLabel(label.DealerID, label.RecordID, label.CreatedBy, label.Token, label.CreatedAt)
	return err == nil && checked == label && label.DealerID == dealerID && validID(label.RecordID)
}
func (c *Commands) EnsureScanLabel(ctx context.Context, credential, dealerID, id string) (domain.ScanLabel, error) {
	access, err := c.require(ctx, credential, dealerID, Read)
	if err != nil {
		return domain.ScanLabel{}, err
	}
	if c.dependencies.Scans == nil || c.dependencies.ScanTokens == nil {
		return domain.ScanLabel{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !validID(id) {
		return domain.ScanLabel{}, ports.ErrInvalidArgument
	}
	token, err := c.dependencies.ScanTokens.NewScanToken()
	if err != nil || !token.Valid() {
		return domain.ScanLabel{}, ErrScanUnavailable
	}
	event := c.scanEvent(ctx, access, id, audit.ResourceCreated)
	candidate, err := domain.NewScanLabel(dealerID, id, access.ActorID, token, event.OccurredAt)
	if err != nil {
		return domain.ScanLabel{}, ErrScanUnavailable
	}
	label, reused, err := c.dependencies.Scans.EnsureScanLabel(ctx, access.ActorID, candidate, event)
	if err != nil {
		return domain.ScanLabel{}, c.scanFailure(ctx, access, err)
	}
	if !validScanResult(label, dealerID) || label.RecordID != id || label.CreatedAt.After(event.OccurredAt) || !reused && label != candidate {
		return domain.ScanLabel{}, ErrScanUnavailable
	}
	if c.dependencies.Probe != nil {
		c.dependencies.Probe.Observe(ctx, ports.ProbeEvent{Name: "inventory.scan_label_read", Outcome: "succeeded", CorrelationID: shared.CorrelationID(ctx)})
	}
	return label, nil
}
func (c *Commands) ResolveScanLabel(ctx context.Context, credential, dealerID, encoded string) (domain.ScanLabel, error) {
	access, err := c.require(ctx, credential, dealerID, Read)
	if err != nil {
		return domain.ScanLabel{}, err
	}
	if c.dependencies.Scans == nil {
		return domain.ScanLabel{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	token, err := domain.ParseScanToken(encoded)
	if err != nil {
		return domain.ScanLabel{}, ports.ErrInvalidArgument
	}
	label, err := c.dependencies.Scans.ResolveScanLabel(ctx, access.ActorID, dealerID, token, c.scanEvent(ctx, access, dealerID, audit.ResourceViewed))
	if err != nil {
		return domain.ScanLabel{}, c.scanFailure(ctx, access, err)
	}
	if !validScanResult(label, dealerID) || label.Token != token {
		return domain.ScanLabel{}, ErrScanUnavailable
	}
	if c.dependencies.Probe != nil {
		c.dependencies.Probe.Observe(ctx, ports.ProbeEvent{Name: "inventory.scan_resolved", Outcome: "succeeded", CorrelationID: shared.CorrelationID(ctx)})
	}
	return label, nil
}
