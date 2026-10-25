package routes

import (
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	customerapp "github.com/elsell/pianotechpros/apps/api/internal/app/customer"
)

func TestProfileRoutesFailClosedAndRejectUnexpectedFields(t *testing.T) {
	handler, api := shared.New(app.App{}, nil, shared.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { RegisterProfiles(api, customerapp.NewProfiles(customerapp.Dependencies{}, nil)) }}})
	if !api.OpenAPI().Components.Schemas.Map()["ProfilePiano"].Properties["manufacturedYear"].Nullable {
		t.Fatal("unknown manufacturing year must be nullable")
	}
	if !slices.Contains(api.OpenAPI().Components.Schemas.Map()["ProfilePiano"].Required, "nickname") {
		t.Fatal("piano nickname must be required in contract")
	}
	const attrs = `{"name":"Ada","isBusiness":false,"email":"ada@example.test","locations":[{"key":"home","label":"Home","street1":"1 Main","city":"Town","region":"State","postalCode":"123","timezone":"UTC"}],"pianos":[]}`
	for _, tc := range []struct {
		name, method, path, body string
		status                   int
	}{
		{"read", "GET", "/v1/customer-profile", "", 503},
		{"catalog", "GET", "/v1/customer-profile/timezones", "", 503},
		{"create", "POST", "/v1/customer-profile", `{"attributes":` + attrs + `}`, 503},
		{"unknown year", "POST", "/v1/customer-profile", `{"attributes":` + strings.Replace(attrs, `"pianos":[]`, `"pianos":[{"key":"piano","locationKey":"home","nickname":"Studio","form":"grand","player":false,"manufacturedYear":null}]`, 1) + `}`, 503},
		{"save", "PUT", "/v1/customer-profile", `{"expectedRevision":1,"attributes":` + attrs + `}`, 503},
		{"owner injection", "POST", "/v1/customer-profile", `{"ownerUserID":"other","attributes":` + attrs + `}`, 422},
		{"nested injection", "POST", "/v1/customer-profile", `{"attributes":` + strings.Replace(attrs, `"name":`, `"ownerUserID":"other","name":`, 1) + `}`, 422},
		{"missing revision", "PUT", "/v1/customer-profile", `{"attributes":` + attrs + `}`, 422},
		{"oversize", "POST", "/v1/customer-profile", `{"attributes":` + strings.Replace(attrs, "Ada", strings.Repeat("a", 1048576), 1) + `}`, 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", "customer-profile-key")
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
	if api.OpenAPI().Paths["/v1/customer-profile"].Delete != nil {
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
