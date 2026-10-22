package dealer

import (
	"context"
	"errors"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

// Stateful repository fake preserves the transactional commit boundary: an audit
// failure or stale revision leaves both the entity and event collection unchanged.
type profileStore struct {
	*readStore
	audits      *readAudits
	beforeWrite func()
}

func (r *profileStore) Update(_ context.Context, actor string, item domain.Entity, event audit.Event) error {
	if r.beforeWrite != nil {
		r.beforeWrite()
	}
	if r.err != nil {
		return r.err
	}
	current, ok := r.rows[item.ID]
	if !ok || !r.members[actor][item.ID] || current.OwnerUserID != actor {
		return ports.ErrNotFound
	}
	if current.Revision != item.Revision {
		return ports.ErrConflict
	}
	for id, other := range r.rows {
		if id != item.ID && other.Slug == item.Slug {
			return ports.ErrConflict
		}
	}
	if r.audits.err != nil {
		return r.audits.err
	}
	if !event.Valid() {
		return ports.ErrInvalidArgument
	}
	item.Revision++
	r.rows[item.ID] = item
	r.audits.events = append(r.audits.events, event)
	return nil
}
func profileFixture() (*Service, *profileStore, *readPermissions, *readAudits) {
	s, r, p, a := readFixture()
	item := r.rows["a"]
	item.OwnerUserID = "reader"
	item.Attributes = domain.Attributes{Name: "Original", Slug: "original", Email: "owner@example.com", AccentColor: "#123456"}
	r.rows["a"] = item
	store := &profileStore{readStore: r, audits: a}
	s.Repository = store
	p.grants["dealer:a:manage_profile:reader"] = true
	return s, store, p, a
}
func TestOwnerProfileUpdateAndRevisionConflict(t *testing.T) {
	s, r, _, a := profileFixture()
	old := r.rows["a"]
	attrs := old.Attributes
	attrs.Name = " Updated "
	item, err := s.Update(context.Background(), "Bearer valid", "a", 1, attrs)
	if err != nil || item.Revision != 2 || item.Name != "Updated" || item.ID != old.ID || item.OwnerUserID != old.OwnerUserID || !item.CreatedAt.Equal(old.CreatedAt) || !item.UpdatedAt.Equal(s.Clock.Now()) {
		t.Fatalf("updated profile: %+v, %v", item, err)
	}
	if len(a.events) != 1 || a.events[0].Action != audit.ResourceUpdated || a.events[0].ActorUserID != "reader" {
		t.Fatalf("mutation audit: %+v", a.events)
	}
	attrs.Name = "Stale overwrite"
	if _, err := s.Update(context.Background(), "Bearer valid", "a", 1, attrs); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stale write: %v", err)
	}
	if r.rows["a"].Name != "Updated" || len(a.events) != 1 {
		t.Fatal("stale write changed data or mutation history")
	}
}
func TestProfileUpdateFailsClosed(t *testing.T) {
	failure := errors.New("dependency unavailable")
	cases := []struct {
		name     string
		setup    func(*Service, *profileStore, *readPermissions, *readAudits)
		revision int64
		want     error
	}{
		{"viewer", func(_ *Service, _ *profileStore, p *readPermissions, _ *readAudits) {
			delete(p.grants, "dealer:a:manage_profile:reader")
		}, 1, ports.ErrNotFound},
		{"not founding owner", func(_ *Service, r *profileStore, _ *readPermissions, _ *readAudits) {
			item := r.rows["a"]
			item.OwnerUserID = "other"
			r.rows["a"] = item
		}, 1, ports.ErrNotFound},
		{"revoked", func(_ *Service, r *profileStore, _ *readPermissions, _ *readAudits) { delete(r.members["reader"], "a") }, 1, ports.ErrNotFound},
		{"revoked at commit", func(_ *Service, r *profileStore, _ *readPermissions, _ *readAudits) {
			r.beforeWrite = func() { delete(r.members["reader"], "a") }
		}, 1, ports.ErrNotFound},
		{"audit failure", func(_ *Service, _ *profileStore, _ *readPermissions, a *readAudits) { a.err = failure }, 1, failure},
		{"permission failure", func(_ *Service, _ *profileStore, p *readPermissions, _ *readAudits) { p.err = failure }, 1, failure},
		{"repository failure", func(_ *Service, r *profileStore, _ *readPermissions, _ *readAudits) { r.err = failure }, 1, failure},
		{"invalid revision", func(*Service, *profileStore, *readPermissions, *readAudits) {}, 0, ports.ErrInvalidArgument},
		{"cross-user stale revision", func(_ *Service, r *profileStore, _ *readPermissions, _ *readAudits) { delete(r.members["reader"], "a") }, 99, ports.ErrNotFound},
		{"slug conflict", func(_ *Service, r *profileStore, _ *readPermissions, _ *readAudits) {
			other := r.rows["a"]
			other.ID = "b"
			r.rows["b"] = other
		}, 1, ports.ErrConflict},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, r, p, a := profileFixture()
			attrs := r.rows["a"].Attributes
			attrs.Name = "Changed"
			c.setup(s, r, p, a)
			item, err := s.Update(context.Background(), "Bearer valid", "a", c.revision, attrs)
			if !errors.Is(err, c.want) || item.ID != "" {
				t.Fatalf("failed update returned %+v, %v", item, err)
			}
			if r.rows["a"].Name != "Original" || r.rows["a"].Revision != 1 {
				t.Fatal("failed update mutated profile")
			}
			for _, event := range a.events {
				if event.Action == audit.ResourceUpdated {
					t.Fatal("failed update recorded successful mutation")
				}
			}
		})
	}
}
