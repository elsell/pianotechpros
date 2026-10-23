package inventory

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func publicationRequest(t *testing.T, h http.Handler, method, path, credential, body string, want int) map[string]any {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", credential)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != want {
		t.Fatalf("%s %s: got %d want %d: %s", method, path, res.Code, want, res.Body.String())
	}
	if res.Header().Get("Cache-Control") != "no-store" || res.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatal("private publication response cacheable")
	}
	var data map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	return data
}
func TestPublicationHTTPJourneyAndReadiness(t *testing.T) {
	c, _, m := publicationFixture(t)
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, c) }}})
	base := "/v1/dealers/dealer/inventory/piano"
	request := func(method, path, body string, want int) map[string]any {
		return publicationRequest(t, h, method, base+path, "opaque", body, want)
	}
	initial := request("GET", "/publication", "", 200)["data"].(map[string]any)
	if initial["publication"] != nil {
		t.Fatal("unpublished draft has snapshot")
	}
	photos := m.photos
	m.photos = nil
	readiness := request("POST", "/publish", `{"expectedRevision":1}`, 422)
	missing := readiness["missing"].([]any)
	if readiness["code"] != "inventory_not_ready" || len(missing) != 1 || missing[0] != "photo" {
		t.Fatal("readiness is not machine readable", readiness)
	}
	m.photos = photos
	for _, payload := range []string{`{"expectedRevision":1,"photos":[]}`, `{"expectedRevision":1,"ready":true}`, `{"expectedRevision":1,"source":"voice"}`} {
		request("POST", "/publish", payload, 422)
	}
	published := request("POST", "/publish", `{"expectedRevision":1}`, 200)["data"].(map[string]any)
	snapshot := published["publication"].(map[string]any)["snapshot"].(map[string]any)
	raw, _ := json.Marshal(snapshot)
	for _, private := range []string{"PRIVATE-NOTES", "private_notes", "serial", "acquisition_cost", "salePrice", "location"} {
		if strings.Contains(string(raw), private) {
			t.Fatal("snapshot leaked private field", private)
		}
	}
	request("POST", "/publish", `{"expectedRevision":1}`, 409)
	for _, payload := range []string{`{"expectedRevision":2,"status":"sold"}`, `{"expectedRevision":2,"status":"sold","salePrice":{"minor_units":10,"currency":"ZZZ"}}`, `{"expectedRevision":2,"status":"reserved","salePrice":{"minor_units":10,"currency":"USD"}}`} {
		request("POST", "/lifecycle", payload, 400)
	}
	request("POST", "/lifecycle", `{"expectedRevision":2,"status":"sold","attributes":{"title":"PRIVATE"}}`, 422)
	badPrice := request("POST", "/lifecycle", `{"expectedRevision":2,"status":"sold","salePrice":{"minor_units":"PRIVATE-PRICE","currency":"USD"},"reason":"PRIVATE-REASON"}`, 422)
	encodedError, _ := json.Marshal(badPrice)
	if strings.Contains(string(encodedError), "PRIVATE-") {
		t.Fatal("validation echoed private sale input")
	}
	sold := request("POST", "/lifecycle", `{"expectedRevision":2,"status":"sold","salePrice":{"minor_units":100,"currency":"USD"}}`, 200)["data"].(map[string]any)
	if sold["record"].(map[string]any)["status"] != "sold" {
		t.Fatal("sale not applied")
	}
	request("POST", "/lifecycle", `{"expectedRevision":3,"status":"available"}`, 400)
	hidden := request("POST", "/unpublish", `{"expectedRevision":3}`, 200)["data"].(map[string]any)
	if hidden["publication"].(map[string]any)["visible"] != false {
		t.Fatal("unpublish did not hide")
	}
	request("POST", "/lifecycle", `{"expectedRevision":4,"status":"available","reason":"sale correction"}`, 200)
	final := request("GET", "/publication", "", 200)["data"].(map[string]any)
	if final["publication"].(map[string]any)["visible"] != false {
		t.Fatal("correction republished")
	}
}
func TestPublicationHTTPAdversarialBoundaries(t *testing.T) {
	for _, operation := range []struct{ method, path, body, permission string }{
		{"GET", "/publication", "", "view"}, {"POST", "/publish", `{"expectedRevision":1}`, "publish_inventory"}, {"POST", "/unpublish", `{"expectedRevision":1}`, "publish_inventory"}, {"POST", "/lifecycle", `{"expectedRevision":1,"status":"sold","salePrice":{"minor_units":100,"currency":"USD"}}`, "manage_inventory"},
	} {
		t.Run(operation.path, func(t *testing.T) {
			c, f, m := publicationFixture(t)
			h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, c) }}})
			path := "/v1/dealers/dealer/inventory/piano" + operation.path
			call := func(credential string, want int) map[string]any {
				return publicationRequest(t, h, operation.method, path, credential, operation.body, want)
			}
			for _, credential := range []string{"", "malformed", "expired", "wrong-issuer", "wrong-audience", "provider-token"} {
				call(credential, 401)
			}
			publicationRequest(t, h, operation.method, strings.Replace(path, "/dealer/", "/foreign/", 1), "opaque", operation.body, 404)
			publicationRequest(t, h, operation.method, strings.Replace(path, "/piano/", "/foreign/", 1), "opaque", operation.body, 404)
			f.permissions[operation.permission] = false
			call("opaque", 404)
			f.permissions[operation.permission] = true
			if operation.method == "POST" {
				f.account.Membership.Role = dealer.RoleViewer
				call("opaque", 404)
				f.account.Membership.Role = dealer.RoleEditor
			}
			f.account.Membership.Active = false
			call("opaque", 404)
			f.account.Membership.Active = true
			f.authorityFailure = errors.New("PRIVATE-DEPENDENCY")
			failure := call("opaque", 500)
			raw, _ := json.Marshal(failure)
			if strings.Contains(string(raw), "PRIVATE-DEPENDENCY") {
				t.Fatal("leaked dependency error")
			}
			f.authorityFailure = nil
			f.deniedBudget = true
			call("opaque", 429)
			f.deniedBudget = false
			m.failure = ports.ErrNotFound
			before := len(f.events)
			call("opaque", 404)
			if len(f.events) != before+1 {
				t.Fatal("transaction denial not audited")
			}
			f.auditFailure = errors.New("audit unavailable")
			call("opaque", 500)
			f.auditFailure = nil
			m.failure = errors.New("audit unavailable")
			call("opaque", 500)
			if len(m.events) != 0 || m.state.Record.Revision != 1 {
				t.Fatal("rejected request committed")
			}
			c.dependencies.Publications = nil
			call("opaque", 503)
		})
	}
}
