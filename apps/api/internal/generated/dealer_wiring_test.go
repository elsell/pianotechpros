package generated_test

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type dealerAuthenticator struct{}

var errDealerAuthenticationDependency = errors.New("authentication dependency unavailable")

func (dealerAuthenticator) Authenticate(_ context.Context, authorization string) (ports.Principal, error) {
	if authorization == "Bearer unavailable" {
		return ports.Principal{}, errDealerAuthenticationDependency
	}
	if authorization != "Bearer valid" {
		return ports.Principal{}, ports.ErrInvalidCredential
	}
	return ports.Principal{UserID: "user", Scopes: []string{"api:user"}}, nil
}

func TestGeneratedDomainRoutes_dealer(t *testing.T) {
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{
		DomainRegistrations: generated.Registrations(generated.Dependencies{Auth: dealerAuthenticator{}}),
	})
	operations := []struct{ name, method, path, body string }{
		{"inventory create", http.MethodPost, "/v1/dealers/id/inventory", ""},
		{"inventory get", http.MethodGet, "/v1/dealers/id/inventory/piano", ""},
		{"inventory edit", http.MethodPut, "/v1/dealers/id/inventory/piano", `{"expectedRevision":1,"attributes":{"stock_number":"PT-1"}}`},
		{"create", http.MethodPost, "/v1/dealers", `{"name":"value","slug":"value","email":"value","phone":"value","website_url":"value","tagline":"value","description":"value","street_address_1":"value","street_address_2":"value","city":"value","region":"value","postal_code":"value","appointment_note":"value","delivery_note":"value","warranty_note":"value","service_note":"value","banner_alt_text":"value","accent_color":"value","showroom_published":true}`},
		{"list", http.MethodGet, "/v1/dealers", ""},
		{"get", http.MethodGet, "/v1/dealers/id", ""},
		{"update", http.MethodPut, "/v1/dealers/id", `{"expectedRevision":1,"name":"value","slug":"value","email":"value","phone":"value","website_url":"value","tagline":"value","description":"value","street_address_1":"value","street_address_2":"value","city":"value","region":"value","postal_code":"value","appointment_note":"value","delivery_note":"value","warranty_note":"value","service_note":"value","banner_alt_text":"value","accent_color":"value","showroom_published":true}`},
		{"staff list", http.MethodGet, "/v1/dealers/id/staff", ""},
		{"invitation list", http.MethodGet, "/v1/dealers/id/staff-invitations", ""},
		{"invitation create", http.MethodPost, "/v1/dealers/id/staff-invitations", `{"role":"viewer"}`},
		{"invitation preview", http.MethodPost, "/v1/dealers/id/staff-invitations/invite/preview", `{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`},
		{"invitation accept", http.MethodPost, "/v1/dealers/id/staff-invitations/invite/accept", `{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`},
		{"invitation revoke", http.MethodPost, "/v1/dealers/id/staff-invitations/invite/revoke", ""},
		{"staff role", http.MethodPut, "/v1/dealers/id/staff/user/role", `{"expectedRevision":1,"role":"viewer"}`},
		{"staff revoke", http.MethodPost, "/v1/dealers/id/staff/user/revoke", `{"expectedRevision":1}`},
		{"delete", http.MethodDelete, "/v1/dealers/id", ""},
	}
	credentials := []struct {
		name, authorization string
		status              int
	}{
		{"missing session", "", http.StatusUnauthorized},
		{"malformed session", "Bearer malformed", http.StatusUnauthorized},
		{"valid session without policy", "Bearer valid", http.StatusServiceUnavailable},
		{"authentication dependency unavailable", "Bearer unavailable", http.StatusInternalServerError},
	}
	for _, operation := range operations {
		for _, credential := range credentials {
			t.Run(operation.name+"/"+credential.name, func(t *testing.T) {
				request := httptest.NewRequest(operation.method, operation.path, strings.NewReader(operation.body))
				if operation.body != "" {
					request.Header.Set("Content-Type", "application/json")
				}
				if operation.method == http.MethodPost {
					request.Header.Set("Idempotency-Key", "0123456789abcdef")
				}
				if credential.authorization != "" {
					request.Header.Set("Authorization", credential.authorization)
				}
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != credential.status {
					t.Fatalf("status=%d want=%d body=%s", response.Code, credential.status, response.Body.String())
				}
			})
		}
	}
}
