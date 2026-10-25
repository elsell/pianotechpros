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

type customerAuthenticator struct{}

var errCustomerAuthenticationDependency = errors.New("authentication dependency unavailable")

func (customerAuthenticator) Authenticate(_ context.Context, authorization string) (ports.Principal, error) {
	if authorization == "Bearer unavailable" {
		return ports.Principal{}, errCustomerAuthenticationDependency
	}
	if authorization != "Bearer valid" {
		return ports.Principal{}, ports.ErrInvalidCredential
	}
	return ports.Principal{UserID: "user", Scopes: []string{"api:user"}}, nil
}

func TestGeneratedDomainRoutes_customer(t *testing.T) {
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{
		DomainRegistrations: generated.Registrations(generated.Dependencies{Auth: customerAuthenticator{}}),
	})
	operations := []struct{ name, method, path, body string }{
		{"create", http.MethodPost, "/v1/customers", `{"name":"value","is_business":true,"business_name":"value","email":"value","phone":"value"}`},
		{"list", http.MethodGet, "/v1/customers", ""},
		{"get", http.MethodGet, "/v1/customers/id", ""},
		{"update", http.MethodPut, "/v1/customers/id", `{"name":"value","is_business":true,"business_name":"value","email":"value","phone":"value"}`},
		{"delete", http.MethodDelete, "/v1/customers/id", ""},
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
