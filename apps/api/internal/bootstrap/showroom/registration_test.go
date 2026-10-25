package showroom_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/jpeg"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	showroomapp "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	bootstrap "github.com/elsell/pianotechpros/apps/api/internal/bootstrap/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type clock struct{}

func (clock) Now() time.Time { return time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC) }

type budget struct {
	remaining int
	sources   []string
}

func (b *budget) Allow(source string, _ time.Time) bool {
	b.sources = append(b.sources, source)
	if b.remaining == 0 {
		return false
	}
	b.remaining--
	return true
}

type probes struct{ events []ports.ProbeEvent }

func (p *probes) Observe(_ context.Context, e ports.ProbeEvent) { p.events = append(p.events, e) }

type publicMemory struct {
	profile     dealer.Entity
	publication inventory.Publication
	image       ports.ProcessedPhoto
	reads       int
	failure     error
}

func memory(t *testing.T) *publicMemory {
	t.Helper()
	d, err := dealer.New("shop", "PRIVATE-OWNER", dealer.Attributes{Name: "Piano Shop", Slug: "piano-shop", Email: "shop@example.com", AccentColor: "#123456", ShowroomPublished: true})
	if err != nil {
		t.Fatal(err)
	}
	p, err := inventory.RestorePublication(inventory.PublicationState{Visible: true, AppliedRevision: 2, Snapshot: inventory.PublicListing{ID: "piano", DealerID: "shop", PublicationRevision: 2, Status: inventory.Available, StockNumber: "STOCK-1", Title: "Published piano", Form: inventory.Grand, Condition: inventory.Used, Photos: []inventory.PublicPhoto{{ID: "photo", AltText: "Piano"}}}})
	if err != nil {
		t.Fatal(err)
	}
	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	return &publicMemory{profile: d, publication: p, image: ports.ProcessedPhoto{JPEG: data.Bytes(), Width: 2, Height: 2}}
}
func (m *publicMemory) showroom(slug string) (domain.Showroom, error) {
	if slug != m.profile.Slug {
		return domain.Showroom{}, ports.ErrNotFound
	}
	s, err := domain.New(m.profile)
	if errors.Is(err, domain.ErrUnavailable) {
		return s, ports.ErrNotFound
	}
	return s, err
}
func (m *publicMemory) ReadPublicProfile(_ context.Context, slug string) (domain.Profile, error) {
	m.reads++
	s, err := m.showroom(slug)
	if err != nil {
		return domain.Profile{}, err
	}
	p, err := s.Profile()
	if m.failure != nil {
		return p, m.failure
	}
	return p, err
}
func (m *publicMemory) ReadPublicListing(_ context.Context, slug, id string) (showroomapp.Listing, error) {
	m.reads++
	s, err := m.showroom(slug)
	if err != nil {
		return showroomapp.Listing{}, err
	}
	p, err := s.Listing(m.publication)
	if err != nil || p.ID != id {
		return showroomapp.Listing{}, ports.ErrNotFound
	}
	profile, _ := s.Profile()
	return showroomapp.Listing{Profile: profile, Piano: p}, m.failure
}
func (m *publicMemory) ReadPublicPhoto(_ context.Context, slug, id, photo string) (ports.ProcessedPhoto, error) {
	m.reads++
	s, err := m.showroom(slug)
	if err != nil {
		return ports.ProcessedPhoto{}, err
	}
	p, err := s.Listing(m.publication)
	if err != nil || p.ID != id {
		return ports.ProcessedPhoto{}, ports.ErrNotFound
	}
	if _, err = s.Photo(m.publication, photo); err != nil {
		return ports.ProcessedPhoto{}, ports.ErrNotFound
	}
	return m.image, m.failure
}

func TestPublicRoutesAreAnonymousAllowlistedAndLimited(t *testing.T) {
	repo := memory(t)
	limiter := &budget{remaining: 10}
	probe := &probes{}
	service := showroomapp.New(repo, probe)
	h, api := httpserver.New(app.App{}, nil, httpserver.Options{Clock: clock{}, RequestRateLimiter: limiter, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, service) }}})
	paths := []string{"/v1/showrooms/piano-shop", "/v1/showrooms/piano-shop/pianos/piano", "/v1/showrooms/piano-shop/pianos/piano/photos/photo"}
	for i, path := range paths {
		req := httptest.NewRequest("GET", path, nil)
		req.RemoteAddr = "192.0.2.10:1234"
		req.Header.Set("Authorization", "Bearer arbitrary-does-not-authorize")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != 200 {
			t.Fatalf("%s: %d %s", path, res.Code, res.Body.String())
		}
		for key, value := range map[string]string{"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"} {
			if res.Header().Get(key) != value {
				t.Fatalf("missing %s", key)
			}
		}
		if i == 2 {
			if res.Header().Get("Content-Type") != "image/jpeg" || !bytes.Equal(res.Body.Bytes(), repo.image.JPEG) {
				t.Fatal("photo contract")
			}
		} else {
			for _, private := range []string{"PRIVATE", "owner_user_id", "private_notes", "serial", "acquisition_cost", "sale_price", "location", "ShowroomPublished"} {
				if strings.Contains(res.Body.String(), private) {
					t.Fatalf("leaked %s", private)
				}
			}
		}
	}
	if repo.reads != 3 || len(limiter.sources) != 3 {
		t.Fatal("missing source policy")
	}
	if len(probe.events) < 3 {
		t.Fatal("missing domain probes")
	}
	for path, item := range api.OpenAPI().Paths {
		if strings.HasPrefix(path, "/v1/showrooms/") {
			if len(item.Get.Security) != 0 {
				t.Fatal("public operation requires identity")
			}
		}
	}
	photo := api.OpenAPI().Paths["/v1/showrooms/{slug}/pianos/{id}/photos/{photoID}"].Get
	if photo.Responses["200"].Content["image/jpeg"].Schema.Format != "binary" {
		t.Fatal("missing binary contract")
	}
	for _, name := range []string{"PublicShowroomProfile", "PublicListing"} {
		for _, field := range []string{"owner_user_id", "private_notes", "serial", "sale_price", "location"} {
			if api.OpenAPI().Components.Schemas.Map()[name].Properties[field] != nil {
				t.Fatalf("private contract field %s", field)
			}
		}
	}
}

func TestPublicRoutesFailClosedWithoutLimiterOrRepository(t *testing.T) {
	for _, missing := range []string{"limiter", "clock", "repository"} {
		t.Run(missing, func(t *testing.T) {
			repo := memory(t)
			options := httpserver.Options{Clock: clock{}, RequestRateLimiter: &budget{remaining: 10}}
			options.DomainRegistrations = []func(huma.API){func(api huma.API) { routes.Register(api, showroomapp.New(repo, nil)) }}
			if missing == "limiter" {
				options.RequestRateLimiter = nil
			}
			if missing == "clock" {
				options.Clock = nil
			}
			if missing == "repository" {
				options.DomainRegistrations = []func(huma.API){bootstrap.Registration(nil, nil, nil)}
			}
			h, _ := httpserver.New(app.App{}, nil, options)
			for _, path := range []string{"/v1/showrooms/piano-shop", "/v1/showrooms/piano-shop/pianos/piano", "/v1/showrooms/piano-shop/pianos/piano/photos/photo"} {
				res := httptest.NewRecorder()
				h.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
				if res.Code != 503 || !strings.Contains(res.Body.String(), `"code":"unavailable"`) {
					t.Fatalf("%d %s", res.Code, res.Body.String())
				}
			}
			if repo.reads != 0 {
				t.Fatal("unconfigured public policy reached storage")
			}
		})
	}
}

func TestPublicRoutesConcealHiddenForeignAndDependencyFailures(t *testing.T) {
	repo := memory(t)
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{Clock: clock{}, RequestRateLimiter: &budget{remaining: 20}, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, showroomapp.New(repo, nil)) }}})
	for _, path := range []string{"/v1/showrooms/missing", "/v1/showrooms/piano-shop/pianos/foreign", "/v1/showrooms/piano-shop/pianos/piano/photos/foreign"} {
		res := httptest.NewRecorder()
		h.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
		if res.Code != 404 || !strings.Contains(res.Body.String(), `"code":"not_found"`) {
			t.Fatalf("%d %s", res.Code, res.Body.String())
		}
	}
	repo.profile.ShowroomPublished = false
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest("GET", "/v1/showrooms/piano-shop/pianos/piano", nil))
	if res.Code != 404 {
		t.Fatal("hidden showroom exposed")
	}
	repo.profile.ShowroomPublished = true
	repo.failure = errors.New("PRIVATE-DATABASE-FAILURE")
	for _, path := range []string{"/v1/showrooms/piano-shop", "/v1/showrooms/piano-shop/pianos/piano", "/v1/showrooms/piano-shop/pianos/piano/photos/photo"} {
		res := httptest.NewRecorder()
		h.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
		if res.Code != 503 || strings.Contains(res.Body.String(), "PRIVATE") || strings.Contains(res.Body.String(), "Published piano") || strings.Contains(res.Body.String(), "Piano Shop") {
			t.Fatalf("partial/error data leaked: %d %s", res.Code, res.Body.String())
		}
	}
}

func TestPublicSourceLimitIgnoresUntrustedForwardedHeader(t *testing.T) {
	repo := memory(t)
	limiter := &budget{remaining: 1}
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{Clock: clock{}, RequestRateLimiter: limiter, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, showroomapp.New(repo, nil)) }}})
	for i, forwarded := range []string{"198.51.100.1", "198.51.100.2"} {
		req := httptest.NewRequest("GET", "/v1/showrooms/piano-shop", nil)
		req.RemoteAddr = "192.0.2.10:1234"
		req.Header.Set("X-Forwarded-For", forwarded)
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		want := 200
		if i == 1 {
			want = 429
		}
		if res.Code != want {
			t.Fatalf("%d %s", res.Code, res.Body.String())
		}
	}
	if repo.reads != 1 || limiter.sources[0] != "192.0.2.10" || limiter.sources[1] != "192.0.2.10" {
		t.Fatal("untrusted header bypassed limiter")
	}
}

func TestPublicBannerCurrentVisibilityAndSourceBudget(t *testing.T) {
	repo := memory(t)
	limiter := &budget{remaining: 3}
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{Clock: clock{}, RequestRateLimiter: limiter, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, showroomapp.New(repo, nil)) }}})
	request := func(path string, want int) {
		t.Helper()
		res := httptest.NewRecorder()
		h.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
		if res.Code != want {
			t.Fatalf("%s: %d want %d %s", path, res.Code, want, res.Body.String())
		}
		if want != 429 {
			for key, value := range map[string]string{"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"} {
				if res.Header().Get(key) != value {
					t.Fatal("missing", key)
				}
			}
		}
		if want == 200 && !bytes.Equal(res.Body.Bytes(), repo.image.JPEG) {
			t.Fatal("wrong public banner")
		}
	}
	request("/v1/showrooms/piano-shop/banner/current", 200)
	request("/v1/showrooms/piano-shop/banner/old", 404)
	repo.profile.ShowroomPublished = false
	request("/v1/showrooms/piano-shop/banner/current", 404)
	before := repo.reads
	request("/v1/showrooms/piano-shop/banner/current", 429)
	if repo.reads != before {
		t.Fatal("exhausted budget reached media")
	}
}

func (m *publicMemory) ReadPublicBanner(_ context.Context, slug, id string) (ports.ProcessedPhoto, error) {
	m.reads++
	if _, err := m.showroom(slug); err != nil {
		return ports.ProcessedPhoto{}, err
	}
	if id != "current" {
		return ports.ProcessedPhoto{}, ports.ErrNotFound
	}
	return m.image, m.failure
}
