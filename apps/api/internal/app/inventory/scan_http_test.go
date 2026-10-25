package inventory

import (
	"encoding/json"
	"errors"
	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScanHTTPBoundary(t *testing.T) {
	c, f, m := scanFixture()
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterScan(api, c) }}})
	ensure := "/v1/dealers/dealer/inventory/piano/scan-label"
	resolve := "/v1/dealers/dealer/inventory/scan/resolve"
	request := func(path, credential, body string, status int) map[string]any {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Authorization", credential)
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != status {
			t.Fatalf("status=%d want=%d: %s", response.Code, status, response.Body.String())
		}
		if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("Referrer-Policy") != "no-referrer" {
			t.Fatal("private headers missing")
		}
		if strings.Contains(response.Body.String(), "PRIVATE-SENTINEL") {
			t.Fatal("private input echoed")
		}
		if status != 200 && strings.Contains(response.Body.String(), scanFixtureToken) {
			t.Fatal("token echoed in error")
		}
		var result map[string]any
		if json.Unmarshal(response.Body.Bytes(), &result) != nil {
			t.Fatal("invalid JSON")
		}
		return result
	}
	first := request(ensure, "opaque", "", 200)["data"].(map[string]any)
	if len(first) != 3 || first["dealer_id"] != "dealer" || first["record_id"] != "piano" || first["token"] != scanFixtureToken {
		t.Fatal("wrong label response")
	}
	payload := `{"token":"` + scanFixtureToken + `"}`
	found := request(resolve, "opaque", payload, 200)["data"].(map[string]any)
	if len(found) != 2 || found["record_id"] != "piano" {
		t.Fatal("resolution leaked private data")
	}
	for _, credential := range []string{"", "malformed", "expired", "wrong-issuer", "wrong-audience"} {
		request(ensure, credential, "", 401)
		request(resolve, credential, payload, 401)
	}
	request(resolve, "opaque", `{"token":"PRIVATE-SENTINEL"}`, 422)
	request(resolve, "opaque", `{"token":"PRIVATE-SENTINEL`, 400)
	request(resolve, "opaque", `{"token":"`+strings.Repeat("A", 1100)+`"}`, 413)
	request(resolve, "opaque", `{"token":"`+strings.Repeat("A", 43)+`"}`, 400)
	request(strings.Replace(ensure, "/dealer/", "/other/", 1), "opaque", "", 404)
	request(strings.Replace(resolve, "/dealer/", "/other/", 1), "opaque", payload, 404)
	f.principalOverride = &ports.Principal{UserID: "other", Scopes: []string{"api:user"}}
	request(resolve, "opaque", payload, 404)
	f.principalOverride = nil
	f.permissions["view"] = false
	request(ensure, "opaque", "", 404)
	request(resolve, "opaque", payload, 404)
	f.permissions["view"] = true
	f.authorityFailure = errors.New("PRIVATE-SENTINEL")
	request(resolve, "opaque", payload, 500)
	f.authorityFailure = nil
	f.deniedBudget = true
	request(ensure, "opaque", "", 429)
	request(resolve, "opaque", payload, 429)
	f.deniedBudget = false
	m.failure = errors.New("PRIVATE-SENTINEL")
	request(ensure, "opaque", "", 500)
	request(resolve, "opaque", payload, 500)
}
