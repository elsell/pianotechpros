package turnstile

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fixedClock struct{ at time.Time }

func (c fixedClock) Now() time.Time { return c.at }
func TestVerifyThroughTLSProvider(t *testing.T) {
	now := time.Date(2026, 10, 25, 3, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name, body string
		status     int
		want       bool
		failure    bool
	}{
		{"valid", `{"success":true,"hostname":"shop.example.com","action":"inquiry","challenge_ts":"2026-10-25T02:59:00Z"}`, 200, true, false},
		{"rejected", `{"success":false,"error-codes":["timeout-or-duplicate"]}`, 200, false, false},
		{"wrong host", `{"success":true,"hostname":"attacker.example.com","action":"inquiry","challenge_ts":"2026-10-25T02:59:00Z"}`, 200, false, false},
		{"wrong action", `{"success":true,"hostname":"shop.example.com","action":"login","challenge_ts":"2026-10-25T02:59:00Z"}`, 200, false, false},
		{"expired", `{"success":true,"hostname":"shop.example.com","action":"inquiry","challenge_ts":"2026-10-25T02:54:59Z"}`, 200, false, false},
		{"future", `{"success":true,"hostname":"shop.example.com","action":"inquiry","challenge_ts":"2026-10-25T03:00:31Z"}`, 200, false, false},
		{"missing timestamp", `{"success":true,"hostname":"shop.example.com","action":"inquiry"}`, 200, false, false},
		{"contradictory", `{"success":true,"hostname":"shop.example.com","action":"inquiry","challenge_ts":"2026-10-25T02:59:00Z","error-codes":["internal-error"]}`, 200, false, true},
		{"provider failure", `{"success":false,"error-codes":["internal-error"]}`, 200, false, true},
		{"bad secret", `{"success":false,"error-codes":["invalid-input-secret"]}`, 200, false, true},
		{"outage", `PRIVATE PROVIDER DATA`, 503, false, true},
		{"malformed", `PRIVATE PROVIDER DATA`, 200, false, true},
		{"trailing document", `{"success":false} {}`, 200, false, true},
		{"oversized", strings.Repeat("x", 16385), 200, false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "POST" {
					t.Error("method")
				}
				if err := r.ParseForm(); err != nil {
					t.Error(err)
				}
				if r.Form.Get("secret") != "test-secret" || r.Form.Get("response") != "test-proof" || len(r.Form) != 2 {
					t.Error("verification parameters")
				}
				w.WriteHeader(test.status)
				fmt.Fprint(w, test.body)
			}))
			defer server.Close()
			verifier, err := New("test-secret", "shop.example.com", fixedClock{now})
			if err != nil {
				t.Fatal(err)
			}
			verifier.endpoint = server.URL
			verifier.client.Transport = server.Client().Transport
			accepted, err := verifier.Verify(context.Background(), "test-proof")
			if accepted != test.want || (err != nil) != test.failure {
				t.Fatalf("accepted %v err %v", accepted, err)
			}
			if err != nil && err.Error() != "challenge verification unavailable" {
				t.Fatal("provider detail escaped", err)
			}
		})
	}
}
func TestVerifierRejectsRedirectAndCancellation(t *testing.T) {
	target := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("redirect forwarded credentials") }))
	defer target.Close()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 307) }))
	defer server.Close()
	verifier, _ := New("test-secret", "shop.example.com", fixedClock{time.Now()})
	verifier.endpoint = server.URL
	verifier.client.Transport = server.Client().Transport
	if ok, err := verifier.Verify(context.Background(), "proof"); ok || err == nil {
		t.Fatal("redirect accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if ok, err := verifier.Verify(ctx, "proof"); ok || err == nil {
		t.Fatal("cancel accepted")
	}
}
func TestVerifierConfigurationAndTokenBounds(t *testing.T) {
	for _, host := range []string{"", "https://shop.example.com", "shop.example.com/path", "shop.example.com:443", "shop.example.com\n", "*.example.com"} {
		if _, err := New("secret", host, fixedClock{}); err == nil {
			t.Fatal("accepted host", host)
		}
	}
	if _, err := New("", "shop.example.com", fixedClock{}); err == nil {
		t.Fatal("missing secret")
	}
	if _, err := New("secret", "shop.example.com", nil); err == nil {
		t.Fatal("missing clock")
	}
	verifier, _ := New("secret", "shop.example.com", fixedClock{})
	for _, token := range []string{"", strings.Repeat("x", 2049), "bad\ntoken"} {
		if ok, err := verifier.Verify(context.Background(), token); ok || err != nil {
			t.Fatal("invalid token not rejected locally")
		}
	}
}
