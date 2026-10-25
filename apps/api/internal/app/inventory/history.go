package inventory

import (
	"context"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

const historyCursorContext = "pianotechpros/inventory-history-cursor/v1"

type historyCursor struct {
	Version               int
	Actor, Dealer, Record string
	Upper, Before         int64
}

func sealHistoryCursor(seal cipher.AEAD, payload historyCursor) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, seal.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(seal.Seal(nonce, nonce, body, []byte(historyCursorContext))), nil
}
func openHistoryCursor(seal cipher.AEAD, value string) (historyCursor, error) {
	invalid := historyCursor{}
	if len(value) > 4096 {
		return invalid, ports.ErrInvalidArgument
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) < seal.NonceSize()+seal.Overhead() {
		return invalid, ports.ErrInvalidArgument
	}
	body, err := seal.Open(nil, raw[:seal.NonceSize()], raw[seal.NonceSize():], []byte(historyCursorContext))
	if err != nil {
		return invalid, ports.ErrInvalidArgument
	}
	var payload historyCursor
	if json.Unmarshal(body, &payload) != nil || payload.Version != 1 || payload.Upper < 1 || payload.Before < 1 || (domain.HistoryQuery{Limit: 1, UpperRevision: payload.Upper, BeforeRevision: payload.Before}).Validate() != nil {
		return invalid, ports.ErrInvalidArgument
	}
	return payload, nil
}
func (c *Commands) ListHistory(ctx context.Context, credential, dealerID, id, cursor string, limit int) ([]domain.History, string, error) {
	access, err := c.require(ctx, credential, dealerID, Read)
	if err != nil {
		return nil, "", err
	}
	if c.dependencies.History == nil {
		return nil, "", ports.ErrAuthorizationPolicyNotConfigured
	}
	if !validID(id) {
		return nil, "", ports.ErrInvalidArgument
	}
	if limit == 0 {
		limit = 20
	}
	query := domain.HistoryQuery{Limit: limit}
	if query.Validate() != nil {
		return nil, "", ports.ErrInvalidArgument
	}
	seal, err := c.listCipher()
	if err != nil {
		return nil, "", err
	}
	if cursor != "" {
		payload, err := openHistoryCursor(seal, cursor)
		if err != nil || payload.Actor != access.ActorID || payload.Dealer != dealerID || payload.Record != id {
			return nil, "", ports.ErrInvalidArgument
		}
		query.UpperRevision = payload.Upper
		query.BeforeRevision = payload.Before
	}
	page, err := c.dependencies.History.ListHistory(ctx, access.ActorID, dealerID, id, query, c.event(ctx, access, id, audit.ResourceListed))
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = c.policy.deny(ctx, access.ActorID, err)
		}
		return nil, "", err
	}
	if page.UpperRevision < 1 || page.UpperRevision > 9007199254740991 || query.UpperRevision != 0 && page.UpperRevision != query.UpperRevision || len(page.Entries) > limit || page.HasMore && len(page.Entries) != limit {
		return nil, "", ports.ErrInvalidArgument
	}
	expected := page.UpperRevision
	if query.BeforeRevision > 0 {
		expected = query.BeforeRevision - 1
	}
	if len(page.Entries) == 0 && expected > 0 {
		return nil, "", ports.ErrInvalidArgument
	}
	for _, entry := range page.Entries {
		if entry.RecordID != id || entry.DealerID != dealerID || entry.Revision != expected || entry.Revision < 1 {
			return nil, "", ports.ErrInvalidArgument
		}
		expected--
	}
	if page.HasMore != (expected > 0) {
		return nil, "", ports.ErrInvalidArgument
	}
	next := ""
	if page.HasMore {
		next, err = sealHistoryCursor(seal, historyCursor{Version: 1, Actor: access.ActorID, Dealer: dealerID, Record: id, Upper: page.UpperRevision, Before: page.Entries[len(page.Entries)-1].Revision})
		if err != nil {
			return nil, "", err
		}
	}
	if c.dependencies.Probe != nil {
		c.dependencies.Probe.Observe(ctx, ports.ProbeEvent{Name: "inventory.history_listed", Outcome: "succeeded", CorrelationID: shared.CorrelationID(ctx)})
	}
	return page.Entries, next, nil
}
