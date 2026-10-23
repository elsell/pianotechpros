package dealer

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
)

func TestDealerHTTPReadBoundary(t *testing.T) {
	cases := []struct {
		name, path, credential string
		setup                  func(*Service, *readStore, *readPermissions, *readAudits)
		status                 int
		contains               string
	}{
		{"permitted profile", "/v1/dealers/a", "Bearer valid", nil, 200, "Private shop"},
		{"permitted list", "/v1/dealers", "Bearer valid", nil, 200, "Private shop"},
		{"missing session", "/v1/dealers/a", "", nil, 401, "invalid_credential"},
		{"malformed session", "/v1/dealers/a", "Basic bad", nil, 401, "invalid_credential"},
		{"unknown ID", "/v1/dealers/unknown", "Bearer valid", nil, 404, "not_found"},
		{"revoked member", "/v1/dealers/a", "Bearer valid", func(_ *Service, r *readStore, _ *readPermissions, _ *readAudits) { delete(r.members["reader"], "a") }, 404, "not_found"},
		{"insufficient permission", "/v1/dealers/a", "Bearer valid", func(_ *Service, _ *readStore, p *readPermissions, _ *readAudits) { p.grants = map[string]bool{} }, 404, "not_found"},
		{"permission dependency failure", "/v1/dealers/a", "Bearer valid", func(_ *Service, _ *readStore, p *readPermissions, _ *readAudits) { p.err = errors.New("unavailable") }, 500, "internal_error"},
		{"audit dependency failure", "/v1/dealers/a", "Bearer valid", func(_ *Service, _ *readStore, _ *readPermissions, a *readAudits) { a.err = errors.New("unavailable") }, 500, "internal_error"},
		{"principal rate limit", "/v1/dealers/a", "Bearer valid", func(s *Service, _ *readStore, _ *readPermissions, _ *readAudits) { s.AuditRateLimiter = &readBudget{} }, 429, "rate_limited"},
		{"invalid cursor", "/v1/dealers?cursor=bad", "Bearer valid", nil, 400, "bad_request"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, r, p, a := readFixture()
			if c.setup != nil {
				c.setup(s, r, p, a)
			}
			handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, s) }}})
			req := httptest.NewRequest(http.MethodGet, c.path, nil)
			req.Header.Set("Authorization", c.credential)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			if response.Code != c.status || !strings.Contains(response.Body.String(), c.contains) {
				t.Fatalf("status %d body %s", response.Code, response.Body.String())
			}
			if c.status != 200 && strings.Contains(response.Body.String(), "Private shop") {
				t.Fatal("error response disclosed profile")
			}
		})
	}
}
