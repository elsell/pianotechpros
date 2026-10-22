package dealer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
)

func TestDealerHTTPCreateEditAndRetry(t *testing.T) {
	s, _, _, _ := creationFixture()
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, s) }}})
	request := func(method, path, body string, want int) map[string]any {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer valid")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", "key-012345678901")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != want {
			t.Fatalf("%s %s: status %d body %s", method, path, response.Code, response.Body.String())
		}
		var decoded map[string]any
		if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
			t.Fatal(err)
		}
		return decoded
	}
	body := `{"name":"New shop","slug":"new-shop","email":"new@example.com","accent_color":"#123456","showroom_published":false}`
	created := request(http.MethodPost, "/v1/dealers", body, 201)["data"].(map[string]any)
	if created["revision"] != float64(1) {
		t.Fatalf("missing initial revision: %+v", created)
	}
	path := "/v1/dealers/" + created["id"].(string)
	update := `{"expectedRevision":1,"name":"Updated shop","slug":"new-shop","email":"new@example.com","accent_color":"#123456","showroom_published":false}`
	updated := request(http.MethodPut, path, update, 200)["data"].(map[string]any)
	if updated["revision"] != float64(2) || updated["name"] != "Updated shop" {
		t.Fatalf("updated: %+v", updated)
	}
	request(http.MethodPut, path, update, 409)
	request(http.MethodPut, path, strings.Replace(update, `"expectedRevision":1,`, "", 1), 422)
	request(http.MethodPut, path, strings.Replace(update, `"expectedRevision":1`, `"expectedRevision":2`, 1), 200)
	replay := request(http.MethodPost, "/v1/dealers", body, 201)["data"].(map[string]any)
	if replay["id"] != created["id"] || replay["revision"] != float64(3) {
		t.Fatalf("idempotent replay lost current profile: %+v", replay)
	}
	request(http.MethodPost, "/v1/dealers", strings.Replace(body, "New shop", "Different shop", 1), 409)
	invalid := strings.Replace(strings.Replace(update, `"expectedRevision":1`, `"expectedRevision":3`, 1), "new@example.com", "not-an-email", 1)
	request(http.MethodPut, path, invalid, 400)
}
