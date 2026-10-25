package inquiry

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type clock struct{ at time.Time }

func (c clock) Now() time.Time { return c.at }

type quota struct {
	remaining int
	failure   error
}

func (q *quota) Allow(_ context.Context, _ string, _ time.Time) (bool, error) {
	if q.failure != nil {
		return false, q.failure
	}
	if q.remaining == 0 {
		return false, nil
	}
	q.remaining--
	return true, nil
}

type challenges struct {
	valid   map[string]bool
	failure error
}

func (c *challenges) Verify(_ context.Context, token string) (bool, error) {
	if c.failure != nil {
		return false, c.failure
	}
	ok := c.valid[token]
	delete(c.valid, token)
	return ok, nil
}

type store struct {
	entries []Submission
	failure error
	visible bool
}

func (s *store) CreatePublicInquiry(_ context.Context, in Submission) error {
	if s.failure != nil {
		return s.failure
	}
	if !s.visible {
		return ports.ErrNotFound
	}
	s.entries = append(s.entries, in)
	return nil
}
func setup() (Dependencies, *store, *quota, *challenges) {
	s := &store{visible: true}
	q := &quota{remaining: 10}
	c := &challenges{valid: map[string]bool{"proof": true}}
	return Dependencies{Repository: s, Limiter: q, Challenge: c, ChallengePolicy: ChallengeEnabled, Clock: clock{time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)}, NewID: func() string { return "server-id" }}, s, q, c
}
func request() Request {
	return Request{Slug: "piano-shop", PianoID: "piano", Contact: domain.Contact{Name: " Buyer ", Email: "buyer@example.com", Message: "Hello"}, Challenge: "proof"}
}
func TestSubmissionPersistsCanonicalContactOnlyAfterChallenge(t *testing.T) {
	d, s, _, c := setup()
	service := New(d)
	if err := service.Submit(context.Background(), "source", request()); err != nil {
		t.Fatal(err)
	}
	if len(s.entries) != 1 || s.entries[0].Contact.Name != "Buyer" || s.entries[0].ID != "server-id" || s.entries[0].At != d.Clock.Now() {
		t.Fatalf("unexpected persisted command %+v", s.entries)
	}
	if c.valid["proof"] {
		t.Fatal("challenge not consumed")
	}
	if err := service.Submit(context.Background(), "source", request()); !errors.Is(err, ErrChallenge) {
		t.Fatal("challenge replay accepted")
	}
}
func TestHoneypotDoesNotConsumeChallengeOrPersistButIsLimited(t *testing.T) {
	d, s, q, c := setup()
	q.remaining = 1
	r := request()
	r.Honeypot = "bot"
	r.Contact = domain.Contact{}
	r.Slug = ""
	service := New(d)
	if err := service.Submit(context.Background(), "source", r); err != nil {
		t.Fatal(err)
	}
	if len(s.entries) != 0 || !c.valid["proof"] {
		t.Fatal("honeypot caused work")
	}
	if err := service.Submit(context.Background(), "source", r); !errors.Is(err, ports.ErrRateLimited) {
		t.Fatal("honeypot bypassed quota")
	}
}
func TestSubmissionFailsClosed(t *testing.T) {
	failure := errors.New("dependency failure")
	cases := []struct {
		name   string
		change func(*Dependencies, *store, *quota, *challenges, *Request)
	}{
		{"missing repository", func(d *Dependencies, _ *store, _ *quota, _ *challenges, _ *Request) { d.Repository = nil }},
		{"missing clock", func(d *Dependencies, _ *store, _ *quota, _ *challenges, _ *Request) { d.Clock = nil }},
		{"missing limiter", func(d *Dependencies, _ *store, _ *quota, _ *challenges, _ *Request) { d.Limiter = nil }},
		{"missing verifier", func(d *Dependencies, _ *store, _ *quota, _ *challenges, _ *Request) { d.Challenge = nil }},
		{"unset policy", func(d *Dependencies, _ *store, _ *quota, _ *challenges, _ *Request) { d.ChallengePolicy = "" }},
		{"limiter outage", func(_ *Dependencies, _ *store, q *quota, _ *challenges, _ *Request) { q.failure = failure }},
		{"verifier outage", func(_ *Dependencies, _ *store, _ *quota, c *challenges, _ *Request) { c.failure = failure }},
		{"storage outage", func(_ *Dependencies, s *store, _ *quota, _ *challenges, _ *Request) { s.failure = failure }},
		{"unpublished", func(_ *Dependencies, s *store, _ *quota, _ *challenges, _ *Request) { s.visible = false }},
		{"invalid contact", func(_ *Dependencies, _ *store, _ *quota, _ *challenges, r *Request) { r.Contact.Email = "bad" }},
		{"invalid challenge", func(_ *Dependencies, _ *store, _ *quota, _ *challenges, r *Request) { r.Challenge = "wrong" }},
		{"absent challenge", func(_ *Dependencies, _ *store, _ *quota, _ *challenges, r *Request) { r.Challenge = "" }},
		{"invalid server id", func(d *Dependencies, _ *store, _ *quota, _ *challenges, _ *Request) {
			d.NewID = func() string { return "" }
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d, s, q, c := setup()
			r := request()
			tc.change(&d, s, q, c, &r)
			if err := New(d).Submit(context.Background(), "source", r); err == nil || len(s.entries) != 0 {
				t.Fatal("failed open")
			}
		})
	}
}
func TestExplicitDisabledChallengeAndValidationOrder(t *testing.T) {
	d, s, _, c := setup()
	d.ChallengePolicy = ChallengeDisabled
	d.Challenge = nil
	r := request()
	r.Challenge = ""
	if err := New(d).Submit(context.Background(), "source", r); err != nil || len(s.entries) != 1 {
		t.Fatalf("disabled policy: %v", err)
	}
	d, s, _, c = setup()
	r = request()
	r.Contact.Email = "invalid"
	if err := New(d).Submit(context.Background(), "source", r); err == nil || !c.valid["proof"] || len(s.entries) != 0 {
		t.Fatal("invalid input consumed challenge")
	}
	r = request()
	if err := New(d).Submit(context.Background(), "", r); err == nil || !c.valid["proof"] {
		t.Fatal("missing source accepted")
	}
}

func TestRateAndSizeBoundsPreventExpensiveWork(t *testing.T) {
	for _, change := range []func(*Request){func(r *Request) { r.Honeypot = strings.Repeat("x", 257) }, func(r *Request) { r.Challenge = strings.Repeat("x", 4097) }, func(r *Request) { r.PianoID = strings.Repeat("x", 129) }, func(r *Request) { r.Slug = "not/a/slug" }} {
		d, s, _, c := setup()
		r := request()
		change(&r)
		if err := New(d).Submit(context.Background(), "source", r); err == nil || !c.valid["proof"] || len(s.entries) != 0 {
			t.Fatal("invalid input caused work")
		}
	}
	d, s, q, c := setup()
	q.remaining = 0
	if err := New(d).Submit(context.Background(), "source", request()); !errors.Is(err, ports.ErrRateLimited) || !c.valid["proof"] || len(s.entries) != 0 {
		t.Fatal("rate limit failed open")
	}
}
