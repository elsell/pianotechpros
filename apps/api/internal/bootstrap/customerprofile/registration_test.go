package customerprofile

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
)

func TestRegistrationDeclaresProductAndKeepsUnconfiguredPolicyClosed(t *testing.T) {
	registration, err := Registration(generated.Dependencies{})
	if err != nil {
		t.Fatal(err)
	}
	handler, api := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: append(generated.Registrations(generated.Dependencies{}), showroom.Registration(nil, nil, nil), registration)})
	for _, path := range []string{"/v1/customer-profile", "/v1/customer-profile/timezones", "/v1/customers"} {
		if api.OpenAPI().Paths[path] == nil {
			t.Fatalf("missing %s", path)
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
		if res.Code != 503 || !strings.Contains(res.Body.String(), "authorization_policy_not_configured") {
			t.Fatalf("%s: %d %s", path, res.Code, res.Body.String())
		}
	}
}
