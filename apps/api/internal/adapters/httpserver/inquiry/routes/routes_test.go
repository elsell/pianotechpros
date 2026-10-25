package routes_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	inquiry "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type clock struct{}

func (clock) Now() time.Time { return time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC) }

type quota struct {
	remaining int
	sources   []string
}

func (q *quota) Allow(source string, _ time.Time) bool {
	q.sources = append(q.sources, source)
	if q.remaining == 0 {
		return false
	}
	q.remaining--
	return true
}

type sourceQuota struct {
	quota
	failure error
}

func (q *sourceQuota) Allow(_ context.Context, source string, at time.Time) (bool, error) {
	return q.quota.Allow(source, at), q.failure
}

type inbox struct {
	items   []inquiry.Submission
	failure error
}

func (b *inbox) CreatePublicInquiry(_ context.Context, s inquiry.Submission) error {
	if b.failure != nil {
		return b.failure
	}
	if s.Slug != "shop" || s.PianoID != "piano" {
		return ports.ErrNotFound
	}
	b.items = append(b.items, s)
	return nil
}

type challenge struct {
	tokens   map[string]bool
	failure  error
	attempts int
}

func (c *challenge) Verify(_ context.Context, token string) (bool, error) {
	c.attempts++
	if c.failure != nil {
		return false, c.failure
	}
	valid := c.tokens[token]
	delete(c.tokens, token)
	return valid, nil
}

const validBody = `{"name":"Buyer private","email":"buyer@example.com","message":"Private message","challenge":"one-use"}`

func TestAnonymousInquiryHTTP(t *testing.T) {
	for _, test := range []struct {
		name, body, path           string
		global, submission         int
		challengeError, storeError error
		want                       int
		code                       string
		stored, verified           int
	}{
		{name: "durable success", body: validBody, global: 2, submission: 2, want: 204, stored: 1, verified: 1},
		{name: "honeypot suppressed", body: `{"honeypot":"bot"}`, global: 2, submission: 2, want: 204},
		{name: "global quota", body: validBody, submission: 2, want: 429, code: "rate_limited"},
		{name: "submission quota", body: validBody, global: 2, want: 429, code: "rate_limited"},
		{name: "malformed JSON", body: `{"name":`, global: 2, submission: 2, want: 400},
		{name: "invalid contact", body: `{"name":"Buyer private","email":"invalid","message":"Private message"}`, global: 2, submission: 2, want: 400},
		{name: "missing challenge", body: `{"name":"Buyer private","email":"buyer@example.com","message":"Private message"}`, global: 2, submission: 2, want: 400, code: "inquiry_challenge_rejected"},
		{name: "rejected challenge", body: strings.ReplaceAll(validBody, "one-use", "rejected"), global: 2, submission: 2, want: 400, code: "inquiry_challenge_rejected", verified: 1},
		{name: "challenge outage", body: validBody, global: 2, submission: 2, challengeError: errors.New("PRIVATE SECRET"), want: 503, verified: 1},
		{name: "store outage", body: validBody, global: 2, submission: 2, storeError: errors.New("PRIVATE SECRET"), want: 503, verified: 1},
		{name: "missing piano", path: "/v1/showrooms/shop/pianos/missing/inquiries", body: validBody, global: 2, submission: 2, want: 404, verified: 1},
		{name: "oversized body", body: `{"message":"` + strings.Repeat("x", 33000) + `"}`, global: 2, submission: 2, want: 413},
		{name: "owner injection", body: strings.TrimSuffix(validBody, "}") + `,"dealerId":"other"}`, global: 2, submission: 2, want: 422},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := &inbox{failure: test.storeError}
			global := &quota{remaining: test.global}
			limit := &sourceQuota{quota: quota{remaining: test.submission}}
			verifier := &challenge{tokens: map[string]bool{"one-use": true}, failure: test.challengeError}
			service := inquiry.New(inquiry.Dependencies{Repository: store, Limiter: limit, Clock: clock{}, NewID: func() string { return "server-id" }, Challenge: verifier, ChallengePolicy: inquiry.ChallengeEnabled})
			handler, _ := shared.New(app.App{}, nil, shared.Options{Clock: clock{}, RequestRateLimiter: global, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, service) }}})
			path := test.path
			if path == "" {
				path = "/v1/showrooms/shop/pianos/piano/inquiries"
			}
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(test.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("X-Forwarded-For", "203.0.113.99")
			request.RemoteAddr = "198.51.100.2:123"
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.want {
				t.Fatalf("status %d want %d: %s", response.Code, test.want, response.Body.String())
			}
			if len(store.items) != test.stored || verifier.attempts != test.verified {
				t.Fatalf("stored %d verified %d", len(store.items), verifier.attempts)
			}
			if test.code != "" && !strings.Contains(response.Body.String(), `"code":"`+test.code+`"`) {
				t.Fatal(response.Body.String())
			}
			for _, private := range []string{"Buyer private", "buyer@example.com", "Private message", "PRIVATE SECRET", "one-use", "server-id"} {
				if strings.Contains(response.Body.String(), private) {
					t.Fatalf("response leaked %s", private)
				}
			}
			if test.want == 204 && response.Body.Len() != 0 {
				t.Fatal("success has body")
			}
			for _, source := range limit.sources {
				if source != "198.51.100.2" {
					t.Fatal("untrusted source", source)
				}
			}
			if test.global > 0 && response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("missing no-store")
			}
		})
	}
}
func TestInquiryHTTPFailsClosedWithoutComposition(t *testing.T) {
	for _, withLimit := range []bool{false, true} {
		var service *inquiry.Service
		var limit ports.AuditRateLimiter
		if withLimit {
			limit = &quota{remaining: 1}
		} else {
			service = inquiry.New(inquiry.Dependencies{})
		}
		handler, _ := shared.New(app.App{}, nil, shared.Options{Clock: clock{}, RequestRateLimiter: limit, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, service) }}})
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/v1/showrooms/shop/pianos/piano/inquiries", strings.NewReader(validBody))
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != 503 {
			t.Fatal(response.Code, response.Body.String())
		}
	}
}
