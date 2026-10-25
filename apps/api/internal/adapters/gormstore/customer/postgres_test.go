package customerstore

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	platformstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func database(t *testing.T) *gorm.DB { return databaseRole(t, "") }
func databaseRole(t *testing.T, role string) *gorm.DB {
	t.Helper()
	if *databaseDSN == "" {
		t.Skip("-database-dsn is required")
	}
	config, err := pgx.ParseConfig(*databaseDSN)
	if err != nil {
		t.Fatal(err)
	}
	if role != "" {
		config.RuntimeParams["role"] = role
	}
	connection := stdlib.OpenDB(*config)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: connection}), &gorm.Config{TranslateError: true, Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sql, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sql.Close() })
	return db
}
func fixture(t *testing.T, db *gorm.DB, suffix string) (*Repository, domain.Entity, ports.AuthorizationChange, ports.Idempotency, audit.Event) {
	t.Helper()
	id := fmt.Sprintf("customer-%d-%s", time.Now().UnixNano(), suffix)
	e := profile(t)
	e.ID = domain.ID(id)
	e.OwnerUserID = id + "-owner"
	if err := db.Exec("INSERT INTO user_models(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)", e.OwnerUserID, id+"@example.invalid", "Fixture", now, now).Error; err != nil {
		t.Fatal(err)
	}
	event := audit.Event{ID: id + "-create", OwnerUserID: e.OwnerUserID, ActorUserID: e.OwnerUserID, Action: audit.ResourceCreated, TargetType: "customer", TargetID: id, Outcome: audit.Succeeded, CorrelationID: "fixture", OccurredAt: now}
	change := ports.AuthorizationChange{ID: id + "-outbox", ResourceType: "customer", ResourceID: id, Relation: "owner", SubjectType: "user", SubjectID: e.OwnerUserID, OwnerUserID: e.OwnerUserID, ActorUserID: e.OwnerUserID, Operation: ports.AuthorizationTouch, LockedBy: "fixture", Lease: time.Minute}
	idem := ports.Idempotency{PrincipalID: e.OwnerUserID, Operation: "customer.create", Key: id, RequestHash: make([]byte, 32)}
	return New(db, catalog), e, change, idem, event
}
func finishGrant(t *testing.T, db *gorm.DB, change ports.AuthorizationChange, event audit.Event) {
	t.Helper()
	event.ID += "-applied"
	event.Action = audit.AuthorizationApplied
	if err := (&platformstore.Store{DB: db}).CompleteAuthorizationChangeWithAudit(context.Background(), change.ID, change.LockedBy, event); err != nil {
		t.Fatal(err)
	}
}
func TestPostgresCustomerAtomicLifecycle(t *testing.T) {
	db := database(t)
	tx := db
	r, e, change, idem, event := fixture(t, tx, "lifecycle")
	ctx := context.Background()
	r = New(databaseRole(t, "app"), catalog)
	created, replayed, err := r.Create(ctx, e, change, idem, event)
	if err != nil || replayed || created.Revision != 1 {
		t.Fatalf("create: %+v %v", created, err)
	}
	if ready, err := r.AuthorizationReady(ctx, e.OwnerUserID, e.ID); err != nil || ready {
		t.Fatalf("pending grant ready: %v %v", ready, err)
	}
	if _, _, err := r.Save(ctx, e.OwnerUserID, e.ID, 1, e.Attributes, now, audit.Event{ID: string(e.ID) + "-early", OwnerUserID: e.OwnerUserID, ActorUserID: e.OwnerUserID, Action: audit.ResourceUpdated, TargetType: "customer", TargetID: string(e.ID), Outcome: audit.Succeeded, CorrelationID: "fixture", OccurredAt: now}); !errors.Is(err, ports.ErrAuthorizationPending) {
		t.Fatalf("pending save: %v", err)
	}
	finishGrant(t, r.DB, change, event)
	if ready, err := r.AuthorizationReady(ctx, e.OwnerUserID, e.ID); err != nil || !ready {
		t.Fatalf("completed grant not ready: %v %v", ready, err)
	}
	if own, err := r.GetOwn(ctx, e.OwnerUserID); err != nil || own.ID != e.ID {
		t.Fatalf("own lookup: %+v %v", own, err)
	}
	if own, err := r.GetOwn(ctx, "foreign-owner"); !errors.Is(err, ports.ErrNotFound) || own.ID != "" {
		t.Fatalf("foreign own lookup: %+v %v", own, err)
	}
	var outbox authorizationOutboxModel
	if err := tx.First(&outbox, "id=?", change.ID).Error; err != nil || outbox.CreatedAt.Before(now) {
		t.Fatalf("outbox: %+v %v", outbox, err)
	}
	again, replayed, err := r.Create(ctx, e, change, idem, event)
	if err != nil || !replayed || again.ID != created.ID {
		t.Fatalf("replay: %v", err)
	}
	wrong := idem
	wrong.RequestHash = append([]byte(nil), idem.RequestHash...)
	wrong.RequestHash[0] = 1
	if _, _, err := r.Create(ctx, e, change, wrong, event); !errors.Is(err, ports.ErrIdempotencyConflict) {
		t.Fatalf("conflicting replay: %v", err)
	}
	if got, err := r.Get(ctx, "foreign-owner", e.ID); !errors.Is(err, ports.ErrNotFound) || got.ID != "" {
		t.Fatalf("foreign read: %+v %v", got, err)
	}
	attrs := created.Attributes
	attrs.Pianos[0].Nickname = "Updated piano"
	save := event
	save.ID += "-save"
	save.Action = audit.ResourceUpdated
	save.OccurredAt = now.Add(time.Hour)
	updated, changed, err := r.Save(ctx, e.OwnerUserID, e.ID, 1, attrs, save.OccurredAt, save)
	if err != nil || !changed || updated.Revision != 2 || updated.Pianos[0].Key != "piano" || updated.Locations[0].Key != "home" {
		t.Fatalf("save: %+v %v", updated, err)
	}
	stale := save
	stale.ID += "-stale"
	if _, _, err := r.Save(ctx, e.OwnerUserID, e.ID, 1, attrs, stale.OccurredAt, stale); !errors.Is(err, domain.ErrRevisionConflict) {
		t.Fatalf("stale: %v", err)
	}
	var n int64
	tx.Model(&auditModel{}).Where("id=?", stale.ID).Count(&n)
	if n != 0 {
		t.Fatal("stale write emitted success audit")
	}
	noop := save
	noop.ID += "-noop"
	noop.OccurredAt = now.Add(2 * time.Hour)
	unchanged, changed, err := r.Save(ctx, e.OwnerUserID, e.ID, 2, attrs, noop.OccurredAt, noop)
	if err != nil || changed || unchanged.Revision != 2 || !unchanged.UpdatedAt.Equal(updated.UpdatedAt) {
		t.Fatalf("no-op: %+v %v", unchanged, err)
	}
	tx.Model(&auditModel{}).Where("id=?", noop.ID).Count(&n)
	if n != 1 {
		t.Fatal("no-op audit missing")
	}
	attrs.Name = "must roll back"
	if _, _, err := r.Save(ctx, e.OwnerUserID, e.ID, 2, attrs, save.OccurredAt, save); err == nil {
		t.Fatal("duplicate audit accepted")
	}
	restored, err := r.Get(ctx, e.OwnerUserID, e.ID)
	if err != nil || restored.Name == attrs.Name || restored.Revision != 2 {
		t.Fatalf("audit rollback: %+v %v", restored, err)
	}
	foreign := save
	foreign.ID += "-foreign"
	foreign.OwnerUserID = "foreign-owner"
	foreign.ActorUserID = "foreign-owner"
	if _, _, err := r.Save(ctx, "foreign-owner", e.ID, 2, attrs, foreign.OccurredAt, foreign); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("foreign save: %v", err)
	}
}
func TestPostgresCustomerDuplicateOwnerRollsBackAncillaryRows(t *testing.T) {
	db := database(t)
	tx := db
	r, e, c, i, a := fixture(t, tx, "unique")
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, i, a); err != nil {
		t.Fatal(err)
	}
	e.ID += "-other"
	c.ID += "-other"
	c.ResourceID = string(e.ID)
	i.Key += "-other"
	a.ID += "-other"
	a.TargetID = string(e.ID)
	if _, _, err := r.Create(ctx, e, c, i, a); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("duplicate owner: %v", err)
	}
	for _, check := range []struct {
		table, query string
		args         []any
	}{{"audit_event_models", "id=?", []any{a.ID}}, {"authorization_outbox_models", "id=?", []any{c.ID}}, {"idempotency_models", "principal_id=? AND key=?", []any{e.OwnerUserID, i.Key}}} {
		var count int64
		if err := tx.Table(check.table).Where(check.query, check.args...).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("orphan %s: %d %v", check.table, count, err)
		}
	}
}
func TestPostgresCustomerOutboxFailureRollsBackProfileAndAudit(t *testing.T) {
	db := database(t)
	tx := db
	ctx := context.Background()
	first, e, c, i, a := fixture(t, tx, "outbox-first")
	if _, _, err := first.Create(ctx, e, c, i, a); err != nil {
		t.Fatal(err)
	}
	second, e2, c2, i2, a2 := fixture(t, tx, "outbox-second")
	c2.ID = c.ID
	if got, _, err := second.Create(ctx, e2, c2, i2, a2); err == nil || got.ID != "" {
		t.Fatalf("outbox failure returned success: %+v %v", got, err)
	}
	if _, err := second.Get(ctx, e2.OwnerUserID, e2.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("profile survived rollback: %v", err)
	}
	for _, table := range []string{"audit_event_models", "idempotency_models"} {
		var count int64
		query := tx.Table(table)
		if table == "audit_event_models" {
			query = query.Where("id=?", a2.ID)
		} else {
			query = query.Where("principal_id=?", e2.OwnerUserID)
		}
		if err := query.Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("%s survived rollback: %d %v", table, count, err)
		}
	}
}

func TestPostgresCustomerConcurrentCreation(t *testing.T) {
	db := database(t)
	r, e, c, i, a := fixture(t, db, "race")
	ctx := context.Background()
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	ids := make(chan domain.ID, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); got, _, err := r.Create(ctx, e, c, i, a); errs <- err; ids <- got.ID }()
	}
	wg.Wait()
	close(errs)
	close(ids)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	for id := range ids {
		if id != e.ID {
			t.Fatalf("split identity: %s", id)
		}
	}
	var count int64
	if err := db.Table("customer_models").Where("owner_user_id=?", e.OwnerUserID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("profile count: %d %v", count, err)
	}
}

func TestPostgresCustomerDatabaseGuardsAndCorruption(t *testing.T) {
	db := database(t)
	tx := db
	r, e, c, i, a := fixture(t, tx, "guards")
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, i, a); err != nil {
		t.Fatal(err)
	}
	for name, statement := range map[string]string{
		"unaudited update": "UPDATE customer_models SET name='bad',revision=revision+1 WHERE id=?",
		"revision jump":    "UPDATE customer_models SET revision=revision+2 WHERE id=?",
		"identity change":  "UPDATE customer_models SET owner_user_id='foreign' WHERE id=?",
		"invalid array":    "UPDATE customer_models SET pianos='null'::jsonb WHERE id=?",
	} {
		t.Run(name, func(t *testing.T) {
			if err := tx.Transaction(func(inner *gorm.DB) error { return inner.Exec(statement, e.ID).Error }); err == nil {
				t.Fatal("database guard accepted invalid write")
			}
		})
	}
	err := tx.Transaction(func(inner *gorm.DB) error {
		if err := inner.Exec("SET LOCAL ROLE app").Error; err != nil {
			return err
		}
		return inner.Exec("DELETE FROM customer_models WHERE id=?", e.ID).Error
	})
	var pg *pgconn.PgError
	if !errors.As(err, &pg) || pg.Code != "42501" {
		t.Fatalf("runtime delete not denied by privilege: %v", err)
	}
	corrupt := a
	corrupt.ID += "-corrupt"
	corrupt.Action = audit.ResourceUpdated
	corrupt.OccurredAt = now.Add(time.Hour)
	if err := tx.Transaction(func(inner *gorm.DB) error {
		if err := inner.Create(fromAudit(corrupt)).Error; err != nil {
			return err
		}
		return inner.Exec("UPDATE customer_models SET revision=2,updated_at=?,last_audit_id=?,pianos=jsonb_set(pianos,'{0,LocationKey}','\"foreign\"'::jsonb) WHERE id=?", corrupt.OccurredAt, corrupt.ID, e.ID).Error
	}); err != nil {
		t.Fatal(err)
	}
	if got, err := r.Get(ctx, e.OwnerUserID, e.ID); err == nil || got.ID != "" {
		t.Fatalf("corrupt storage leaked partial data: %+v %v", got, err)
	}
}
func TestPostgresCustomerConcurrentEdits(t *testing.T) {
	db := database(t)
	r, e, c, i, a := fixture(t, db, "edit-race")
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, i, a); err != nil {
		t.Fatal(err)
	}
	finishGrant(t, db, c, a)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for n := range 2 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			attrs := e.Attributes
			attrs.Name = fmt.Sprintf("Edit %d", n)
			ev := a
			ev.ID += fmt.Sprintf("-edit-%d", n)
			ev.Action = audit.ResourceUpdated
			ev.OccurredAt = now.Add(time.Hour)
			_, _, err := r.Save(ctx, e.OwnerUserID, e.ID, 1, attrs, ev.OccurredAt, ev)
			errs <- err
		}(n)
	}
	wg.Wait()
	close(errs)
	success, conflict := 0, 0
	for err := range errs {
		if err == nil {
			success++
		} else if errors.Is(err, domain.ErrRevisionConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("concurrent edits: %d successful, %d conflicted", success, conflict)
	}
	got, err := r.Get(ctx, e.OwnerUserID, e.ID)
	if err != nil || got.Revision != 2 {
		t.Fatalf("final revision: %+v %v", got, err)
	}
	var count int64
	if err := db.Table("audit_event_models").Where("target_type='customer' AND target_id=? AND action='resource.updated'", e.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("mutation audit count: %d %v", count, err)
	}
}

func TestPostgresCustomerRejectsPreviouslyCommittedAuditProof(t *testing.T) {
	db := database(t)
	r, e, c, i, a := fixture(t, db, "audit-reuse")
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, i, a); err != nil {
		t.Fatal(err)
	}
	finishGrant(t, db, c, a)
	noop := a
	noop.ID += "-noop"
	noop.Action = audit.ResourceUpdated
	noop.OccurredAt = now.Add(time.Hour)
	if _, changed, err := r.Save(ctx, e.OwnerUserID, e.ID, 1, e.Attributes, noop.OccurredAt, noop); err != nil || changed {
		t.Fatalf("no-op setup: %v", err)
	}
	if err := db.Exec("UPDATE customer_models SET name='Unaudited',revision=2,updated_at=?,last_audit_id=? WHERE id=?", noop.OccurredAt, noop.ID, e.ID).Error; err == nil {
		t.Fatal("previously committed no-op audit authorized a new mutation")
	}
	got, err := r.Get(ctx, e.OwnerUserID, e.ID)
	if err != nil || got.Name != "Customer" || got.Revision != 1 {
		t.Fatalf("audit replay mutated state: %+v %v", got, err)
	}
}

func TestPostgresCustomerConcurrentDifferentKeysStillCreateOneProfile(t *testing.T) {
	db := database(t)
	r, e, c, i, a := fixture(t, db, "owner-race")
	ctx := context.Background()
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for n := range 2 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			suffix := fmt.Sprintf("-%d", n)
			entity := e
			entity.ID += domain.ID(suffix)
			change := c
			change.ID += suffix
			change.ResourceID = string(entity.ID)
			idem := i
			idem.Key += suffix
			event := a
			event.ID += suffix
			event.TargetID = string(entity.ID)
			_, _, err := r.Create(ctx, entity, change, idem, event)
			errs <- err
		}(n)
	}
	wg.Wait()
	close(errs)
	success, conflict := 0, 0
	for err := range errs {
		if err == nil {
			success++
		} else if errors.Is(err, ports.ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("concurrent owner creation: %d successful, %d conflicted", success, conflict)
	}
	for _, table := range []string{"customer_models", "audit_event_models", "authorization_outbox_models", "idempotency_models"} {
		var count int64
		column := "owner_user_id"
		if table == "idempotency_models" {
			column = "principal_id"
		}
		if err := db.Table(table).Where(column+"=?", e.OwnerUserID).Count(&count).Error; err != nil || count != 1 {
			t.Fatalf("%s count after race: %d %v", table, count, err)
		}
	}
}
