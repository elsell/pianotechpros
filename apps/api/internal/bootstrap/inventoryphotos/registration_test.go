package inventoryphotos

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
)

func TestPhotoRegistrationPublishesContractAndFailsClosedWithoutCapabilities(t *testing.T) {
	h, api := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: append(generated.Registrations(generated.Dependencies{}), Registration(generated.Dependencies{}, nil))})
	codes := api.OpenAPI().Components.Schemas.Map()["APIError"].Properties["code"].Enum
	for _, expected := range []string{"invalid_photo", "photo_limit_exceeded"} {
		found := false
		for _, code := range codes {
			if code == expected {
				found = true
			}
		}
		if !found {
			t.Fatalf("missing declared error code %s", expected)
		}
	}
	base := "/v1/dealers/{dealerID}/inventory/{id}/photos"
	upload := api.OpenAPI().Paths[base].Post
	if upload == nil || upload.RequestBody.Content["application/octet-stream"].Schema.Format != "binary" {
		t.Fatal("missing streaming upload contract")
	}
	image := api.OpenAPI().Paths[base+"/{photoID}/image"].Get
	if image == nil || image.Responses["200"].Content["image/jpeg"].Schema.Format != "binary" {
		t.Fatal("missing image binary contract")
	}
	for _, method := range []string{"GET", "POST"} {
		req := httptest.NewRequest(method, "/v1/dealers/shop/inventory/piano/photos?expectedRevision=1", strings.NewReader("source"))
		req.Header.Set("Idempotency-Key", "photo-bootstrap-01")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != 503 || !strings.Contains(res.Body.String(), "authorization_policy_not_configured") {
			t.Fatalf("unconfigured registration: %d %s", res.Code, res.Body.String())
		}
	}
}
