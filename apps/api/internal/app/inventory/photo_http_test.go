package inventory

import (
	"bytes"
	"encoding/json"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/photoprocessor"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
)

type countedPhotoReader struct {
	reads  int
	reader io.Reader
}

func (r *countedPhotoReader) Read(p []byte) (int, error) { r.reads++; return r.reader.Read(p) }
func photoHTTP(c *Commands) http.Handler {
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterPhotos(api, c) }}})
	return h
}
func TestPhotoHTTPJourneyAndPrivateHeaders(t *testing.T) {
	c, _, _, _ := photoCommandsFixture()
	h := photoHTTP(c)
	request := func(method, path, credential, body string, want int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", credential)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", "photo-intent-00001")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != want {
			t.Fatalf("%s %s = %d want %d: %s", method, path, res.Code, want, res.Body.String())
		}
		for name, value := range map[string]string{"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"} {
			if res.Header().Get(name) != value {
				t.Fatalf("missing %s", name)
			}
		}
		return res
	}
	base := "/v1/dealers/dealer/inventory/piano/photos"
	uploaded := request("POST", base+"?expectedRevision=1", "opaque", "image bytes", 201)
	var result struct {
		Meta struct {
			PhotoID string `json:"photoID"`
		}
		Data struct {
			Photos []struct {
				ID string `json:"id"`
			}
		}
	}
	if err := json.Unmarshal(uploaded.Body.Bytes(), &result); err != nil || len(result.Data.Photos) != 1 || result.Meta.PhotoID == "" {
		t.Fatalf("upload shape: %s %v", uploaded.Body.String(), err)
	}
	photo := result.Meta.PhotoID
	request("GET", base, "opaque", "", 200)
	image := request("GET", base+"/"+photo+"/image", "opaque", "", 200)
	if image.Header().Get("Content-Type") != "image/jpeg" || !bytes.Equal(image.Body.Bytes(), []byte("image bytes")) {
		t.Fatalf("binary body: %q %s", image.Header().Get("Content-Type"), image.Body.String())
	}
	request("PATCH", base+"/"+photo, "opaque", `{"expectedRevision":2,"altText":"Keyboard"}`, 200)
	request("PUT", base+"/order", "opaque", `{"expectedRevision":3,"ids":["`+photo+`"]}`, 200)
	request("DELETE", base+"/"+photo+"?expectedRevision=3", "opaque", "", 200)
	request("GET", base+"/"+photo+"/image", "opaque", "", 404)
	request("POST", base+"?expectedRevision=1", "opaque", "image bytes", 201)
	for _, credential := range []string{"", "malformed", "expired", "wrong-issuer", "wrong-audience"} {
		request("GET", base, credential, "", 401)
		request("GET", base+"/"+photo+"/image", credential, "", 401)
	}
	request("PATCH", base+"/"+photo, "opaque", `{"expectedRevision":4,"altText":"x","storageKey":"PRIVATE-SENTINEL"}`, 422)
}
func TestPhotoHTTPDeniedUploadDoesNotReadBody(t *testing.T) {
	for _, credential := range []string{"", "provider-token"} {
		c, _, _, _ := photoCommandsFixture()
		body := &countedPhotoReader{reader: strings.NewReader("PRIVATE-SENTINEL")}
		req := httptest.NewRequest("POST", "/v1/dealers/dealer/inventory/piano/photos?expectedRevision=1", body)
		req.Header.Set("Authorization", credential)
		req.Header.Set("Idempotency-Key", "photo-intent-00001")
		res := httptest.NewRecorder()
		photoHTTP(c).ServeHTTP(res, req)
		if res.Code != 401 || body.reads != 0 || strings.Contains(res.Body.String(), "PRIVATE-SENTINEL") {
			t.Fatalf("denied upload: %d reads=%d %s", res.Code, body.reads, res.Body.String())
		}
	}
}

func TestPhotoHTTPRealProcessorLimitsAndDenialBeforeBody(t *testing.T) {
	c, f, m, _ := photoCommandsFixture()
	c.dependencies.PhotoProcessor = photoprocessor.New()
	h := photoHTTP(c)
	base := "/v1/dealers/dealer/inventory/piano/photos?expectedRevision=1"
	send := func(body io.Reader, credential string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", base, body)
		req.Header.Set("Authorization", credential)
		req.Header.Set("Idempotency-Key", "photo-real-000001")
		req.Header.Set("Content-Type", "application/octet-stream")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		return res
	}
	f.permissions["manage_inventory"] = false
	denied := &countedPhotoReader{reader: strings.NewReader("PRIVATE-IMAGE")}
	if res := send(denied, "opaque"); res.Code != 404 || denied.reads != 0 {
		t.Fatalf("denied source consumed: %d reads=%d", res.Code, denied.reads)
	}
	f.permissions["manage_inventory"] = true
	bad := send(strings.NewReader("<svg>PRIVATE-IMAGE</svg>"), "opaque")
	if bad.Code != 400 || !strings.Contains(bad.Body.String(), "invalid_photo") || strings.Contains(bad.Body.String(), "PRIVATE-IMAGE") {
		t.Fatalf("invalid content: %d %s", bad.Code, bad.Body.String())
	}
	oversized := send(bytes.NewReader(make([]byte, (20<<20)+1)), "opaque")
	if oversized.Code != 413 || !strings.Contains(oversized.Body.String(), "photo_limit_exceeded") {
		t.Fatalf("oversized stream: %d %s", oversized.Code, oversized.Body.String())
	}
	var source bytes.Buffer
	if err := png.Encode(&source, image.NewRGBA(image.Rect(0, 0, 2, 3))); err != nil {
		t.Fatal(err)
	}
	good := send(&source, "opaque")
	if good.Code != 201 || len(m.state.Photos) != 1 {
		t.Fatalf("real image: %d %s", good.Code, good.Body.String())
	}
	req := httptest.NewRequest("GET", "/v1/dealers/dealer/inventory/piano/photos/"+m.state.Photos[0].ID+"/image", nil)
	req.Header.Set("Authorization", "opaque")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, req)
	config, err := jpeg.DecodeConfig(response.Body)
	if response.Code != 200 || err != nil || config.Width != 2 || config.Height != 3 {
		t.Fatalf("normalized binary response: %d %+v %v", response.Code, config, err)
	}
}
