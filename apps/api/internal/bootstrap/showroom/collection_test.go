package showroom_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	showroomapp "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
)

func (m *publicMemory) ListPublicPianos(_ context.Context, slug string, q domain.Query) (showroomapp.Page, error) {
	m.reads++
	s, err := m.showroom(slug)
	if err != nil {
		return showroomapp.Page{}, err
	}
	profile, err := s.Profile()
	if err != nil {
		return showroomapp.Page{}, err
	}
	p, err := s.Listing(m.publication)
	if err != nil {
		return showroomapp.Page{}, err
	}
	page := showroomapp.Page{Profile: profile, Pianos: []inventory.PublicListing{}}
	if q.AfterID == "" && (q.Currency == "" || (p.Price != nil && p.Price.Currency == q.Currency && (q.MinPrice == nil || p.Price.MinorUnits >= *q.MinPrice) && (q.MaxPrice == nil || p.Price.MinorUnits <= *q.MaxPrice))) {
		page.Pianos = append(page.Pianos, p)
	}
	return page, m.failure
}

func TestPublicCollectionHTTPFiltersAndPolicy(t *testing.T) {
	repo := memory(t)
	limiter := &budget{remaining: 20}
	h, api := httpserver.New(app.App{}, nil, httpserver.Options{Clock: clock{}, RequestRateLimiter: limiter, DomainRegistrations: []func(huma.API){func(api huma.API) {
		routes.RegisterCollection(api, showroomapp.NewCollection(repo, []byte(strings.Repeat("k", 32)), nil))
	}}})
	for _, tt := range []struct {
		query         string
		status, count int
	}{
		{"", 200, 1}, {"?currency=USD&minPrice=0&maxPrice=0", 200, 0},
		{"?minPrice=0", 400, 0}, {"?cursor=tampered", 400, 0}, {"?limit=101", 422, 0}, {"?minPrice=-1&currency=USD", 422, 0},
	} {
		t.Run(tt.query, func(t *testing.T) {
			before := repo.reads
			r := httptest.NewRecorder()
			h.ServeHTTP(r, httptest.NewRequest("GET", "/v1/showrooms/piano-shop/pianos"+tt.query, nil))
			if r.Code != tt.status {
				t.Fatalf("%d %s", r.Code, r.Body.String())
			}
			if tt.status == 200 {
				var body struct {
					Data struct {
						Profile struct {
							ID string `json:"id"`
						} `json:"profile"`
						Pianos []json.RawMessage `json:"pianos"`
					} `json:"data"`
				}
				if err := json.Unmarshal(r.Body.Bytes(), &body); err != nil || body.Data.Profile.ID != "shop" || len(body.Data.Pianos) != tt.count {
					t.Fatalf("body: %s %v", r.Body.String(), err)
				}
			} else if repo.reads != before {
				t.Fatal("invalid input reached repository")
			}
			if r.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("cache policy missing")
			}
		})
	}
	op := api.OpenAPI().Paths["/v1/showrooms/{slug}/pianos"].Get
	if op == nil || len(op.Security) != 0 {
		t.Fatal("anonymous contract missing")
	}
	listing, _ := repo.publication.View()
	listing.Price = &inventory.Money{MinorUnits: 1, Currency: "USD"}
	var err error
	repo.publication, err = inventory.RestorePublication(inventory.PublicationState{Visible: true, AppliedRevision: 2, Snapshot: listing})
	if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		query string
		want  bool
	}{{"?currency=USD", true}, {"?currency=USD&maxPrice=0", false}} {
		r := httptest.NewRecorder()
		h.ServeHTTP(r, httptest.NewRequest("GET", "/v1/showrooms/piano-shop/pianos"+tt.query, nil))
		if r.Code != 200 || strings.Contains(r.Body.String(), `"stock_number":"STOCK-1"`) != tt.want {
			t.Fatalf("explicit zero lost: %s", r.Body.String())
		}
	}
	limiter.remaining = 0
	before := repo.reads
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("GET", "/v1/showrooms/piano-shop/pianos", nil))
	if r.Code != 429 || repo.reads != before {
		t.Fatal("unlimited collection")
	}
}

func TestPublicCollectionMissingSourcePolicyFailsBeforeStorage(t *testing.T) {
	repo := memory(t)
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) {
		routes.RegisterCollection(api, showroomapp.NewCollection(repo, []byte(strings.Repeat("k", 32)), nil))
	}}})
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("GET", "/v1/showrooms/piano-shop/pianos", nil))
	if r.Code != 503 || repo.reads != 0 {
		t.Fatal("missing source policy reached storage")
	}
}
