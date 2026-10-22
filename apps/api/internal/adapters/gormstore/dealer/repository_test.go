package dealerstore

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"flag"
	"fmt"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"net/url"
	"sync"
	"testing"
	"time"
)

var databaseDSN = flag.String("database-dsn", "", "PostgreSQL integration test DSN")
var testTime = time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)

type testUser struct {
	ID, Email, DisplayName, Status string
	CreatedAt, UpdatedAt           time.Time
}

func seedUser(t *testing.T, db *gorm.DB, id string) {
	t.Helper()
	if err := db.Table("user_models").Create(&testUser{ID: id, Email: id + "@example.com", DisplayName: id, Status: "active", CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
}
func connection(t *testing.T, runtime bool) *gorm.DB {
	t.Helper()
	if *databaseDSN == "" {
		t.Skip("-database-dsn is required for isolated PostgreSQL integration")
	}
	dsn, err := url.Parse(*databaseDSN)
	if err != nil {
		t.Fatal(err)
	}
	if runtime {
		dsn.User = url.UserPassword("app", "app")
	}
	db, err := gorm.Open(postgres.Open(dsn.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { _ = sqlDB.Close() })
	return db
}
func database(t *testing.T) *gorm.DB {
	t.Helper()
	db := connection(t, false)
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	t.Cleanup(func() { _ = tx.Rollback().Error })
	for _, id := range []string{"owner", "staff", "outsider"} {
		seedUser(t, tx, id)
	}
	return tx
}
func fixture(t *testing.T) (domain.Entity, ports.AuthorizationChange, ports.Idempotency, audit.Event) {
	t.Helper()
	e, err := domain.New("shop", "owner", domain.Attributes{Name: "Piano Shop", Slug: "piano-shop", Email: "shop@example.com", AccentColor: "#176b5b"})
	if err != nil {
		t.Fatal(err)
	}
	e.CreatedAt = testTime
	e.UpdatedAt = testTime
	change := ports.AuthorizationChange{ID: "owner-grant", ResourceType: "dealer", ResourceID: string(e.ID), Relation: "owner", SubjectType: "user", SubjectID: e.OwnerUserID, OwnerUserID: e.OwnerUserID, ActorUserID: e.OwnerUserID, Operation: ports.AuthorizationTouch, LockedBy: "worker", Lease: time.Minute}
	key := ports.Idempotency{PrincipalID: e.OwnerUserID, Operation: "dealer.create", Key: "create-shop", RequestHash: make([]byte, 32)}
	event := audit.Event{ID: "created", OwnerUserID: e.OwnerUserID, ActorUserID: e.OwnerUserID, Action: audit.ResourceCreated, TargetType: "dealer", TargetID: string(e.ID), Outcome: audit.Succeeded, CorrelationID: "test", OccurredAt: testTime}
	return e, change, key, event
}
func TestCreateMembershipReplayAndSlugConflict(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	created, replayed, err := r.Create(ctx, e, c, k, a)
	if err != nil || replayed {
		t.Fatalf("create: %v %v", replayed, err)
	}
	if created.Revision != 1 {
		t.Fatalf("initial revision %d", created.Revision)
	}
	var count int64
	if err := db.Table("dealer_memberships").Where("dealer_id = ? AND user_id = ? AND role = 'owner' AND active", e.ID, e.OwnerUserID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("owner membership: %d %v", count, err)
	}
	again, replayed, err := r.Create(ctx, e, c, k, a)
	if err != nil || !replayed || again.ID != created.ID || again.Attributes != created.Attributes || again.Revision != created.Revision || !again.CreatedAt.Equal(created.CreatedAt) || !again.UpdatedAt.Equal(created.UpdatedAt) {
		t.Fatalf("replay: %+v %v %v", again, replayed, err)
	}
	changed := k
	changed.RequestHash = bytes.Repeat([]byte{1}, 32)
	if _, _, err := r.Create(ctx, e, c, changed, a); !errors.Is(err, ports.ErrIdempotencyConflict) {
		t.Fatalf("replay conflict: %v", err)
	}
	other := e
	other.ID = "other"
	c.ID = "other-grant"
	c.ResourceID = "other"
	k.Key = "other"
	a.ID = "other-created"
	a.TargetID = "other"
	if _, _, err := r.Create(ctx, other, c, k, a); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("slug conflict: %v", err)
	}
	// A later audit failure must roll back the row, membership, key and outbox too.
	other.Slug = "another-shop"
	a.ID = "created"
	if _, _, err := r.Create(ctx, other, c, k, a); err == nil {
		t.Fatal("duplicate create audit accepted")
	}
	for table, field := range map[string]string{"dealer_models": "id", "dealer_memberships": "dealer_id", "idempotency_models": "resource_id", "authorization_outbox_models": "resource_id", "audit_event_models": "target_id"} {
		if err := db.Table(table).Where(field+" = ?", "other").Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("failed create leaked %s: %d %v", table, count, err)
		}
	}
}
func TestMembershipScopeRevisionAndAuditRollback(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	if err := db.Create(&membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "viewer", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := r.Get(ctx, "staff", e.ID); err != nil {
		t.Fatalf("member read: %v", err)
	}
	if _, err := r.Get(ctx, "outsider", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-user read: %v", err)
	}
	page, err := r.List(ctx, "staff", application.PageRequest{Snapshot: testTime.Add(time.Hour), Limit: 10})
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("member list: %+v %v", page, err)
	}
	page, err = r.List(ctx, "outsider", application.PageRequest{Snapshot: testTime.Add(time.Hour), Limit: 10})
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("cross-user list: %+v %v", page, err)
	}
	update := a
	update.ID = "update"
	update.Action = audit.ResourceUpdated
	e.Name = "New Name"
	e.UpdatedAt = testTime.Add(time.Minute)
	staffEvent := update
	staffEvent.ActorUserID = "staff"
	if err := r.Update(ctx, "staff", e, staffEvent); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("viewer write: %v", err)
	}
	outsiderEvent := update
	outsiderEvent.ActorUserID = "outsider"
	if err := r.Update(ctx, "outsider", e, outsiderEvent); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-user update: %v", err)
	}
	if err := r.Update(ctx, "owner", e, update); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, "owner", e.ID)
	if err != nil || got.Revision != 2 || got.Name != e.Name {
		t.Fatalf("update: %+v %v", got, err)
	}
	update.ID = "stale"
	if err := r.Update(ctx, "owner", e, update); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stale edit: %v", err)
	}
	got.Name = "Must roll back"
	update.ID = "update"
	if err := r.Update(ctx, "owner", got, update); err == nil {
		t.Fatal("duplicate audit unexpectedly accepted")
	}
	after, err := r.Get(ctx, "owner", e.ID)
	if err != nil || after.Revision != 2 || after.Name != e.Name {
		t.Fatalf("unaudited mutation committed: %+v %v", after, err)
	}
	if err := db.Model(&membershipModel{}).Where("dealer_id=? AND user_id=?", e.ID, "staff").Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("revoked read: %v", err)
	}
	if err := r.Delete(ctx, "owner", e.ID, c, a); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("destructive deletion: %v", err)
	}
	if _, err := r.Get(ctx, "owner", e.ID); err != nil {
		t.Fatalf("dealer disappeared: %v", err)
	}
}

// Committed race fixtures use fresh IDs and remain only in the disposable
// acceptance database; append-only audit history is never deleted for cleanup.
func persistentFixture(t *testing.T, db *gorm.DB) (domain.Entity, ports.AuthorizationChange, ports.Idempotency, audit.Event) {
	t.Helper()
	e, c, k, a := fixture(t)
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	id := fmt.Sprintf("fixture-%x", suffix)
	e.ID = domain.ID(id)
	e.OwnerUserID = id
	e.Slug = id
	c.ID = id + "-grant"
	c.ResourceID = id
	c.SubjectID = id
	c.OwnerUserID = id
	c.ActorUserID = id
	k.PrincipalID = id
	k.Key = id
	a.ID = id + "-audit"
	a.OwnerUserID = id
	a.ActorUserID = id
	a.TargetID = id
	seedUser(t, db, id)
	return e, c, k, a
}
func TestRuntimeRoleCanPersistButCannotDeleteDealers(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	db := connection(t, true)
	r := New(db)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatalf("runtime create: %v", err)
	}
	completeGrant(t, db, c, a)
	e.Name = "Runtime edit"
	a.ID += "-edit"
	a.Action = audit.ResourceUpdated
	if err := r.Update(ctx, e.OwnerUserID, e, a); err != nil {
		t.Fatalf("runtime update: %v", err)
	}
	err := db.Where("id=?", e.ID).Delete(&model{}).Error
	var denied *pgconn.PgError
	if !errors.As(err, &denied) || denied.Code != "42501" {
		t.Fatalf("runtime DELETE must fail for privilege, got %v", err)
	}
	if _, err := r.Get(ctx, e.OwnerUserID, e.ID); err != nil {
		t.Fatalf("dealer must survive denied delete: %v", err)
	}
}

func TestConcurrentSlugAndRevisionWriters(t *testing.T) {
	db := connection(t, false)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := persistentFixture(t, db)
	start := make(chan struct{})
	results := make(chan error, 2)
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			entity, change, key, event := e, c, k, a
			entity.ID = domain.ID(fmt.Sprintf("%s-%d", e.ID, i))
			change.ID = fmt.Sprintf("%s-%d", c.ID, i)
			change.ResourceID = string(entity.ID)
			key.Key = fmt.Sprintf("key-%d", i)
			event.ID = fmt.Sprintf("%s-%d", a.ID, i)
			event.TargetID = string(entity.ID)
			<-start
			_, _, err := r.Create(ctx, entity, change, key, event)
			results <- err
		}(i)
	}
	close(start)
	workers.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ports.ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("slug race: success=%d conflict=%d", success, conflict)
	}
	for i := 0; i < 2; i++ {
		id := domain.ID(fmt.Sprintf("%s-%d", e.ID, i))
		if _, err := r.GetCreationOwner(ctx, e.OwnerUserID, id); err == nil {
			change, event := c, a
			change.ID = fmt.Sprintf("%s-%d", c.ID, i)
			change.ResourceID = string(id)
			event.TargetID = string(id)
			completeGrant(t, db, change, event)
		} else if !errors.Is(err, ports.ErrNotFound) {
			t.Fatal(err)
		}
	}
	page, err := r.List(ctx, e.OwnerUserID, application.PageRequest{Snapshot: testTime.Add(time.Hour), Limit: 10})
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("slug race rows: %+v %v", page, err)
	}
	e = page.Items[0]
	start = make(chan struct{})
	results = make(chan error, 2)
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			entity, event := e, a
			entity.Name = fmt.Sprintf("Edit %d", i)
			event.ID = fmt.Sprintf("%s-edit-%d", a.ID, i)
			event.TargetID = string(e.ID)
			event.Action = audit.ResourceUpdated
			<-start
			results <- r.Update(ctx, e.OwnerUserID, entity, event)
		}(i)
	}
	close(start)
	workers.Wait()
	close(results)
	success, conflict = 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ports.ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("revision race: success=%d conflict=%d", success, conflict)
	}
	got, err := r.Get(ctx, e.OwnerUserID, e.ID)
	if err != nil || got.Revision != 2 {
		t.Fatalf("revision race result: %+v %v", got, err)
	}
	var count int64
	if err := db.Table("audit_event_models").Where("action=? AND target_id=?", audit.ResourceUpdated, e.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("revision race audit count: %d %v", count, err)
	}
}
