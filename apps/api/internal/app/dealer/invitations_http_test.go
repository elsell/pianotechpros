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
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestInvitationHTTPFlowAndSecretResponseBoundary(t *testing.T) {
	s, _, _, _ := invitationFixture()
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, s) }}})
	request := func(path, body, credential string, status int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Authorization", credential)
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != status {
			t.Fatalf("%s status=%d expected=%d body=%s", path, response.Code, status, response.Body.String())
		}
		if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("Referrer-Policy") != "no-referrer" {
			t.Fatalf("missing secret headers: %v", response.Header())
		}
		return response
	}
	path := "/v1/dealers/a/staff-invitations"
	created := request(path, `{"role":"viewer"}`, "Bearer valid", 201)
	var result struct {
		Data struct {
			ID    string `json:"id"`
			Token string `json:"token"`
		}
	}
	if err := json.Unmarshal(created.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Data.Token) != 43 || result.Data.ID == "" {
		t.Fatalf("missing invitation: %s", created.Body.String())
	}
	if strings.Contains(strings.ToLower(created.Body.String()), "digest") {
		t.Fatal("digest leaked")
	}
	s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "new-staff", Scopes: []string{"api:user"}}}
	tokenBody, _ := json.Marshal(map[string]string{"token": result.Data.Token})
	base := path + "/" + result.Data.ID
	for _, suffix := range []string{"preview", "accept"} {
		response := request(base+"/"+suffix, string(tokenBody), "Bearer valid", 200)
		if strings.Contains(response.Body.String(), result.Data.Token) || strings.Contains(strings.ToLower(response.Body.String()), "digest") {
			t.Fatal("token disclosed outside creation")
		}
	}
	response := request(base+"/accept", string(tokenBody), "Bearer valid", 400)
	if !strings.Contains(response.Body.String(), `"code":"invalid_invitation"`) {
		t.Fatal(response.Body.String())
	}
	request(base+"/preview", string(tokenBody), "", 401)
	request(base+"/preview", `{"token":"invalid-secret"}`, "Bearer valid", 400)
	malformed := request(base+"/preview", `{"token":"`+result.Data.Token+`"`, "Bearer valid", 400)
	if strings.Contains(malformed.Body.String(), result.Data.Token) {
		t.Fatal("malformed request echoed secret token")
	}

	wrongShape := request(base+"/preview", `{"token":{"secret":"`+result.Data.Token+`"}}`, "Bearer valid", 422)
	if strings.Contains(wrongShape.Body.String(), result.Data.Token) {
		t.Fatal("validation error echoed secret token")
	}

}
