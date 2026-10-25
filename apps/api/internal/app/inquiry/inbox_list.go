package inquiry

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

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

const inboxCursorContext = "pianotechpros/inquiry-cursor/v1"

type inboxCursor struct {
	Version       int
	Actor, Dealer string
	Query         domain.ListQuery
}

func (i *Inbox) cursorCipher() (cipher.AEAD, error) {
	if len(i.dependencies.CursorSigningKey) < 32 {
		return nil, ports.ErrAuthorizationPolicyNotConfigured
	}
	derive := hmac.New(sha256.New, i.dependencies.CursorSigningKey)
	_, _ = derive.Write([]byte(inboxCursorContext))
	block, err := aes.NewCipher(derive.Sum(nil))
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func sealInboxCursor(seal cipher.AEAD, payload inboxCursor) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, seal.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(seal.Seal(nonce, nonce, body, []byte(inboxCursorContext))), nil
}
func openInboxCursor(seal cipher.AEAD, value string) (inboxCursor, error) {
	invalid := inboxCursor{}
	if len(value) > 4096 {
		return invalid, ports.ErrInvalidArgument
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) < seal.NonceSize()+seal.Overhead() {
		return invalid, ports.ErrInvalidArgument
	}
	body, err := seal.Open(nil, raw[:seal.NonceSize()], raw[seal.NonceSize():], []byte(inboxCursorContext))
	if err != nil {
		return invalid, ports.ErrInvalidArgument
	}
	var payload inboxCursor
	if json.Unmarshal(body, &payload) != nil || payload.Version != 1 || payload.Query.AfterID == "" {
		return invalid, ports.ErrInvalidArgument
	}
	if _, err := domain.ValidateListQuery(payload.Query); err != nil {
		return invalid, ports.ErrInvalidArgument
	}
	return payload, nil
}
func (i *Inbox) List(ctx context.Context, credential, dealerID, cursor string, limit int) (entries []domain.Inquiry, next string, err error) {
	defer func() { i.observe(ctx, "inquiry.listed", err) }()
	access, err := i.require(ctx, credential, dealerID)
	if err != nil {
		return nil, "", err
	}
	seal, err := i.cursorCipher()
	if err != nil {
		return nil, "", err
	}
	if limit == 0 {
		limit = 30
	}
	now := i.dependencies.Access.Clock.Now().UTC()
	query, err := domain.ValidateListQuery(domain.ListQuery{Limit: limit, Snapshot: now})
	if err != nil {
		return nil, "", ports.ErrInvalidArgument
	}
	if cursor != "" {
		payload, err := openInboxCursor(seal, cursor)
		if err != nil || payload.Actor != access.ActorID || payload.Dealer != dealerID || payload.Query.Snapshot.After(now) {
			return nil, "", ports.ErrInvalidArgument
		}
		query.AfterID, query.AfterCreated, query.Snapshot = payload.Query.AfterID, payload.Query.AfterCreated, payload.Query.Snapshot
	}
	page, err := i.dependencies.Repository.ListInboxInquiries(ctx, access.ActorID, dealerID, query, i.event(ctx, access, dealerID, audit.ResourceListed))
	if err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			err = i.policy.deny(ctx, access.ActorID, err)
		}
		return nil, "", err
	}
	if len(page.Inquiries) > limit || page.HasMore && len(page.Inquiries) == 0 {
		return nil, "", ports.ErrInvalidArgument
	}
	previousID, previousAt := query.AfterID, query.AfterCreated
	for _, entry := range page.Inquiries {
		state := entry.State()
		if _, err := domain.Restore(state); err != nil {
			return nil, "", err
		}
		if state.Piano.DealerID != dealerID || state.CreatedAt.After(query.Snapshot) || previousID != "" && (state.CreatedAt.After(previousAt) || state.CreatedAt.Equal(previousAt) && state.ID >= previousID) {
			return nil, "", ports.ErrInvalidArgument
		}
		previousID, previousAt = state.ID, state.CreatedAt
	}
	if page.HasMore {
		query.AfterID, query.AfterCreated = previousID, previousAt
		next, err = sealInboxCursor(seal, inboxCursor{Version: 1, Actor: access.ActorID, Dealer: dealerID, Query: query})
		if err != nil {
			return nil, "", err
		}
	}
	return page.Inquiries, next, nil
}
