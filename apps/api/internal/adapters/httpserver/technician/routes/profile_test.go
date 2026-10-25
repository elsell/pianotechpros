package routes

import (
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	technicianapp "github.com/elsell/pianotechpros/apps/api/internal/app/technician"
)

func TestProfileRoutesFailClosedAndRejectUnexpectedFields(t *testing.T) {
	handler, api := shared.New(app.App{}, nil, shared.Options{DomainRegistrations: []func(huma.API){func(api huma.API) {
		RegisterProfiles(api, technicianapp.NewProfiles(technicianapp.Dependencies{}, nil))
	}}})
	if !api.OpenAPI().Components.Schemas.Map()["TechnicianProfileAttributes"].Properties["drivingMinutes"].Nullable {
		t.Fatal("unknown driving limit must be nullable")
	}
	if !slices.Contains(api.OpenAPI().Components.Schemas.Map()["TechnicianProfileAttributes"].Required, "origin") {
		t.Fatal("origin must be required in contract")
	}
	const attrs = `{"name":"Ada","email":"ada@example.test","searchable":false,"acceptsRequestsWithoutAvailability":false,"origin":{"label":"Shop","street1":"1 Main","city":"Town","region":"State","postalCode":"123","timezone":"UTC"},"radiusMiles":25,"services":[],"forms":[],"availability":[]}`
	for _, tc := range []struct {
		name, method, path, body string
		status                   int
	}{
		{"read", "GET", "/v1/technician-profile", "", 503},
		{"catalog", "GET", "/v1/technician-profile/timezones", "", 503},
		{"create", "POST", "/v1/technician-profile", `{"attributes":` + attrs + `}`, 503},
		{"unknown driving limit", "POST", "/v1/technician-profile", `{"attributes":` + strings.Replace(attrs, `"radiusMiles":25`, `"radiusMiles":25,"drivingMinutes":null`, 1) + `}`, 503},
		{"null availability", "POST", "/v1/technician-profile", `{"attributes":` + strings.Replace(attrs, `"availability":[]`, `"availability":null`, 1) + `}`, 422},
		{"null weekday", "POST", "/v1/technician-profile", `{"attributes":` + strings.Replace(attrs, `"availability":[]`, `"availability":[{"key":"mon","kind":"available","recurrence":"weekly","weekday":null,"start":"09:00","end":"17:00","timezone":"UTC"}]`, 1) + `}`, 422},
		{"origin injection", "POST", "/v1/technician-profile", `{"attributes":` + strings.Replace(attrs, `"label":"Shop"`, `"ownerUserID":"other","label":"Shop"`, 1) + `}`, 422},
		{"save", "PUT", "/v1/technician-profile", `{"expectedRevision":1,"attributes":` + attrs + `}`, 503},
		{"owner injection", "POST", "/v1/technician-profile", `{"ownerUserID":"other","attributes":` + attrs + `}`, 422},
		{"nested injection", "POST", "/v1/technician-profile", `{"attributes":` + strings.Replace(attrs, `"name":`, `"ownerUserID":"other","name":`, 1) + `}`, 422},
		{"missing revision", "PUT", "/v1/technician-profile", `{"attributes":` + attrs + `}`, 422},
		{"oversize", "POST", "/v1/technician-profile", `{"attributes":` + strings.Replace(attrs, "Ada", strings.Repeat("a", 1048576), 1) + `}`, 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", "technician-profile-key")
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("status %d: %s", res.Code, res.Body.String())
			}
			if res.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("private response can be cached")
			}
		})
	}
	if api.OpenAPI().Paths["/v1/technician-profile"].Delete != nil {
		t.Fatal("unexpected delete operation")
	}
}

func TestProfileErrorsNeverReturnPartialData(t *testing.T) {
	for _, tc := range []struct {
		err    error
		status int
	}{
		{domain.ErrRevisionConflict, 409}, {ports.ErrIdempotencyConflict, 409},
		{ports.ErrAuthorizationPending, 503}, {ports.ErrNotFound, 404},
		{ports.ErrInvalidCredential, 401}, {ports.ErrInvalidArgument, 400},
	} {
		out, err := profileResult(domain.Entity{ID: "private-profile"}, tc.err)
		if out != nil {
			t.Fatal("partial profile returned")
		}
		status, ok := err.(huma.StatusError)
		if !ok || status.GetStatus() != tc.status {
			t.Fatalf("wrong mapped error: %v", err)
		}
	}
}
