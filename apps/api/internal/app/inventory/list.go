package inventory

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type ListInput struct {
	Search          string
	Status          domain.Status
	IncludeInactive bool
	Limit           int
	Cursor          string
}
type listCursor struct {
	Version       int
	Actor, Dealer string
	Query         domain.ListQuery
}

const listCursorContext = "pianotechpros/inventory-cursor/v1"

func (c *Commands) listCipher() (cipher.AEAD, error) {
	if len(c.dependencies.CursorSigningKey) < 32 {
		return nil, ports.ErrAuthorizationPolicyNotConfigured
	}
	derive := hmac.New(sha256.New, c.dependencies.CursorSigningKey)
	_, _ = derive.Write([]byte(listCursorContext))
	block, err := aes.NewCipher(derive.Sum(nil))
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func sealListCursor(seal cipher.AEAD, payload listCursor) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, seal.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(seal.Seal(nonce, nonce, body, []byte(listCursorContext))), nil
}
func openListCursor(seal cipher.AEAD, value string) (listCursor, error) {
	invalid := listCursor{}
	if len(value) > 4096 {
		return invalid, ports.ErrInvalidArgument
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) < seal.NonceSize()+seal.Overhead() {
		return invalid, ports.ErrInvalidArgument
	}
	body, err := seal.Open(nil, raw[:seal.NonceSize()], raw[seal.NonceSize():], []byte(listCursorContext))
	if err != nil {
		return invalid, ports.ErrInvalidArgument
	}
	var payload listCursor
	if json.Unmarshal(body, &payload) != nil || payload.Version != 1 || payload.Query.AfterID == "" {
		return invalid, ports.ErrInvalidArgument
	}
	if _, err := domain.ValidateListQuery(payload.Query); err != nil {
		return invalid, ports.ErrInvalidArgument
	}
	return payload, nil
}
func (c *Commands) listRecords(ctx context.Context, credential, dealerID string, input ListInput) ([]domain.Record, string, error) {
	access, err := c.require(ctx, credential, dealerID, Read)
	if err != nil {
		return nil, "", err
	}
	if c.dependencies.Lists == nil {
		return nil, "", ports.ErrAuthorizationPolicyNotConfigured
	}
	seal, err := c.listCipher()
	if err != nil {
		return nil, "", err
	}
	limit := input.Limit
	if limit == 0 {
		limit = 30
	}
	now := c.dependencies.Access.Clock.Now().UTC()
	query, err := domain.ValidateListQuery(domain.ListQuery{Search: input.Search, Status: input.Status, IncludeInactive: input.IncludeInactive, Limit: limit, Snapshot: now})
	if err != nil {
		return nil, "", ports.ErrInvalidArgument
	}
	if input.Cursor != "" {
		payload, err := openListCursor(seal, input.Cursor)
		if err != nil || payload.Actor != access.ActorID || payload.Dealer != dealerID || payload.Query.Search != query.Search || payload.Query.Status != query.Status || payload.Query.IncludeInactive != query.IncludeInactive || payload.Query.Snapshot.After(now) {
			return nil, "", ports.ErrInvalidArgument
		}
		query.AfterID = payload.Query.AfterID
		query.AfterCreated = payload.Query.AfterCreated
		query.AfterFeatured = payload.Query.AfterFeatured
		query.Snapshot = payload.Query.Snapshot
	}
	page, err := c.dependencies.Lists.ListRecords(ctx, access.ActorID, dealerID, query, c.event(ctx, access, dealerID, audit.ResourceListed))
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = c.policy.deny(ctx, access.ActorID, err)
		}
		return nil, "", err
	}
	if len(page.Records) > limit || page.HasMore && len(page.Records) == 0 {
		return nil, "", ports.ErrInvalidArgument
	}
	for _, record := range page.Records {
		if record.DealerID != dealerID || !validID(record.ID) {
			return nil, "", ports.ErrInvalidArgument
		}
	}
	next := ""
	if page.HasMore {
		last := page.Records[len(page.Records)-1]
		query.AfterID = last.ID
		query.AfterCreated = last.CreatedAt
		query.AfterFeatured = last.Featured
		next, err = sealListCursor(seal, listCursor{Version: 1, Actor: access.ActorID, Dealer: dealerID, Query: query})
		if err != nil {
			return nil, "", err
		}
	}
	if c.dependencies.Probe != nil {
		c.dependencies.Probe.Observe(ctx, ports.ProbeEvent{Name: "inventory.listed", Outcome: "succeeded", CorrelationID: shared.CorrelationID(ctx)})
	}
	return page.Records, next, nil
}

func (c *Commands) ListRecords(ctx context.Context, credential, dealerID, search string, status domain.Status, includeInactive bool, cursor string, limit int) ([]domain.Record, string, error) {
	return c.listRecords(ctx, credential, dealerID, ListInput{Search: search, Status: status, IncludeInactive: includeInactive, Cursor: cursor, Limit: limit})
}
