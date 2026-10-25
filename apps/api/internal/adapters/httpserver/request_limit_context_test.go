package httpserver

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLimitedRequestSourceIsServerOwned(t *testing.T) {
	if RequestSource(context.Background()) != "" {
		t.Fatal("unlimited context has source")
	}
	_, network, _ := net.ParseCIDR("10.0.0.0/8")
	for _, test := range []struct{ name, remote, forwarded, want string }{
		{"spoof ignored", "198.51.100.10:123", "203.0.113.1", "198.51.100.10"},
		{"trusted chain", "10.0.0.2:123", "203.0.113.1, 198.51.100.20, 10.0.0.3", "198.51.100.20"},
		{"invalid chain", "10.0.0.2:123", "invalid", "unknown"},
	} {
		t.Run(test.name, func(t *testing.T) {
			limiter := &sourceLimiter{}
			called := false
			next := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				called = true
				if !RequestLimitApplied(r.Context()) || RequestSource(r.Context()) != test.want || limiter.source != test.want {
					t.Fatal("source evidence differs from charged identity")
				}
			})
			handler := withRequestRateLimit(next, limiter, docsClock{now: time.Now()}, []*net.IPNet{network})
			r := httptest.NewRequest(http.MethodPost, "/v1/inquiries", nil)
			r.RemoteAddr = test.remote
			r.Header.Set("X-Forwarded-For", test.forwarded)
			handler.ServeHTTP(httptest.NewRecorder(), r)
			if !called {
				t.Fatal("allowed request not delivered")
			}
		})
	}
	t.Run("denied never delivered", func(t *testing.T) {
		handler := withRequestRateLimit(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("denied request delivered") }), denyLimiter{}, docsClock{now: time.Now()}, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/inquiries", nil))
		if response.Code != 429 {
			t.Fatal(response.Code)
		}
	})
}
