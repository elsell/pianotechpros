package showroom_test

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	showroomapp "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (m *publicMemory) ReadPublicDirectory(ctx context.Context) ([]showroomapp.DiscoveryShop, error) {
	profile, err := m.ReadPublicProfile(ctx, m.profile.Slug)
	if errors.Is(err, ports.ErrNotFound) {
		return []showroomapp.DiscoveryShop{}, nil
	}
	if err != nil {
		return nil, err
	}
	return []showroomapp.DiscoveryShop{{ID: profile.ID, Slug: profile.Slug, Name: profile.Name}}, nil
}
func (m *publicMemory) ReadPublicCatalog(ctx context.Context, slug string) (showroomapp.DiscoveryCatalog, error) {
	profile, err := m.ReadPublicProfile(ctx, slug)
	if err != nil {
		return showroomapp.DiscoveryCatalog{}, err
	}
	value := showroomapp.DiscoveryCatalog{Shop: showroomapp.DiscoveryShop{ID: profile.ID, Slug: profile.Slug, Name: profile.Name}, Pianos: []showroomapp.DiscoveryPiano{}}
	if piano, visible := m.publication.View(); visible {
		value.Pianos = append(value.Pianos, showroomapp.DiscoveryPiano{ID: piano.ID, DealerID: piano.DealerID, Title: piano.Title})
	}
	return value, nil
}
func TestDiscoveryHTTPIsAnonymousScopedBoundedAndLimited(t *testing.T) {
	repo := memory(t)
	limiter := &budget{remaining: 20}
	h, api := httpserver.New(app.App{}, nil, httpserver.Options{Clock: clock{}, RequestRateLimiter: limiter, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterDiscovery(api, showroomapp.NewDiscovery(repo, nil)) }}})
	for _, path := range []string{"/v1/showroom-discovery", "/v1/showrooms/piano-shop/discovery"} {
		response := httptest.NewRecorder()
		h.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 200 || !strings.Contains(response.Body.String(), `"slug":"piano-shop"`) {
			t.Fatalf("%d %s", response.Code, response.Body.String())
		}
		for _, private := range []string{"PRIVATE-OWNER", "email", "photos", "serial", "price"} {
			if strings.Contains(response.Body.String(), private) {
				t.Fatal("non-discovery data escaped", private)
			}
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("missing no-store")
		}
	}
	for _, path := range []string{"/v1/showroom-discovery", "/v1/showrooms/{slug}/discovery"} {
		if op := api.OpenAPI().Paths[path].Get; op == nil || len(op.Security) != 0 {
			t.Fatal("anonymous contract missing")
		}
	}
	before := repo.reads
	response := httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest("GET", "/v1/showrooms/not_valid/discovery", nil))
	if response.Code != 400 || repo.reads != before {
		t.Fatal("malformed slug reached storage")
	}
	repo.profile.ShowroomPublished = false
	response = httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest("GET", "/v1/showrooms/piano-shop/discovery", nil))
	if response.Code != 404 || strings.Contains(response.Body.String(), "Piano Shop") {
		t.Fatal("hidden showroom exposed")
	}
	repo.profile.ShowroomPublished = true
	repo.failure = errors.New("PRIVATE-STORAGE-DETAIL")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest("GET", "/v1/showroom-discovery", nil))
	if response.Code != 503 || strings.Contains(response.Body.String(), "PRIVATE") {
		t.Fatal("dependency failure exposed")
	}
	limiter.remaining = 0
	before = repo.reads
	response = httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest("GET", "/v1/showroom-discovery", nil))
	if response.Code != 429 || repo.reads != before {
		t.Fatal("discovery bypassed source limiter")
	}
}
func TestDiscoveryHTTPFailsClosedWithoutSourcePolicy(t *testing.T) {
	repo := memory(t)
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterDiscovery(api, showroomapp.NewDiscovery(repo, nil)) }}})
	response := httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest("GET", "/v1/showroom-discovery", nil))
	if response.Code != 503 || repo.reads != 0 {
		t.Fatal("missing limiter permitted discovery")
	}
}
