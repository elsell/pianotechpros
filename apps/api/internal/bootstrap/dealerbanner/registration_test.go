package dealerbanner

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBannerRegistrationContractAndMissingCapabilities(t *testing.T) {
	h, api := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: append(generated.Registrations(generated.Dependencies{}), Registration(generated.Dependencies{}, nil))})
	base := "/v1/dealers/{id}/banner"
	upload := api.OpenAPI().Paths[base].Post
	if upload == nil || upload.RequestBody.Content["application/octet-stream"].Schema.Format != "binary" {
		t.Fatal("missing binary upload")
	}
	banner := api.OpenAPI().Components.Schemas.Map()["DealerBannerState"].Properties["banner"]
	if len(banner.AnyOf) != 2 || banner.AnyOf[1].Type != "null" {
		t.Fatal("absent banner must be nullable")
	}
	for _, path := range []string{"/v1/dealers/shop/banner", "/v1/dealers/shop/banner/asset/image"} {
		res := httptest.NewRecorder()
		h.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
		if res.Code != 503 || !strings.Contains(res.Body.String(), "authorization_policy_not_configured") {
			t.Fatalf("%d %s", res.Code, res.Body.String())
		}
	}
}
