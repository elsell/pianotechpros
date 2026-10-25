package geminivoice

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func envelope(payload string) string {
	b, _ := json.Marshal(map[string]any{"candidates": []any{map[string]any{"finishReason": "STOP", "content": map[string]any{"parts": []any{map[string]any{"text": payload}}}}}})
	return string(b)
}
func fixture(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	s := httptest.NewServer(handler)
	t.Cleanup(s.Close)
	c, err := New("test-api-key", "transcription-model", "extraction-model")
	if err != nil {
		t.Fatal(err)
	}
	c.endpoint = s.URL + "/"
	return c
}
func TestExtractionRealHTTP(t *testing.T) {
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/extraction-model:generateContent" || r.URL.RawQuery != "" || r.Header.Get("x-goog-api-key") != "test-api-key" || r.Method != "POST" {
			t.Error("invalid provider request")
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Error("bad JSON")
		}
		if body["tools"] != nil || body["systemInstruction"] == nil || body["generationConfig"] == nil {
			t.Error("missing constrained instruction or unexpected tools")
		}
		_, _ = w.Write([]byte(envelope(`{"candidates":[{"field":"featured","value":{"boolean":false},"confidence":"high","evidence":"not featured"},{"field":"asking_price","value":{"money":{"minor_units":0,"currency":"USD"}},"confidence":"uncertain","evidence":"zero dollars"}]}`)))
	})
	candidates, err := c.Extract(context.Background(), "not featured, zero dollars")
	if err != nil || len(candidates) != 2 || *candidates[0].Value.Boolean || candidates[1].Value.Money.MinorUnits != 0 {
		t.Fatalf("%+v %v", candidates, err)
	}
}
func TestTranscriptionFormatsAndBounds(t *testing.T) {
	calls := 0
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body struct {
			Contents []struct {
				Parts []struct {
					InlineData struct {
						MIME string `json:"mimeType"`
						Data []byte `json:"data"`
					} `json:"inlineData"`
				}
			}
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if r.URL.Path != "/transcription-model:generateContent" || len(body.Contents) != 1 || len(body.Contents[0].Parts) != 1 || string(body.Contents[0].Parts[0].InlineData.Data) != "audio-fixture" {
			t.Error("invalid audio input")
		}
		_, _ = w.Write([]byte(envelope(`{"transcript":"Grand piano"}`)))
	})
	for _, mime := range []string{"audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/mpeg"} {
		got, err := c.Transcribe(context.Background(), []byte("audio-fixture"), mime)
		if err != nil || got != "Grand piano" {
			t.Fatalf("%s %s %v", mime, got, err)
		}
	}
	before := calls
	for _, mime := range []string{"text/plain", "audio/webm;evil=1", "audio/mp4;codecs=unknown"} {
		if _, err := c.Transcribe(context.Background(), []byte("x"), mime); err == nil {
			t.Fatal("invalid type accepted")
		}
	}
	for _, audio := range [][]byte{nil, make([]byte, 6*1024*1024+1)} {
		if _, err := c.Transcribe(context.Background(), audio, "audio/wav"); err == nil {
			t.Fatal("bad length accepted")
		}
	}
	if calls != before {
		t.Fatal("invalid input reached provider")
	}
}
func TestProviderRejectsInvalidOutput(t *testing.T) {
	for _, payload := range []string{
		`{"candidates":[{"field":"publish"}]}`,
		`{"candidates":[],"extra":true}`,
		`{"candidates":[],"candidates":[]}`,
		`{"candidates":null}`,
		`{"candidates":[],"Candidates":[]}`,
		`{"Candidates":[]}`,
		`{"candidates":[{"field":"title","value":{"text":"Grand","Text":"Other"},"confidence":"high","evidence":"Grand"}]}`,
		`{"candidates":[{"field":"asking_price","value":{"money":{"currency":"USD"}},"confidence":"high","evidence":"Grand"}]}`,
		`{"candidates":[{"field":"manufactured","value":{"date":{"year":1920}},"confidence":"high","evidence":"Grand"}]}`,
		`{"candidates":[{"field":"featured","value":{"boolean":"false"},"confidence":"high","evidence":"Grand"}]}`,
		`{"candidates":[{"field":"title","value":{"text":"Piano"},"confidence":"high","evidence":"invented"}]}`,
		`{"candidates":[]} {}`,
	} {
		t.Run(payload, func(t *testing.T) {
			c := fixture(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(envelope(payload))) })
			if _, err := c.Extract(context.Background(), "Grand"); err != ErrUnavailable {
				t.Fatalf("got %v", err)
			}
		})
	}
	for _, body := range []string{`{}`, `{"candidates":[]}`, `{"candidates":[{"finishReason":"MAX_TOKENS"}]}`, `{"promptFeedback":{"blockReason":"SAFETY"},"candidates":[]}`, strings.Repeat("x", 262145)} {
		c := fixture(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(body)) })
		if _, err := c.Extract(context.Background(), "Grand"); err != ErrUnavailable {
			t.Fatalf("got %v", err)
		}
	}
	for _, payload := range []string{`{"transcript":""}`, `{"transcript":null}`, `{"transcript":"ok","extra":1}`, `{"transcript":"first","Transcript":"second"}`, `{"transcript":"\ud800"}`} {
		c := fixture(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(envelope(payload))) })
		if _, err := c.Transcribe(context.Background(), []byte("x"), "audio/wav"); err != ErrUnavailable {
			t.Fatalf("got %v", err)
		}
	}
}
func TestTransportAndConfigurationFailures(t *testing.T) {
	for _, values := range [][3]string{{"", "model", "model"}, {"key\nsecret", "model", "model"}, {"key", "../model", "model"}, {"key", "model", ""}} {
		if _, err := New(values[0], values[1], values[2]); err == nil {
			t.Fatal("unsafe config")
		}
	}
	for _, status := range []int{302, 401, 429, 500} {
		c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Location", "https://example.invalid/secret")
			w.WriteHeader(status)
			_, _ = w.Write([]byte("private provider error"))
		})
		if _, err := c.Extract(context.Background(), "Grand"); err != ErrUnavailable {
			t.Fatal(err)
		}
	}
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) { _, _ = io.Copy(io.Discard, r.Body); <-r.Context().Done() })
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := c.Extract(ctx, "Grand"); err != ErrUnavailable {
		t.Fatal(err)
	}
}

func TestProviderMappingAndInputIsolation(t *testing.T) {
	calls := 0
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(envelope(`{"candidates":[{"field":"manufactured","value":{"date":{"year":1920,"month":0,"day":0}},"confidence":"high","evidence":"1920"},{"field":"make","value":{"text":"Yamaha"},"confidence":"high","evidence":"Yamaha"}]}`)))
	})
	out, err := c.Extract(context.Background(), "1920 Yamaha")
	if err != nil || len(out) != 2 || out[0].Value.Date.Year != 1920 || out[0].Value.Date.Month != 0 || *out[1].Value.Text != "Yamaha" {
		t.Fatalf("%+v %v", out, err)
	}
	for _, input := range []string{" ", strings.Repeat("x", 16001), string([]byte{255})} {
		if _, err := c.Extract(context.Background(), input); err != ErrUnavailable {
			t.Fatal("invalid transcript accepted")
		}
	}
	if calls != 1 {
		t.Fatal("invalid transcript sent externally")
	}
}

func TestEnvelopeExactSafetyFlagsAndUnicode(t *testing.T) {
	good := envelope(`{"candidates":[]}`)
	for _, body := range []string{
		strings.Replace(good, `"finishReason":"STOP"`, `"finishReason":"MAX_TOKENS","FinishReason":"STOP"`, 1),
		strings.Replace(good, `"finishReason":"STOP"`, `"finishReason":"STOP","safetyRatings":[{"blocked":true,"Blocked":false}]`, 1),
	} {
		c := fixture(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(body)) })
		if _, err := c.Extract(context.Background(), "Grand"); err != ErrUnavailable {
			t.Fatal("unsafe envelope accepted")
		}
	}
	for _, input := range []string{`{"s":"\ud800"}`, `{"s":"\udc00"}`, `{"s":"\ud800\u0041"}`} {
		if uniqueJSON([]byte(input)) == nil {
			t.Fatal("malformed surrogate accepted")
		}
	}
	for _, input := range []string{`{"s":"\ud83c\udfb9"}`, `{"s":"\\ud800"}`, `{"s":"piano 🎹"}`} {
		if uniqueJSON([]byte(input)) != nil {
			t.Fatal("valid Unicode rejected")
		}
	}
}
