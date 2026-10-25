package inventory

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
)

func voiceHTTP(c *Commands) http.Handler {
	h, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterVoice(api, c) }}})
	return h
}
func TestVoiceHTTPAuthorizationAndSensitiveInputs(t *testing.T) {
	for _, kind := range []string{"success", "missing", "malformed", "expired", "wrong-issuer", "wrong-audience", "foreign", "denied", "revoked", "stale", "disabled", "empty", "oversize"} {
		t.Run(kind, func(t *testing.T) {
			c, f, _ := commandFixture()
			r, _ := c.CreateDraft(context.Background(), "opaque", "dealer", "voice-request-key")
			provider := &transcriptionFixture{transcript: "Grand piano"}
			c.dependencies.VoiceTranscriber = provider
			token, dealer, revision, want := "opaque", "dealer", "1", 200
			switch kind {
			case "missing":
				token = ""
				want = 401
			case "malformed", "expired", "wrong-issuer", "wrong-audience":
				token = kind
				want = 401
			case "foreign":
				dealer = "other"
				want = 404
			case "denied":
				f.permissions["manage_inventory"] = false
				want = 404
			case "revoked":
				provider.complete = func() { f.permissions["manage_inventory"] = false }
				want = 404
			case "stale":
				revision = "2"
				want = 409
			case "disabled":
				c.dependencies.VoiceTranscriber = nil
				want = 503
			case "empty":
				want = 400
			case "oversize":
				want = 413
			}
			content := "audio-fixture"
			if kind == "empty" {
				content = ""
			}
			if kind == "oversize" {
				content = strings.Repeat("x", 6*1024*1024+1)
			}
			body := &countedPhotoReader{reader: strings.NewReader(content)}
			req := httptest.NewRequest("POST", "/v1/dealers/"+dealer+"/inventory/"+r.ID+"/voice/transcribe?expectedRevision="+revision, body)
			req.Header.Set("Authorization", token)
			req.Header.Set("Content-Type", "audio/wav")
			res := httptest.NewRecorder()
			voiceHTTP(c).ServeHTTP(res, req)
			if res.Code != want {
				t.Fatalf("%d want %d %s", res.Code, want, res.Body.String())
			}
			if res.Header().Get("Cache-Control") != "no-store" || res.Header().Get("Referrer-Policy") != "no-referrer" {
				t.Fatal("private response cacheable")
			}
			if want == 401 || kind == "foreign" || kind == "denied" || kind == "stale" || kind == "disabled" {
				if body.reads != 0 || provider.calls != 0 {
					t.Fatal("denial consumed audio")
				}
			}
			if want != 200 && strings.Contains(res.Body.String(), "Grand piano") {
				t.Fatal("private output leaked")
			}
		})
	}
}
func TestVoiceHTTPExtraction(t *testing.T) {
	c, _, _ := commandFixture()
	r, _ := c.CreateDraft(context.Background(), "opaque", "dealer", "voice-request-key")
	p := &extractionFixture{}
	c.dependencies.VoiceExtractor = p
	for _, tc := range []struct {
		body   string
		status int
	}{{`{"expectedRevision":1,"transcript":"Grand piano"}`, 200}, {`{"expectedRevision":1,"transcript":"PRIVATE-SENTINEL","unknown":true}`, 422}, {`{"expectedRevision":1,"transcript":""}`, 422}, {`{"expectedRevision":2,"transcript":"Grand piano"}`, 409}} {
		req := httptest.NewRequest("POST", "/v1/dealers/dealer/inventory/"+r.ID+"/voice/extract", strings.NewReader(tc.body))
		req.Header.Set("Authorization", "opaque")
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		voiceHTTP(c).ServeHTTP(res, req)
		if res.Code != tc.status {
			t.Fatalf("%d %s", res.Code, res.Body.String())
		}
		if res.Code != 200 && strings.Contains(res.Body.String(), "PRIVATE-SENTINEL") {
			t.Fatal("sensitive validation echoed")
		}
	}
}

type failedVoiceReader struct{}

func (failedVoiceReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

type deadlineWriter struct {
	*httptest.ResponseRecorder
	deadline time.Time
}

func (w *deadlineWriter) SetWriteDeadline(at time.Time) error { w.deadline = at; return nil }
func TestVoiceHTTPReadFailureAndWriteDeadline(t *testing.T) {
	c, _, _ := commandFixture()
	r, _ := c.CreateDraft(context.Background(), "opaque", "dealer", "voice-request-key")
	p := &transcriptionFixture{transcript: "Grand"}
	c.dependencies.VoiceTranscriber = p
	req := httptest.NewRequest("POST", "/v1/dealers/dealer/inventory/"+r.ID+"/voice/transcribe?expectedRevision=1", failedVoiceReader{})
	req.Header.Set("Authorization", "opaque")
	req.Header.Set("Content-Type", "audio/wav")
	res := &deadlineWriter{ResponseRecorder: httptest.NewRecorder()}
	before := time.Now()
	voiceHTTP(c).ServeHTTP(res, req)
	if res.Code != 400 || p.calls != 0 {
		t.Fatal("failed read reached provider")
	}
	if res.deadline.Before(before.Add(89*time.Second)) || res.deadline.After(time.Now().Add(91*time.Second)) {
		t.Fatal("voice deadline did not reach underlying writer")
	}
}

func TestVoiceHTTPBrowserAndNativeAudioTypes(t *testing.T) {
	c, _, _ := commandFixture()
	r, _ := c.CreateDraft(context.Background(), "opaque", "dealer", "voice-request-key")
	p := &transcriptionFixture{transcript: "Grand"}
	c.dependencies.VoiceTranscriber = p
	for _, mime := range []string{"audio/webm;codecs=opus", "audio/mp4", "audio/x-m4a", "audio/ogg;codecs=opus"} {
		req := httptest.NewRequest("POST", "/v1/dealers/dealer/inventory/"+r.ID+"/voice/transcribe?expectedRevision=1", strings.NewReader("audio-fixture"))
		req.Header.Set("Authorization", "opaque")
		req.Header.Set("Content-Type", mime)
		res := httptest.NewRecorder()
		voiceHTTP(c).ServeHTTP(res, req)
		if res.Code != 200 || !strings.Contains(res.Body.String(), `"transcript":"Grand"`) {
			t.Fatalf("%s %d %s", mime, res.Code, res.Body.String())
		}
	}
}
