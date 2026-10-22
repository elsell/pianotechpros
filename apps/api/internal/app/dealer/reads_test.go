package dealer

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type readStore struct {
	rows    map[domain.ID]domain.Entity
	members map[string]map[domain.ID]bool
	err     error
}

func (r *readStore) Get(_ context.Context, actor string, id domain.ID) (domain.Entity, error) {
	if r.err != nil {
		return domain.Entity{}, r.err
	}
	if !r.members[actor][id] {
		return domain.Entity{}, ports.ErrNotFound
	}
	item, ok := r.rows[id]
	if !ok {
		return domain.Entity{}, ports.ErrNotFound
	}
	return item, nil
}
func (r *readStore) List(ctx context.Context, actor string, p PageRequest) (Page, error) {
	if r.err != nil {
		return Page{}, r.err
	}
	items := []domain.Entity{}
	for id, item := range r.rows {
		if r.members[actor][id] && !item.CreatedAt.After(p.Snapshot) && (p.AfterID == "" || item.CreatedAt.After(p.AfterCreated) || (item.CreatedAt.Equal(p.AfterCreated) && id > p.AfterID)) {
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	more := len(items) > p.Limit
	if more {
		items = items[:p.Limit]
	}
	return Page{Items: items, HasMore: more}, nil
}
func (*readStore) Create(context.Context, domain.Entity, ports.AuthorizationChange, ports.Idempotency, audit.Event) (domain.Entity, bool, error) {
	return domain.Entity{}, false, ports.ErrAuthorizationPolicyNotConfigured
}
func (*readStore) Update(context.Context, string, domain.Entity, audit.Event) error {
	return ports.ErrAuthorizationPolicyNotConfigured
}
func (*readStore) Delete(context.Context, string, domain.ID, ports.AuthorizationChange, audit.Event) error {
	return ports.ErrAuthorizationPolicyNotConfigured
}

type readPermissions struct {
	grants map[string]bool
	err    error
}

func (p *readPermissions) Check(_ context.Context, kind, id, permission, user string) (bool, error) {
	if p.err != nil {
		return false, p.err
	}
	return p.grants[kind+":"+id+":"+permission+":"+user], nil
}
func (p *readPermissions) WriteRelationship(_ context.Context, kind, id, relation, subject, user string) error {
	if p.err != nil {
		return p.err
	}
	if subject != "user" || (relation != "owner" && relation != "editor" && relation != "viewer") {
		return ports.ErrInvalidArgument
	}
	p.grants[kind+":"+id+":view:"+user] = true
	if relation == "owner" {
		p.grants[kind+":"+id+":manage_profile:"+user] = true
	}
	return nil
}
func (p *readPermissions) DeleteRelationship(_ context.Context, kind, id, relation, subject, user string) error {
	delete(p.grants, kind+":"+id+":view:"+user)
	return nil
}

type readAudits struct {
	events []audit.Event
	err    error
}

func (a *readAudits) AppendAuditEvent(_ context.Context, e audit.Event) error {
	if a.err != nil {
		return a.err
	}
	if !e.Valid() {
		return ports.ErrInvalidArgument
	}
	a.events = append(a.events, e)
	return nil
}
func (a *readAudits) ListAuditEvents(_ context.Context, actor string, _ ports.PageRequest) (audit.Page, error) {
	var events []audit.Event
	for _, e := range a.events {
		if e.OwnerUserID == actor || e.ActorUserID == actor {
			events = append(events, e)
		}
	}
	return audit.Page{Events: events}, nil
}

type readClock struct{ now time.Time }

func (c readClock) Now() time.Time { return c.now }

type readBudget struct{ remaining int }

func (b *readBudget) Allow(_ string, _ time.Time) bool {
	if b.remaining == 0 {
		return false
	}
	b.remaining--
	return true
}
func readFixture() (*Service, *readStore, *readPermissions, *readAudits) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	r := &readStore{rows: map[domain.ID]domain.Entity{"a": {ID: "a", OwnerUserID: "owner", Revision: 1, Attributes: domain.Attributes{Name: "Private shop"}, CreatedAt: now.Add(-time.Hour)}}, members: map[string]map[domain.ID]bool{"reader": {"a": true}}}
	p := &readPermissions{grants: map[string]bool{"dealer:a:view:reader": true}}
	a := &readAudits{}
	s := New(Dependencies{Auth: fakeAuthenticator{principal: ports.Principal{UserID: "reader", Scopes: []string{"api:user"}}}, Repository: r, Authorizer: p, Audits: a, AuditRateLimiter: &readBudget{remaining: 100}, Clock: readClock{now}, CursorSigningKey: []byte(strings.Repeat("x", 32))})
	return s, r, p, a
}
func TestPrivateReadRequiresMembershipPermissionAndAudit(t *testing.T) {
	failure := errors.New("dependency unavailable")
	cases := []struct {
		name    string
		modify  func(*Service, *readStore, *readPermissions, *readAudits)
		want    error
		action  audit.Action
		outcome audit.Outcome
	}{
		{"allowed", func(*Service, *readStore, *readPermissions, *readAudits) {}, nil, audit.ResourceViewed, audit.Succeeded},
		{"revoked membership", func(_ *Service, r *readStore, _ *readPermissions, _ *readAudits) { delete(r.members["reader"], "a") }, ports.ErrNotFound, audit.ResourceAccessDenied, audit.Denied},
		{"missing row", func(_ *Service, r *readStore, _ *readPermissions, _ *readAudits) { delete(r.rows, "a") }, ports.ErrNotFound, audit.ResourceAccessDenied, audit.Denied},
		{"pending or denied permission", func(_ *Service, _ *readStore, p *readPermissions, _ *readAudits) { p.grants = map[string]bool{} }, ports.ErrNotFound, audit.ResourceAccessDenied, audit.Denied},
		{"permission failure", func(_ *Service, _ *readStore, p *readPermissions, _ *readAudits) { p.err = failure }, failure, audit.ResourceAccessDenied, audit.Failed},
		{"persistence failure", func(_ *Service, r *readStore, _ *readPermissions, _ *readAudits) { r.err = failure }, failure, "", ""},
		{"audit failure", func(_ *Service, _ *readStore, _ *readPermissions, a *readAudits) { a.err = failure }, failure, "", ""},
		{"rate limit", func(s *Service, _ *readStore, _ *readPermissions, _ *readAudits) { s.AuditRateLimiter = &readBudget{} }, ports.ErrRateLimited, "", ""},
		{"empty principal", func(s *Service, _ *readStore, _ *readPermissions, _ *readAudits) { s.Auth = fakeAuthenticator{} }, ports.ErrInvalidCredential, "", ""},
		{"missing scope", func(s *Service, _ *readStore, _ *readPermissions, _ *readAudits) {
			s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "reader"}}
		}, ports.ErrInvalidCredential, "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, r, p, a := readFixture()
			c.modify(s, r, p, a)
			item, err := s.Get(context.Background(), "Bearer valid", "a")
			if !errors.Is(err, c.want) {
				t.Fatalf("got %v, want %v", err, c.want)
			}
			if c.want == nil && item.ID != "a" {
				t.Fatal("missing permitted profile")
			}
			if c.want != nil && item.ID != "" {
				t.Fatal("failed read leaked data")
			}
			if c.action != "" {
				if len(a.events) != 1 || a.events[0].Action != c.action || a.events[0].Outcome != c.outcome {
					t.Fatalf("audit: %+v", a.events)
				}
				if c.action == audit.ResourceAccessDenied && a.events[0].OwnerUserID != "reader" {
					t.Fatal("denial revealed owner")
				}
			} else if len(a.events) != 0 {
				t.Fatalf("unexpected events: %+v", a.events)
			}
		})
	}
}
func TestListFiltersPermissionsAndBindsContinuationToActor(t *testing.T) {
	s, r, p, a := readFixture()
	b := r.rows["a"]
	b.ID = "b"
	r.rows["b"] = b
	r.members["reader"]["b"] = true
	p.grants = map[string]bool{"dealer:b:view:reader": true}
	items, cursor, err := s.List(context.Background(), "Bearer valid", "", 1)
	if err != nil || len(items) != 0 || cursor == "" {
		t.Fatalf("filtered first page: %+v %q %v", items, cursor, err)
	}
	decoded, _ := base64.RawURLEncoding.DecodeString(cursor)
	if bytes.Contains(decoded, []byte(`"AfterID":"a"`)) {
		t.Fatal("cursor reveals denied dealer ID")
	}
	if a.events[0].TargetID != "dealer" {
		t.Fatal("list denial audit reveals a server-discovered dealer ID")
	}
	items, next, err := s.List(context.Background(), "Bearer valid", cursor, 1)
	if err != nil || len(items) != 1 || items[0].ID != "b" || next != "" {
		t.Fatalf("second page: %+v %q %v", items, next, err)
	}
	if len(a.events) != 3 || a.events[0].Action != audit.ResourceAccessDenied {
		t.Fatalf("list audits: %+v", a.events)
	}
	for _, bad := range []string{cursor + "x", "not-a-cursor"} {
		if _, _, err := s.List(context.Background(), "Bearer valid", bad, 1); !errors.Is(err, ports.ErrInvalidArgument) {
			t.Fatalf("tampered cursor: %v", err)
		}
	}
	s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "other", Scopes: []string{"api:user"}}}
	if _, _, err := s.List(context.Background(), "Bearer valid", cursor, 1); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("cross-actor cursor: %v", err)
	}
}
func TestListDiscardsResultsOnDependencyAndAuditFailures(t *testing.T) {
	failure := errors.New("unavailable")
	for _, dependency := range []string{"permission", "repository", "audit"} {
		t.Run(dependency, func(t *testing.T) {
			s, r, p, a := readFixture()
			switch dependency {
			case "permission":
				p.err = failure
			case "repository":
				r.err = failure
			case "audit":
				a.err = failure
			}
			items, cursor, err := s.List(context.Background(), "Bearer valid", "", 50)
			if !errors.Is(err, failure) || len(items) != 0 || cursor != "" {
				t.Fatalf("partial data leaked: %+v %q %v", items, cursor, err)
			}
		})
	}
}
