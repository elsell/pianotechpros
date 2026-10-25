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
	"net/url"
	"strings"
	"testing"
)

func TestInventoryHistoryHTTP(t *testing.T) {
	c, f, m := historyFixture()
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, c) }}})
	base := "/v1/dealers/dealer/inventory/piano/history"
	request := func(path, credential string, status int) map[string]any {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", credential)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != status {
			t.Fatalf("got %d want %d: %s", response.Code, status, response.Body.String())
		}
		if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("Referrer-Policy") != "no-referrer" {
			t.Fatal("private headers missing")
		}
		if strings.Contains(response.Body.String(), "PRIVATE-SENTINEL") {
			t.Fatal("private failure input echoed")
		}
		var body map[string]any
		if json.Unmarshal(response.Body.Bytes(), &body) != nil {
			t.Fatal("invalid response")
		}
		return body
	}
	first := request(base+"?limit=1", "opaque", 200)
	data := first["data"].([]any)
	item := data[0].(map[string]any)
	if item["actor_id"] != "actor" || item["revision"] != float64(3) || item["field_sources"] != nil {
		t.Fatal("lost history metadata", item)
	}
	for _, key := range []string{"snapshot", "audit_id", "private_notes", "record_id", "dealer_id"} {
		if _, ok := item[key]; ok {
			t.Fatal("unexpected response field", key)
		}
	}
	cursor := first["meta"].(map[string]any)["nextCursor"].(string)
	last := request(base+"?limit=2&cursor="+url.QueryEscape(cursor), "opaque", 200)
	if len(last["data"].([]any)) != 2 || last["meta"].(map[string]any)["nextCursor"] != nil {
		t.Fatal("wrong terminal history page")
	}
	for _, credential := range []string{"", "malformed", "expired", "wrong-issuer", "wrong-audience"} {
		request(base, credential, 401)
	}
	request(base+"?limit=51", "opaque", 422)
	request(base+"?limit=0", "opaque", 422)
	request(base+"?cursor=PRIVATE-SENTINEL", "opaque", 400)
	request("/v1/dealers/other/inventory/piano/history", "opaque", 404)
	f.principalOverride = &ports.Principal{UserID: "other", Scopes: []string{"api:user"}}
	request(base, "opaque", 404)
	f.principalOverride = nil
	f.permissions["view"] = false
	request(base, "opaque", 404)
	f.permissions["view"] = true
	f.authorityFailure = errors.New("PRIVATE-SENTINEL")
	request(base, "opaque", 500)
	f.authorityFailure = nil
	f.deniedBudget = true
	request(base, "opaque", 429)
	f.deniedBudget = false
	m.failure = errors.New("PRIVATE-SENTINEL")
	request(base, "opaque", 500)
}
