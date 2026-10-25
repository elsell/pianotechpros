package inventoryscan

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScanRegistrationDeclaredAndFailsClosed(t *testing.T) {
	handler, api := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: append(generated.Registrations(generated.Dependencies{}), Registration(generated.Dependencies{}, nil))})
	for _, path := range []string{"/v1/dealers/{dealerID}/inventory/{id}/scan-label", "/v1/dealers/{dealerID}/inventory/scan/resolve"} {
		endpoint := api.OpenAPI().Paths[path]
		if endpoint == nil || endpoint.Post == nil {
			t.Fatal("missing scan contract")
		}
		actual := strings.ReplaceAll(strings.ReplaceAll(path, "{dealerID}", "dealer"), "{id}", "piano")
		req := httptest.NewRequest("POST", actual, strings.NewReader(`{"token":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"}`))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != 503 || !strings.Contains(res.Body.String(), "authorization_policy_not_configured") {
			t.Fatalf("unconfigured registration: %d", res.Code)
		}
	}
}
