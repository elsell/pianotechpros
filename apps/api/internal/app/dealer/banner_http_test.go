package dealer

import (
	"context"
	"errors"
	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBannerHTTPJourneyAndDeniedBody(t *testing.T) {
	service, _, _, _, _ := bannerFixture()
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterBanner(api, service) }}})
	request := func(method, path, credential, body string, want int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", credential)
		req.Header.Set("Idempotency-Key", "banner-intent-001")
		req.Header.Set("Content-Type", "application/octet-stream")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != want {
			t.Fatalf("%s %s: %d want %d %s", method, path, res.Code, want, res.Body.String())
		}
		for key, value := range map[string]string{"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"} {
			if res.Header().Get(key) != value {
				t.Fatal("missing header", key)
			}
		}
		return res
	}
	base := "/v1/dealers/a/banner"
	request("GET", base, "Bearer valid", "", 200)
	uploaded := request("POST", base+"?expectedRevision=1", "Bearer valid", "pixels", 201)
	if !strings.Contains(uploaded.Body.String(), "\"bannerID\":\"banner\"") || strings.Contains(uploaded.Body.String(), "SHA256") {
		t.Fatal("incorrect upload projection", uploaded.Body.String())
	}
	image := request("GET", base+"/banner/image", "Bearer valid", "", 200)
	if image.Body.String() != "pixels" || image.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatal("incorrect binary response")
	}
	request("DELETE", base+"?expectedRevision=2", "Bearer valid", "", 200)
	request("GET", base+"/banner/image", "Bearer valid", "", 404)
	request("POST", base+"?expectedRevision=1", "Bearer valid", "pixels", 201)
	for _, credential := range []string{"", "malformed", "Bearer expired"} {
		req := httptest.NewRequest("POST", base+"?expectedRevision=1", unreadableBannerSource{})
		req.Header.Set("Authorization", credential)
		req.Header.Set("Idempotency-Key", "banner-intent-002")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != 401 {
			t.Fatalf("denied upload: %d %s", res.Code, res.Body.String())
		}
	}
}

func TestBannerHTTPPolicyFailuresDoNotConsumeUpload(t *testing.T) {
	for _, name := range []string{"permission", "dependency", "cross-dealer", "audit", "processor"} {
		t.Run(name, func(t *testing.T) {
			s, _, permissions, audits, _ := bannerFixture()
			id := "a"
			want := 404
			switch name {
			case "permission":
				permissions.grants["dealer:a:manage_profile:reader"] = false
			case "dependency":
				permissions.err = errors.New("unavailable")
				want = 500
			case "cross-dealer":
				id = "other"
			case "audit":
				audits.err = errors.New("unavailable")
				permissions.grants["dealer:a:manage_profile:reader"] = false
				want = 500
			case "processor":
				s.BannerProcessor = nil
				want = 503
			}
			h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterBanner(api, s) }}})
			req := httptest.NewRequest("POST", "/v1/dealers/"+id+"/banner?expectedRevision=1", unreadableBannerSource{})
			req.Header.Set("Authorization", "Bearer valid")
			req.Header.Set("Idempotency-Key", "banner-policy-01")
			res := httptest.NewRecorder()
			h.ServeHTTP(res, req)
			if res.Code != want {
				t.Fatalf("%d want %d %s", res.Code, want, res.Body.String())
			}
		})
	}
}

type bannerOverflowProcessor struct{}

func (bannerOverflowProcessor) Process(_ context.Context, r io.Reader) (ports.ProcessedPhoto, error) {
	_, err := io.Copy(io.Discard, r)
	return ports.ProcessedPhoto{}, err
}
func TestBannerHTTPBoundsChunkedBodyBeforeAlternativeProcessor(t *testing.T) {
	s, _, _, _, _ := bannerFixture()
	s.BannerProcessor = bannerOverflowProcessor{}
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterBanner(api, s) }}})
	req := httptest.NewRequest("POST", "/v1/dealers/a/banner?expectedRevision=1", strings.NewReader(strings.Repeat("x", (20<<20)+1)))
	req.ContentLength = -1
	req.Header.Set("Authorization", "Bearer valid")
	req.Header.Set("Idempotency-Key", "banner-limit-001")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != 413 || !strings.Contains(res.Body.String(), "photo_limit_exceeded") {
		t.Fatalf("%d %s", res.Code, res.Body.String())
	}
}

func TestBannerHTTPAcceptsSourceAboveOrdinaryJSONBudget(t *testing.T) {
	s, _, _, _, _ := bannerFixture()
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterBanner(api, s) }}})
	req := httptest.NewRequest("POST", "/v1/dealers/a/banner?expectedRevision=1", strings.NewReader(strings.Repeat("x", 2<<20)))
	req.Header.Set("Authorization", "Bearer valid")
	req.Header.Set("Idempotency-Key", "banner-budget-01")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != 201 {
		t.Fatalf("bounded banner above JSON budget: %d %s", res.Code, res.Body.String())
	}
}
