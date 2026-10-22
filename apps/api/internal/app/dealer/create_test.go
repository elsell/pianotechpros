package dealer

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type creationRecord struct {
	id   domain.ID
	hash []byte
}
type creationStore struct {
	*profileStore
	outbox *creationOutbox
	keys   map[string]creationRecord
}

func (r *creationStore) Create(_ context.Context, item domain.Entity, c ports.AuthorizationChange, key ports.Idempotency, e audit.Event) (domain.Entity, bool, error) {
	if r.err != nil {
		return domain.Entity{}, false, r.err
	}
	scope := key.PrincipalID + ":" + key.Operation + ":" + key.Key
	if old, ok := r.keys[scope]; ok {
		if !bytes.Equal(old.hash, key.RequestHash) {
			return domain.Entity{}, false, ports.ErrIdempotencyConflict
		}
		return r.rows[old.id], true, nil
	}
	for _, other := range r.rows {
		if other.Slug == item.Slug {
			return domain.Entity{}, false, ports.ErrConflict
		}
	}
	if r.audits.err != nil {
		return domain.Entity{}, false, r.audits.err
	}
	if !e.Valid() || c.ResourceType != "dealer" || c.SubjectID != item.OwnerUserID || c.ResourceID != string(item.ID) || c.Relation != "owner" || c.Operation != ports.AuthorizationTouch {
		return domain.Entity{}, false, ports.ErrInvalidArgument
	}
	r.rows[item.ID] = item
	if r.members[item.OwnerUserID] == nil {
		r.members[item.OwnerUserID] = map[domain.ID]bool{}
	}
	r.members[item.OwnerUserID][item.ID] = true
	r.keys[scope] = creationRecord{item.ID, append([]byte(nil), key.RequestHash...)}
	c.LockedUntil = r.outbox.clock.Now().Add(c.Lease)
	r.outbox.pending[c.ID] = c
	r.audits.events = append(r.audits.events, e)
	return item, false, nil
}

type creationOutbox struct {
	pending     map[string]ports.AuthorizationChange
	clock       *readClock
	audits      *readAudits
	completeErr error
	dead        bool
}

func (o *creationOutbox) ClaimAuthorizationChangeForResource(_ context.Context, kind, id, worker string, lease time.Duration) (ports.AuthorizationChange, error) {
	for key, c := range o.pending {
		if c.ResourceType == kind && c.ResourceID == id {
			if o.dead {
				return ports.AuthorizationChange{}, ports.ErrAuthorizationDeadLettered
			}
			if c.LockedUntil.After(o.clock.Now()) {
				return ports.AuthorizationChange{}, ports.ErrAuthorizationPending
			}
			c.LockedBy = worker
			c.LockedUntil = o.clock.Now().Add(lease)
			o.pending[key] = c
			return c, nil
		}
	}
	return ports.AuthorizationChange{}, ports.ErrNotFound
}
func (o *creationOutbox) RenewAuthorizationChange(_ context.Context, id, worker string, lease time.Duration) error {
	c, ok := o.pending[id]
	if !ok || c.LockedBy != worker || !c.LockedUntil.After(o.clock.Now()) {
		return ports.ErrNotFound
	}
	c.LockedUntil = o.clock.Now().Add(lease)
	o.pending[id] = c
	return nil
}
func (o *creationOutbox) CompleteAuthorizationChangeWithAudit(ctx context.Context, id, worker string, e audit.Event) error {
	if o.completeErr != nil {
		return o.completeErr
	}
	c, ok := o.pending[id]
	if !ok || c.LockedBy != worker || !c.LockedUntil.After(o.clock.Now()) {
		return ports.ErrNotFound
	}
	if err := o.audits.AppendAuditEvent(ctx, e); err != nil {
		return err
	}
	delete(o.pending, id)
	return nil
}
func (*creationOutbox) ClaimAuthorizationChanges(context.Context, string, time.Duration, int) ([]ports.AuthorizationChange, error) {
	return nil, ports.ErrAuthorizationPolicyNotConfigured
}
func (*creationOutbox) ClaimAuthorizationChange(context.Context, string, string, time.Duration) (ports.AuthorizationChange, error) {
	return ports.AuthorizationChange{}, ports.ErrAuthorizationPolicyNotConfigured
}
func (*creationOutbox) FailAuthorizationChange(context.Context, string, string, int, string) (bool, error) {
	return false, ports.ErrAuthorizationPolicyNotConfigured
}
func (*creationOutbox) ListAuthorizationDeadLetters(context.Context, string, ports.PageRequest) (ports.AuthorizationDeadLetterPage, error) {
	return ports.AuthorizationDeadLetterPage{}, ports.ErrAuthorizationPolicyNotConfigured
}
func (*creationOutbox) RequeueAuthorizationDeadLetter(context.Context, string, string, string, time.Duration, audit.Event) (ports.AuthorizationChange, error) {
	return ports.AuthorizationChange{}, ports.ErrAuthorizationPolicyNotConfigured
}

type creationSerializer struct{ err error }

func (s creationSerializer) WithinResource(ctx context.Context, kind, id string, run func(context.Context) error) error {
	if s.err != nil {
		return s.err
	}
	return run(ctx)
}
func creationFixture() (*Service, *creationStore, *readPermissions, *readAudits) {
	s, r, p, a := profileFixture()
	clock := &readClock{now: s.Clock.Now()}
	s.Clock = clock
	o := &creationOutbox{pending: map[string]ports.AuthorizationChange{}, clock: clock, audits: a}
	store := &creationStore{profileStore: r, outbox: o, keys: map[string]creationRecord{}}
	s.Repository = store
	s.AuthorizationOutbox = o
	s.AuthorizationSerializer = creationSerializer{}
	s.AuthorizationLease = 30 * time.Second
	s.AuthorizationWorker = "request-worker"
	counter := 0
	s.NewID = func() string { counter++; return fmt.Sprintf("created-%d", counter) }
	return s, store, p, a
}
func creationAttributes() domain.Attributes {
	return domain.Attributes{Name: "New shop", Slug: "new-shop", Email: "new@example.com", AccentColor: "#123456"}
}
func TestDealerCreationPublishesOwnerAndReplays(t *testing.T) {
	s, r, _, a := creationFixture()
	ctx := context.Background()
	item, err := s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes())
	if err != nil || item.ID == "" || item.OwnerUserID != "reader" || item.Revision != 1 || len(r.outbox.pending) != 0 {
		t.Fatalf("created: %+v %v", item, err)
	}
	replay, err := s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes())
	if err != nil || replay.ID != item.ID || len(r.rows) != 2 {
		t.Fatalf("replayed: %+v %v", replay, err)
	}
	if len(a.events) != 3 || a.events[0].Action != audit.ResourceCreated || a.events[1].Action != audit.AuthorizationApplied || a.events[2].Action != audit.ResourceViewed {
		t.Fatalf("audit: %+v", a.events)
	}
	changed := creationAttributes()
	changed.Name = "Changed"
	if _, err := s.Create(ctx, "Bearer valid", "key-012345678901", changed); !errors.Is(err, ports.ErrIdempotencyConflict) {
		t.Fatalf("key collision: %v", err)
	}
}
func TestDealerCreationRecoversPendingAuthorization(t *testing.T) {
	s, r, p, _ := creationFixture()
	ctx := context.Background()
	p.err = errors.New("SpiceDB unavailable")
	item, err := s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes())
	if !errors.Is(err, ports.ErrAuthorizationPending) || item.ID != "" || len(r.outbox.pending) != 1 {
		t.Fatalf("pending: %+v %v", item, err)
	}
	p.err = nil
	if _, err := s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes()); !errors.Is(err, ports.ErrAuthorizationPending) {
		t.Fatalf("unexpired lease: %v", err)
	}
	r.outbox.clock.now = r.outbox.clock.now.Add(time.Minute)
	item, err = s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes())
	if err != nil || item.ID == "" || len(r.outbox.pending) != 0 || len(r.rows) != 2 {
		t.Fatalf("recovered: %+v %v", item, err)
	}
}
func TestDealerCreationNeverReturnsUnauditedOrUnreadyProfile(t *testing.T) {
	failure := errors.New("unavailable")
	for _, mode := range []string{"creation audit", "completion audit", "serializer", "dead letter", "revoked replay", "missing permission replay"} {
		t.Run(mode, func(t *testing.T) {
			s, r, p, a := creationFixture()
			ctx := context.Background()
			switch mode {
			case "creation audit":
				a.err = failure
			case "completion audit":
				r.outbox.completeErr = failure
			case "serializer":
				s.AuthorizationSerializer = creationSerializer{err: failure}
			case "dead letter":
				p.err = failure
			}
			item, err := s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes())
			if mode == "revoked replay" || mode == "missing permission replay" {
				if err != nil {
					t.Fatal(err)
				}
				if mode == "revoked replay" {
					delete(r.members["reader"], item.ID)
				} else {
					delete(p.grants, "dealer:"+string(item.ID)+":manage_profile:reader")
				}
				item, err = s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes())
			}
			if mode == "dead letter" {
				r.outbox.dead = true
				p.err = nil
				item, err = s.Create(ctx, "Bearer valid", "key-012345678901", creationAttributes())
				if !errors.Is(err, ports.ErrAuthorizationDeadLettered) {
					t.Fatalf("dead letter: %v", err)
				}
			}
			if err == nil || item.ID != "" {
				t.Fatalf("unready profile returned: %+v %v", item, err)
			}
			if mode == "creation audit" && (len(r.rows) != 1 || len(r.outbox.pending) != 0) {
				t.Fatal("failed creation changed state")
			}
		})
	}
}
