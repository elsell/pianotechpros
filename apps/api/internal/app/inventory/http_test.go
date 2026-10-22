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

func TestInventoryHTTPRecordJourneyAndBoundaries(t *testing.T) {
	c, f, m := commandFixture()
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, c) }}})
	request := func(method, path, credential, body string, want int) map[string]any {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", credential)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", "inventory-intent-01")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != want {
			t.Fatalf("%s %s got %d want %d: %s", method, path, res.Code, want, res.Body.String())
		}
		if res.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("private response cacheable")
		}
		var decoded map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &decoded); err != nil {
			t.Fatal(err)
		}
		return decoded
	}
	base := "/v1/dealers/dealer/inventory"
	created := request(http.MethodPost, base, "opaque", "", 201)["data"].(map[string]any)
	id := created["id"].(string)
	path := base + "/" + id
	replay := request(http.MethodPost, base, "opaque", "", 201)["data"].(map[string]any)
	if replay["id"] != id || len(m.rows) != 1 {
		t.Fatal("duplicate retry")
	}
	body := `{"expectedRevision":1,"attributes":{"stock_number":"PT-EDIT","title":"Grand","private_notes":"PRIVATE-SENTINEL","asking_price":{"minor_units":12345,"currency":"USD"},"manufactured":{"year":1920,"month":0,"day":0}}}`
	edited := request(http.MethodPut, path, "opaque", body, 200)["data"].(map[string]any)
	if edited["revision"] != float64(2) || edited["status"] != "draft" {
		t.Fatal("wrong edit")
	}
	got := request(http.MethodGet, path, "opaque", "", 200)["data"].(map[string]any)["attributes"].(map[string]any)
	if got["private_notes"] != "PRIVATE-SENTINEL" || got["asking_price"].(map[string]any)["minor_units"] != float64(12345) {
		t.Fatal("attribute mapping lost facts")
	}
	request(http.MethodPut, path, "opaque", body, 409)
	for _, field := range []string{"asking_price", "acquisition_cost"} {
		request(http.MethodPut, path, "opaque", `{"expectedRevision":2,"attributes":{"stock_number":"PT-EDIT","`+field+`":{"minor_units":1,"currency":"ZZZ"}}}`, 400)
	}

	request(http.MethodPut, path, "opaque", `{"expectedRevision":2,"attributes":{"stock_number":"PT-EDIT"},"status":"available"}`, 422)
	request(http.MethodPut, path, "opaque", `{"expectedRevision":2,"attributes":{"stock_number":"PT-EDIT","source":"voice"}}`, 422)
	for _, credential := range []string{"", "malformed", "expired", "wrong-issuer", "wrong-audience"} {
		request(http.MethodGet, path, credential, "", 401)
	}
	request(http.MethodGet, "/v1/dealers/other/inventory/"+id, "opaque", "", 404)
	f.permissions["view"] = false
	request(http.MethodGet, path, "opaque", "", 404)
	f.permissions["view"] = true
	f.permissions["manage_inventory"] = false
	request(http.MethodPost, base, "opaque", "", 404)
	request(http.MethodPut, path, "opaque", body, 404)
	f.permissions["manage_inventory"] = true
	f.authorityFailure = errors.New("permission unavailable")
	request(http.MethodGet, path, "opaque", "", 500)
	f.authorityFailure = nil
	f.deniedBudget = true
	request(http.MethodGet, path, "opaque", "", 429)
	f.deniedBudget = false
	m.failure = ports.ErrNotFound
	request(http.MethodGet, path, "opaque", "", 404)
	m.failure = nil
	malformed := request(http.MethodPut, path, "opaque", `{"expectedRevision":2,"attributes":{"stock_number":"PT-EDIT","asking_price":{"minor_units":"PRIVATE-SENTINEL","currency":"USD"}}}`, 422)
	encoded, _ := json.Marshal(malformed)
	if strings.Contains(string(encoded), "PRIVATE-SENTINEL") {
		t.Fatal("validation leaked private input")
	}
}
