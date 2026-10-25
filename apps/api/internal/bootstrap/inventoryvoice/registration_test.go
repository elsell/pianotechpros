package inventoryvoice

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/config"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVoiceRegistrationContractAndFailClosed(t *testing.T) {
	if _, err := Registration(generated.Dependencies{}, config.Config{GeminiAPIKey: "test-key"}); err == nil {
		t.Fatal("partial configuration accepted")
	}
	registration, err := Registration(generated.Dependencies{}, config.Config{})
	if err != nil {
		t.Fatal(err)
	}
	h, api := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){registration}})
	for _, suffix := range []string{"transcribe", "extract"} {
		op := api.OpenAPI().Paths["/v1/dealers/{dealerID}/inventory/{id}/voice/"+suffix].Post
		if suffix == "transcribe" && (op.RequestBody.Content["audio/webm"] == nil || op.RequestBody.Content["audio/mp4"] == nil || op.RequestBody.Content["application/octet-stream"] != nil) {
			t.Fatal("incorrect audio media contract")
		}
		if op == nil || len(op.Security) == 0 || op.Metadata["sensitive-input"] != true {
			t.Fatal("missing secured contract")
		}
	}
	req := httptest.NewRequest("POST", "/v1/dealers/dealer/inventory/piano/voice/transcribe?expectedRevision=1", strings.NewReader("audio"))
	req.Header.Set("Content-Type", "audio/wav")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != 503 || !strings.Contains(res.Body.String(), "authorization_policy_not_configured") {
		t.Fatalf("unconfigured access %d %s", res.Code, res.Body.String())
	}
}
