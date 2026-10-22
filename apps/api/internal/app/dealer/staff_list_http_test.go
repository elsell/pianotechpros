package dealer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

func TestStaffAdministrationHTTPLists(t *testing.T) {
	s, _, p, _ := invitationFixture()
	first, err := s.CreateStaffInvitation(context.Background(), "Bearer valid", "a", domain.RoleViewer, 72)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateStaffInvitation(context.Background(), "Bearer valid", "a", domain.RoleEditor, 72); err != nil {
		t.Fatal(err)
	}
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, s) }}})
	request := func(path, credential string, status int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", credential)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != status {
			t.Fatalf("status=%d expected=%d body=%s", response.Code, status, response.Body.String())
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("private list may be cached")
		}
		if strings.Contains(response.Body.String(), first.Token) || strings.Contains(strings.ToLower(response.Body.String()), "digest") {
			t.Fatal("invitation secret exposed by list")
		}
		return response
	}
	request("/v1/dealers/a/staff", "Bearer valid", 200)
	response := request("/v1/dealers/a/staff-invitations?limit=1", "Bearer valid", 200)
	var page struct {
		Data []map[string]any `json:"data"`
		Meta struct {
			NextCursor string `json:"nextCursor"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 1 || page.Meta.NextCursor == "" {
		t.Fatal("missing bounded page/cursor")
	}
	request("/v1/dealers/a/staff-invitations?cursor="+page.Meta.NextCursor, "Bearer valid", 200)
	request("/v1/dealers/a/staff?cursor="+page.Meta.NextCursor, "Bearer valid", 400)
	for _, path := range []string{"/v1/dealers/a/staff", "/v1/dealers/a/staff-invitations"} {
		request(path, "", 401)
	}
	p.grants = map[string]bool{}
	for _, path := range []string{"/v1/dealers/a/staff", "/v1/dealers/a/staff-invitations"} {
		request(path, "Bearer valid", 404)
	}
}
