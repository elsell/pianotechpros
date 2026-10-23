package inventory

import (
	"encoding/json"
	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestInventoryListHTTP(t *testing.T) {
	c, f, m := listFixture()
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, c) }}})
	request := func(query, token string, status int) map[string]any {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/v1/dealers/dealer/inventory"+query, nil)
		req.Header.Set("Authorization", token)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != status {
			t.Fatalf("got %d want %d: %s", res.Code, status, res.Body.String())
		}
		if res.Header().Get("Cache-Control") != "no-store" || res.Header().Get("Referrer-Policy") != "no-referrer" {
			t.Fatal("private headers missing")
		}
		if status != 200 && strings.Contains(res.Body.String(), "PRIVATE-SENTINEL") {
			t.Fatal("validation echoed private query")
		}
		var body map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body
	}
	first := request("?limit=1&search=Yamaha", "opaque", 200)
	if len(first["data"].([]any)) != 1 {
		t.Fatal("wrong first page")
	}
	cursor := first["meta"].(map[string]any)["nextCursor"].(string)
	last := request("?limit=100&search=Yamaha&cursor="+url.QueryEscape(cursor), "opaque", 200)
	if len(last["data"].([]any)) != 2 || last["meta"].(map[string]any)["nextCursor"] != nil {
		t.Fatal("wrong terminal page")
	}
	empty := request("?search=absent", "opaque", 200)
	if len(empty["data"].([]any)) != 0 {
		t.Fatal("empty list not array")
	}
	request("?limit=0", "opaque", 422)
	request("?status=PRIVATE-SENTINEL", "opaque", 422)
	request("?search="+strings.Repeat("PRIVATE-SENTINEL", 20), "opaque", 422)
	request("?includeInactive=true&cursor="+url.QueryEscape(cursor), "opaque", 400)
	request("?cursor=PRIVATE-SENTINEL", "opaque", 400)
	request("", "invalid", 401)
	count := len(m.events)
	f.permissions["view"] = false
	request("?cursor="+url.QueryEscape(cursor), "opaque", 404)
	if len(m.events) != count {
		t.Fatal("denied continuation read records")
	}
}
