package inventory

import (
	"context"
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

func TestAttributedEditHTTP(t *testing.T) {
	c, f, m := commandFixture()
	record, err := c.CreateDraft(context.Background(), "opaque", "dealer", "attribution-intent-01")
	if err != nil {
		t.Fatal(err)
	}
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, c) }}})
	request := func(credential, dealer string, fields any, want int) {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"expectedRevision": 1, "attributes": map[string]any{"stock_number": record.StockNumber, "make": "Steinway", "private_notes": "manual note"}, "voiceFields": fields})
		req := httptest.NewRequest(http.MethodPut, "/v1/dealers/"+dealer+"/inventory/"+record.ID, strings.NewReader(string(body)))
		req.Header.Set("Authorization", credential)
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != want {
			t.Fatalf("got %d want %d: %s", res.Code, want, res.Body.String())
		}
		if strings.Contains(res.Body.String(), "field_sources") || strings.Contains(res.Body.String(), "voiceFields") {
			t.Fatal("private attribution echoed")
		}
	}
	for _, credential := range []string{"", "malformed", "expired", "wrong-issuer", "wrong-audience"} {
		request(credential, "dealer", []string{"make"}, 401)
	}
	request("opaque", "other", []string{"make"}, 404)
	f.principalOverride = &ports.Principal{UserID: "other-user", Scopes: []string{"api:user"}}
	request("opaque", "dealer", []string{"make"}, 404)
	f.principalOverride = nil
	f.permissions["manage_inventory"] = false
	request("opaque", "dealer", []string{"make"}, 404)
	f.permissions["manage_inventory"] = true
	f.authorityFailure = errors.New("policy down")
	request("opaque", "dealer", []string{"make"}, 500)
	f.authorityFailure = nil
	f.deniedBudget = true
	request("opaque", "dealer", []string{"make"}, 429)
	f.deniedBudget = false
	m.failure = errors.New("transaction down")
	request("opaque", "dealer", []string{"make"}, 500)
	m.failure = nil
	for _, fields := range [][]string{{"make", "make"}, {"status"}, {"missing"}, {"model"}, {"stock_number"}} {
		request("opaque", "dealer", fields, 400)
	}
	request("opaque", "dealer", strings.Repeat("sensitive", 10), 422)
	request("opaque", "dealer", make([]string, 19), 422)
	if m.rows[record.ID].Revision != 1 || len(m.events) != 1 {
		t.Fatal("denied/invalid edit persisted")
	}
	request("opaque", "dealer", []string{"make"}, 200)
	if m.rows[record.ID].Revision != 2 || m.rows[record.ID].Make != "Steinway" {
		t.Fatal("attributed edit lost")
	}
	if len(m.histories) != 1 || m.histories[0].Source != "mixed" || m.histories[0].FieldSources["make"] != "voice" || m.histories[0].FieldSources["private_notes"] != "manual" {
		t.Fatal("field provenance lost")
	}
	request("opaque", "dealer", []string{"make"}, 409)
}
