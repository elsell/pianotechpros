package technician

import (
	"bytes"
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type profileZones struct{}

func (profileZones) Contains(s string) bool { return s == "UTC" }
func (profileZones) Names() []string        { return []string{"UTC"} }

type profileFixture struct {
	now                                                       time.Time
	entity                                                    domain.Entity
	grants                                                    map[string]bool
	pending                                                   map[string]ports.AuthorizationChange
	events                                                    []audit.Event
	reservation                                               ports.Idempotency
	checkErr, writeGrantErr, auditErr, readErr, completionErr error
	foreign, limited                                          bool
	grantWrites, sequence, reads                              int
}

func profileAttributes() domain.Attributes {
	return domain.Attributes{Name: "Technician", Email: "technician@example.test", Origin: domain.Origin{Label: "Workshop", Street1: "1 Example Street", City: "Example", Region: "NY", PostalCode: "10001", Timezone: "UTC"}, RadiusMiles: 25}
}
func profileService(t *testing.T) (*profileFixture, *Profiles) {
	t.Helper()
	f := &profileFixture{now: time.Date(2026, 10, 25, 12, 0, 0, 123456789, time.UTC), grants: map[string]bool{}, pending: map[string]ports.AuthorizationChange{}}
	deps := Dependencies{Auth: fakeAuthenticator{principal: ports.Principal{UserID: "owner", Scopes: []string{"api:user"}}}, Authorizer: f, AuthorizationOutbox: f, AuthorizationSerializer: f, Repository: f, Audits: f, AuditRateLimiter: f, Clock: f, NewID: func() string { f.sequence++; return fmt.Sprintf("id-%d", f.sequence) }, AuthorizationWorker: "worker", AuthorizationLease: time.Minute}
	return f, NewProfiles(deps, profileZones{})
}
func (f *profileFixture) Now() time.Time               { return f.now }
func (f *profileFixture) Allow(string, time.Time) bool { return !f.limited }
func (f *profileFixture) copy() (domain.Entity, error) {
	e := f.entity
	if e.ID == "" {
		return domain.Entity{}, ports.ErrNotFound
	}
	return domain.Restore(e.ID, e.OwnerUserID, e.Attributes, e.Revision, e.CreatedAt, e.UpdatedAt, profileZones{})
}
func (f *profileFixture) GetOwn(_ context.Context, owner string) (domain.Entity, error) {
	f.reads++
	if f.readErr != nil {
		return domain.Entity{}, f.readErr
	}
	if f.entity.OwnerUserID != owner {
		return domain.Entity{}, ports.ErrNotFound
	}
	e, err := f.copy()
	if f.foreign {
		e.OwnerUserID = "foreign"
	}
	return e, err
}
func (f *profileFixture) Get(ctx context.Context, owner string, id domain.ID) (domain.Entity, error) {
	if f.entity.ID != id {
		return domain.Entity{}, ports.ErrNotFound
	}
	return f.GetOwn(ctx, owner)
}
func (f *profileFixture) Create(ctx context.Context, e domain.Entity, c ports.AuthorizationChange, i ports.Idempotency, a audit.Event) (domain.Entity, bool, error) {
	if f.entity.ID != "" {
		if i.PrincipalID != f.reservation.PrincipalID || i.Key != f.reservation.Key {
			return domain.Entity{}, false, ports.ErrConflict
		}
		if !bytes.Equal(i.RequestHash, f.reservation.RequestHash) {
			return domain.Entity{}, false, ports.ErrIdempotencyConflict
		}
		got, err := f.copy()
		return got, true, err
	}
	if err := f.AppendAuditEvent(ctx, a); err != nil {
		return domain.Entity{}, false, err
	}
	f.entity = e
	f.pending[c.ID] = c
	f.reservation = i
	got, err := f.copy()
	return got, false, err
}
func (f *profileFixture) Save(ctx context.Context, owner string, id domain.ID, expected int64, attrs domain.Attributes, now time.Time, a audit.Event) (domain.Entity, bool, error) {
	current, err := f.Get(ctx, owner, id)
	if err != nil {
		return domain.Entity{}, false, err
	}
	e, changed, err := domain.Revise(current, expected, attrs, profileZones{}, now)
	if err != nil {
		return domain.Entity{}, false, err
	}
	if err := f.AppendAuditEvent(ctx, a); err != nil {
		return domain.Entity{}, false, err
	}
	f.entity = e
	got, err := f.copy()
	return got, changed, err
}
func (f *profileFixture) Check(_ context.Context, kind, id, permission, user string) (bool, error) {
	if f.checkErr != nil {
		return false, f.checkErr
	}
	return kind == "technician" && user == "owner" && (permission == "view" || permission == "update") && f.grants[id], nil
}
func (f *profileFixture) WriteRelationship(_ context.Context, kind, id, relation, subject, user string) error {
	f.grantWrites++
	if f.writeGrantErr != nil {
		return f.writeGrantErr
	}
	if kind != "technician" || relation != "owner" || subject != "user" || user != "owner" {
		return ports.ErrInvalidArgument
	}
	f.grants[id] = true
	return nil
}
func (f *profileFixture) DeleteRelationship(_ context.Context, _, id, _, _, _ string) error {
	delete(f.grants, id)
	return nil
}
func (f *profileFixture) AppendAuditEvent(_ context.Context, event audit.Event) error {
	if f.auditErr != nil {
		return f.auditErr
	}
	if !event.Valid() {
		return ports.ErrInvalidArgument
	}
	f.events = append(f.events, event)
	return nil
}
func (f *profileFixture) ListAuditEvents(context.Context, string, ports.PageRequest) (audit.Page, error) {
	return audit.Page{Events: append([]audit.Event(nil), f.events...)}, nil
}
func (f *profileFixture) WithinResource(ctx context.Context, kind, id string, run func(context.Context) error) error {
	if kind != "technician" || id == "" {
		return ports.ErrInvalidArgument
	}
	return run(ctx)
}
func (f *profileFixture) ClaimAuthorizationChange(_ context.Context, id, worker string, lease time.Duration) (ports.AuthorizationChange, error) {
	c, ok := f.pending[id]
	if !ok {
		return c, ports.ErrNotFound
	}
	c.LockedBy = worker
	c.Lease = lease
	f.pending[id] = c
	return c, nil
}
func (f *profileFixture) ClaimAuthorizationChangeForResource(ctx context.Context, kind, id, worker string, lease time.Duration) (ports.AuthorizationChange, error) {
	for key, c := range f.pending {
		if c.ResourceType == kind && c.ResourceID == id {
			return f.ClaimAuthorizationChange(ctx, key, worker, lease)
		}
	}
	return ports.AuthorizationChange{}, ports.ErrNotFound
}
func (f *profileFixture) ClaimAuthorizationChanges(ctx context.Context, worker string, lease time.Duration, limit int) ([]ports.AuthorizationChange, error) {
	var result []ports.AuthorizationChange
	for id := range f.pending {
		if len(result) >= limit {
			break
		}
		c, err := f.ClaimAuthorizationChange(ctx, id, worker, lease)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, nil
}
func (f *profileFixture) RenewAuthorizationChange(_ context.Context, id, worker string, _ time.Duration) error {
	c, ok := f.pending[id]
	if !ok || c.LockedBy != worker {
		return ports.ErrNotFound
	}
	return nil
}
func (f *profileFixture) CompleteAuthorizationChangeWithAudit(ctx context.Context, id, worker string, event audit.Event) error {
	if f.completionErr != nil {
		return f.completionErr
	}
	if err := f.RenewAuthorizationChange(ctx, id, worker, time.Minute); err != nil {
		return err
	}
	if err := f.AppendAuditEvent(ctx, event); err != nil {
		return err
	}
	delete(f.pending, id)
	return nil
}
func (f *profileFixture) FailAuthorizationChange(context.Context, string, string, int, string) (bool, error) {
	return false, ports.ErrNotFound
}
func (f *profileFixture) ListAuthorizationDeadLetters(context.Context, string, ports.PageRequest) (ports.AuthorizationDeadLetterPage, error) {
	return ports.AuthorizationDeadLetterPage{}, nil
}
func (f *profileFixture) RequeueAuthorizationDeadLetter(context.Context, string, string, string, time.Duration, audit.Event) (ports.AuthorizationChange, error) {
	return ports.AuthorizationChange{}, ports.ErrNotFound
}

func (f *profileFixture) AuthorizationReady(_ context.Context, owner string, id domain.ID) (bool, error) {
	if f.entity.ID != id || f.entity.OwnerUserID != owner {
		return false, ports.ErrNotFound
	}
	if len(f.pending) > 0 {
		return false, nil
	}
	return true, nil
}
