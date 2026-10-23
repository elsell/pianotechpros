package showroom

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type collectionMemory struct {
	hidden  bool
	reads   int
	failure error
}

func TestCollectionRejectsAuthenticatedInvalidCursorPayload(t *testing.T) {
	for _, change := range []func(*collectionCursor){
		func(p *collectionCursor) { p.Version = 2 },
		func(p *collectionCursor) { p.Query.AfterID = "" },
		func(p *collectionCursor) { p.Query.AfterID = " padded" },
		func(p *collectionCursor) { p.Query.Search = " padded " },
		func(p *collectionCursor) { p.Query.Limit = 101 },
	} {
		repo := &collectionMemory{}
		s := NewCollection(repo, []byte(strings.Repeat("k", 32)), nil)
		seal, err := s.cipher()
		if err != nil {
			t.Fatal(err)
		}
		payload := collectionCursor{Version: 1, Slug: "shop", Query: domain.Query{Limit: 1, AfterID: "a", AfterFeatured: true}}
		change(&payload)
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		nonce := make([]byte, seal.NonceSize())
		token := base64.RawURLEncoding.EncodeToString(seal.Seal(nonce, nonce, body, []byte(collectionContext)))
		if _, err := s.List(context.Background(), "shop", CollectionInput{Limit: 1, Cursor: token}); !errors.Is(err, domain.ErrInvalidQuery) || repo.reads != 0 {
			t.Fatalf("invalid authenticated payload reached storage: %v", err)
		}
	}
}

func TestCollectionNormalizesBindingAndRejectsRotatedKey(t *testing.T) {
	repo := &collectionMemory{}
	s := NewCollection(repo, []byte(strings.Repeat("k", 32)), nil)
	first, err := s.List(context.Background(), "shop", CollectionInput{Limit: 1, Search: " piano "})
	if err != nil {
		t.Fatal(err)
	}
	q := CollectionInput{Limit: 1, Search: "piano", Cursor: first.NextCursor}
	if _, err := s.List(context.Background(), "shop", q); err != nil {
		t.Fatal(err)
	}
	before := repo.reads
	if _, err := NewCollection(repo, []byte(strings.Repeat("x", 32)), nil).List(context.Background(), "shop", q); !errors.Is(err, domain.ErrInvalidQuery) || repo.reads != before {
		t.Fatalf("rotated key accepted: %v", err)
	}
}

func (m *collectionMemory) ListPublicPianos(_ context.Context, slug string, q domain.Query) (Page, error) {
	m.reads++
	if m.hidden || slug != "shop" {
		return Page{}, ports.ErrNotFound
	}
	records := []inventory.PublicListing{{ID: "a", DealerID: "dealer", Featured: true}, {ID: "b", DealerID: "dealer"}}
	page := Page{Profile: domain.Profile{ID: "dealer", Slug: slug}}
	for _, p := range records {
		if q.AfterID != "" && (p.Featured && !q.AfterFeatured || p.Featured == q.AfterFeatured && p.ID <= q.AfterID) {
			continue
		}
		page.Pianos = append(page.Pianos, p)
	}
	if len(page.Pianos) > q.Limit {
		page.HasMore = true
		page.Pianos = page.Pianos[:q.Limit]
	}
	return page, m.failure
}

func TestCollectionContinuationAndVisibility(t *testing.T) {
	repo := &collectionMemory{}
	key := []byte(strings.Repeat("k", 32))
	service := NewCollection(repo, key, nil)
	key[0] = 'x'
	first, err := service.List(context.Background(), "shop", CollectionInput{Limit: 1})
	if err != nil || len(first.Pianos) != 1 || first.Pianos[0].ID != "a" || first.NextCursor == "" {
		t.Fatalf("first: %+v %v", first, err)
	}
	second, err := service.List(context.Background(), "shop", CollectionInput{Limit: 1, Cursor: first.NextCursor})
	if err != nil || len(second.Pianos) != 1 || second.Pianos[0].ID != "b" || second.NextCursor != "" {
		t.Fatalf("second: %+v %v", second, err)
	}
	repo.hidden = true
	result, err := service.List(context.Background(), "shop", CollectionInput{Limit: 1, Cursor: first.NextCursor})
	if !errors.Is(err, ports.ErrNotFound) || result.Profile.ID != "" || len(result.Pianos) != 0 || result.NextCursor != "" {
		t.Fatalf("cursor exposed hidden shop: %+v %v", result, err)
	}
}

func TestCollectionRejectsTamperingAndChangedBindingsBeforeRead(t *testing.T) {
	for name, change := range map[string]func(*CollectionInput, *string){
		"slug":         func(_ *CollectionInput, s *string) { *s = "other" },
		"search":       func(q *CollectionInput, _ *string) { q.Search = "other" },
		"form":         func(q *CollectionInput, _ *string) { q.Form = inventory.Grand },
		"availability": func(q *CollectionInput, _ *string) { q.Availability = "sold" },
		"currency":     func(q *CollectionInput, _ *string) { q.Currency = "EUR" },
		"min":          func(q *CollectionInput, _ *string) { v := int64(1); q.MinPrice = &v; q.Currency = "USD" },
		"max":          func(q *CollectionInput, _ *string) { v := int64(2); q.MaxPrice = &v; q.Currency = "USD" },
		"size":         func(q *CollectionInput, _ *string) { q.Limit = 2 },
		"tamper":       func(q *CollectionInput, _ *string) { q.Cursor = "A" + q.Cursor },
		"oversize":     func(q *CollectionInput, _ *string) { q.Cursor = strings.Repeat("a", 4097) },
	} {
		t.Run(name, func(t *testing.T) {
			repo := &collectionMemory{}
			s := NewCollection(repo, []byte(strings.Repeat("k", 32)), nil)
			first, err := s.List(context.Background(), "shop", CollectionInput{Limit: 1})
			if err != nil {
				t.Fatal(err)
			}
			q := CollectionInput{Limit: 1, Cursor: first.NextCursor}
			slug := "shop"
			change(&q, &slug)
			result, err := s.List(context.Background(), slug, q)
			if !errors.Is(err, domain.ErrInvalidQuery) || repo.reads != 1 || result.NextCursor != "" || result.Profile.ID != "" {
				t.Fatalf("invalid request reached storage: %+v %v reads=%d", result, err, repo.reads)
			}
		})
	}
}

func TestCollectionFailsClosedAndDiscardsPartialResults(t *testing.T) {
	for _, s := range []*CollectionService{NewCollection(nil, []byte(strings.Repeat("k", 32)), nil), NewCollection(&collectionMemory{}, nil, nil)} {
		if _, err := s.List(context.Background(), "shop", CollectionInput{}); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
			t.Fatal(err)
		}
	}
	repo := &collectionMemory{failure: errors.New("dependency unavailable")}
	s := NewCollection(repo, []byte(strings.Repeat("k", 32)), nil)
	result, err := s.List(context.Background(), "shop", CollectionInput{Limit: 1})
	if err == nil || result.Profile.ID != "" || len(result.Pianos) != 0 || result.NextCursor != "" {
		t.Fatalf("partial result: %+v %v", result, err)
	}
	repo.failure = nil
	result, err = s.List(context.Background(), "shop", CollectionInput{})
	if err != nil || len(result.Pianos) != 2 || result.NextCursor != "" {
		t.Fatalf("default limit: %+v %v", result, err)
	}
}
