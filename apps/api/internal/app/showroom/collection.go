package showroom

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"reflect"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type CollectionInput struct {
	Search                 string
	Form                   inventory.Form
	Availability, Currency string
	MinPrice, MaxPrice     *int64
	Limit                  int
	Cursor                 string
}
type Collection struct {
	Profile    domain.Profile
	Pianos     []inventory.PublicListing
	NextCursor string
}
type CollectionReader interface {
	List(context.Context, string, CollectionInput) (Collection, error)
}
type CollectionService struct {
	repository CollectionRepository
	key        []byte
	probe      ports.Probe
}

func NewCollection(repository CollectionRepository, key []byte, probe ports.Probe) *CollectionService {
	return &CollectionService{repository: repository, key: append([]byte(nil), key...), probe: probe}
}

const collectionContext = "pianotechpros/showroom-cursor/v1"

type collectionCursor struct {
	Version int
	Slug    string
	Query   domain.Query
}

func (s *CollectionService) cipher() (cipher.AEAD, error) {
	if len(s.key) < 32 {
		return nil, ports.ErrAuthorizationPolicyNotConfigured
	}
	derive := hmac.New(sha256.New, s.key)
	_, _ = derive.Write([]byte(collectionContext))
	block, err := aes.NewCipher(derive.Sum(nil))
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (s *CollectionService) List(ctx context.Context, slug string, input CollectionInput) (value Collection, err error) {
	defer func() {
		outcome := "succeeded"
		if err != nil {
			value = Collection{}
			outcome = "failed"
		}
		if s.probe != nil {
			s.probe.Observe(ctx, ports.ProbeEvent{Name: "showroom.pianos.listed", Outcome: outcome, CorrelationID: shared.CorrelationID(ctx)})
		}
	}()
	if s.repository == nil {
		return value, ports.ErrAuthorizationPolicyNotConfigured
	}
	seal, err := s.cipher()
	if err != nil {
		return value, err
	}
	if slug == "" || len(slug) > 80 || !utf8.ValidString(slug) || strings.TrimSpace(slug) != slug || strings.IndexFunc(slug, unicode.IsControl) >= 0 {
		return value, domain.ErrInvalidQuery
	}
	limit := input.Limit
	if limit == 0 {
		limit = 30
	}
	q, err := domain.ValidateQuery(domain.Query{Search: input.Search, Form: input.Form, Availability: input.Availability, Currency: input.Currency, MinPrice: input.MinPrice, MaxPrice: input.MaxPrice, Limit: limit})
	if err != nil {
		return value, domain.ErrInvalidQuery
	}
	if input.Cursor != "" {
		if len(input.Cursor) > 4096 {
			return value, domain.ErrInvalidQuery
		}
		raw, err := base64.RawURLEncoding.DecodeString(input.Cursor)
		if err != nil || len(raw) < seal.NonceSize()+seal.Overhead() {
			return value, domain.ErrInvalidQuery
		}
		body, err := seal.Open(nil, raw[:seal.NonceSize()], raw[seal.NonceSize():], []byte(collectionContext))
		if err != nil {
			return value, domain.ErrInvalidQuery
		}
		var payload collectionCursor
		if json.Unmarshal(body, &payload) != nil || payload.Version != 1 || payload.Slug != slug || payload.Query.AfterID == "" {
			return value, domain.ErrInvalidQuery
		}
		validated, err := domain.ValidateQuery(payload.Query)
		if err != nil || !reflect.DeepEqual(validated, payload.Query) {
			return value, domain.ErrInvalidQuery
		}
		binding := validated
		binding.AfterID = ""
		binding.AfterFeatured = false
		if !reflect.DeepEqual(binding, q) {
			return value, domain.ErrInvalidQuery
		}
		q.AfterID, q.AfterFeatured = validated.AfterID, validated.AfterFeatured
	}
	page, err := s.repository.ListPublicPianos(ctx, slug, q)
	if err != nil {
		return value, err
	}
	if page.Profile.ID == "" || page.Profile.Slug != slug || len(page.Pianos) > q.Limit || page.HasMore && len(page.Pianos) == 0 {
		return value, ports.ErrInvalidArgument
	}
	previousID, previousFeatured := q.AfterID, q.AfterFeatured
	for _, p := range page.Pianos {
		candidate := q
		candidate.AfterID = p.ID
		candidate.AfterFeatured = p.Featured
		if _, err := domain.ValidateQuery(candidate); err != nil || p.ID == "" || p.DealerID != page.Profile.ID {
			return value, ports.ErrInvalidArgument
		}
		if previousID != "" && (p.Featured && !previousFeatured || p.Featured == previousFeatured && p.ID <= previousID) {
			return value, ports.ErrInvalidArgument
		}
		previousID, previousFeatured = p.ID, p.Featured
	}
	value.Profile, value.Pianos = page.Profile, page.Pianos
	if page.HasMore {
		q.AfterID, q.AfterFeatured = previousID, previousFeatured
		body, err := json.Marshal(collectionCursor{Version: 1, Slug: slug, Query: q})
		if err != nil {
			return value, err
		}
		nonce := make([]byte, seal.NonceSize())
		if _, err := rand.Read(nonce); err != nil {
			return value, err
		}
		value.NextCursor = base64.RawURLEncoding.EncodeToString(seal.Seal(nonce, nonce, body, []byte(collectionContext)))
	}
	return value, nil
}
