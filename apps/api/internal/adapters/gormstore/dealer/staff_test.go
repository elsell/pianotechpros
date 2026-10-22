package dealerstore

import (
	"context"
	"errors"
	"fmt"
	platformstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
	"gorm.io/gorm"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestRevokeMembershipAtomicDenialAndOutbox(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	member := membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "editor", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}
	if err := db.Create(&member).Error; err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID = "staff-revoked"
	event.Action = audit.ResourceUpdated
	event.TargetType = "dealer_membership"
	event.TargetID = domain.MembershipKey(e.ID, "staff")
	event.OccurredAt = testTime.Add(time.Minute)
	for _, actor := range []string{"staff", "outsider"} {
		denied := event
		denied.ActorUserID = actor
		denied.OwnerUserID = actor
		if _, err := r.RevokeMembership(ctx, actor, e.ID, "staff", 1, "delete-staff", denied); !errors.Is(err, ports.ErrNotFound) {
			t.Fatalf("%s escalation: %v", actor, err)
		}
	}
	ownerEvent := event
	ownerEvent.TargetID = domain.MembershipKey(e.ID, "owner")
	if _, err := r.RevokeMembership(ctx, "owner", e.ID, "owner", 1, "delete-owner", ownerEvent); !errors.Is(err, domain.ErrOwnerImmutable) {
		t.Fatalf("owner removal: %v", err)
	}
	if _, err := r.RevokeMembership(ctx, "owner", e.ID, "staff", 2, "delete-staff", event); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stale revision: %v", err)
	}
	duplicate := event
	duplicate.ID = a.ID
	if _, err := r.RevokeMembership(ctx, "owner", e.ID, "staff", 1, "delete-staff", duplicate); err == nil {
		t.Fatal("audit failure accepted")
	}
	if _, err := r.Get(ctx, "staff", e.ID); err != nil {
		t.Fatalf("failed revoke changed access: %v", err)
	}
	var count int64
	if err := db.Table("authorization_outbox_models").Where("id=?", "delete-staff").Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("outbox rollback: %d %v", count, err)
	}
	revoked, err := r.RevokeMembership(ctx, "owner", e.ID, "staff", 1, "delete-staff", event)
	if err != nil || revoked.Active || revoked.Revision != 2 || revoked.Allows(domain.ManageInventory) {
		t.Fatalf("revocation: %+v %v", revoked, err)
	}
	if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("revoked read: %v", err)
	}
	var row authorizationOutboxModel
	if err := db.Where("id=?", "delete-staff").First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.Operation != ports.AuthorizationDelete || row.Relation != "editor" || row.SubjectID != "staff" || row.ResourceID != string(e.ID) || row.LockedBy != "" {
		t.Fatalf("wrong deletion: %+v", row)
	}
}

func TestRevocationClearsPendingGrantAndOrdersAfterIt(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	future := testTime.Add(time.Hour)
	pending := authorizationOutboxModel{ID: "z-pending", ResourceType: "dealer", ResourceID: string(e.ID), Relation: "viewer", SubjectType: "user", SubjectID: "staff", OwnerUserID: "owner", ActorUserID: "owner", Operation: ports.AuthorizationTouch, CreatedAt: future}
	if err := db.Create(&pending).Error; err != nil {
		t.Fatal(err)
	}
	revision := int64(1)
	member := membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "viewer", Active: true, Revision: 1, PendingAuthorizationChangeID: &pending.ID, PendingAuthorizationRevision: &revision, CreatedAt: testTime, UpdatedAt: testTime}
	if err := db.Create(&member).Error; err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID = "revoke"
	event.Action = audit.ResourceUpdated
	event.TargetType = "dealer_membership"
	event.TargetID = domain.MembershipKey(e.ID, "staff")
	event.OccurredAt = testTime.Add(time.Minute)
	if _, err := r.RevokeMembership(ctx, "owner", e.ID, "staff", 1, "a-delete", event); err != nil {
		t.Fatal(err)
	}
	var after membershipModel
	if err := db.Where("dealer_id=? AND user_id=?", e.ID, "staff").First(&after).Error; err != nil {
		t.Fatal(err)
	}
	if after.Active || after.PendingAuthorizationChangeID != nil || after.PendingAuthorizationRevision != nil {
		t.Fatalf("pending grant survived: %+v", after)
	}
	var deletion authorizationOutboxModel
	if err := db.Where("id=?", "a-delete").First(&deletion).Error; err != nil {
		t.Fatal(err)
	}
	if !deletion.CreatedAt.After(future) {
		t.Fatalf("deletion ordered before pending grant: %v", deletion.CreatedAt)
	}
}

func TestRevokeMembershipRejectsInactiveAndUnconfirmedOwner(t *testing.T) {
	for _, scenario := range []string{"inactive-account", "inactive-membership", "unconfirmed"} {
		t.Run(scenario, func(t *testing.T) {
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
			switch scenario {
			case "inactive-account":
				if err := db.Table("user_models").Where("id=?", "owner").Update("status", "disabled").Error; err != nil {
					t.Fatal(err)
				}
			case "inactive-membership":
				if err := db.Model(&membershipModel{}).Where("dealer_id=? AND user_id=?", e.ID, "owner").Update("active", false).Error; err != nil {
					t.Fatal(err)
				}
			case "unconfirmed":
				if err := db.Model(&membershipModel{}).Where("dealer_id=? AND user_id=?", e.ID, "owner").Update("granted_revision", 0).Error; err != nil {
					t.Fatal(err)
				}
			}
			event := a
			event.ID = "revoke"
			event.Action = audit.ResourceUpdated
			event.TargetType = "dealer_membership"
			event.TargetID = domain.MembershipKey(e.ID, "staff")
			if _, err := r.RevokeMembership(ctx, "owner", e.ID, "staff", 1, "delete", event); !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("%s: %v", scenario, err)
			}
			if _, err := r.Get(ctx, "staff", e.ID); err != nil {
				t.Fatalf("denial altered member: %v", err)
			}
		})
	}
}

func TestRevokeMembershipOutboxFailureRollsBack(t *testing.T) {
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
	event := a
	event.ID = "revoke"
	event.Action = audit.ResourceUpdated
	event.TargetType = "dealer_membership"
	event.TargetID = domain.MembershipKey(e.ID, "staff")
	if _, err := r.RevokeMembership(ctx, "owner", e.ID, "staff", 1, c.ID, event); err == nil {
		t.Fatal("duplicate outbox accepted")
	}
	if _, err := r.Get(ctx, "staff", e.ID); err != nil {
		t.Fatalf("failed enqueue altered member: %v", err)
	}
	var count int64
	if err := db.Table("audit_event_models").Where("id=?", event.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("failed enqueue emitted success audit: %d %v", count, err)
	}
}

func TestConcurrentRuntimeMembershipRevocation(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	subject := string(e.ID) + "-staff"
	seedUser(t, admin, subject)
	db := connection(t, true)
	r := New(db)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	if err := admin.Create(&membershipModel{DealerID: string(e.ID), UserID: subject, Role: "editor", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, suffix := range []string{"-first", "-second"} {
		go func(suffix string) {
			event := a
			event.ID += suffix
			event.Action = audit.ResourceUpdated
			event.TargetType = "dealer_membership"
			event.TargetID = domain.MembershipKey(e.ID, subject)
			<-start
			_, err := r.RevokeMembership(ctx, e.OwnerUserID, e.ID, subject, 1, string(e.ID)+suffix, event)
			results <- err
		}(suffix)
	}
	close(start)
	success, conflict := 0, 0
	for i := 0; i < 2; i++ {
		err := <-results
		if err == nil {
			success++
		} else if errors.Is(err, ports.ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("revocation race: success=%d conflict=%d", success, conflict)
	}
	if _, err := r.Get(ctx, subject, e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("revoked runtime read: %v", err)
	}
	var count int64
	if err := db.Table("authorization_outbox_models").Where("resource_id=? AND operation=?", e.ID, ports.AuthorizationDelete).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("deletion count: %d %v", count, err)
	}
	if err := db.Table("audit_event_models").Where("target_type=? AND target_id=?", "dealer_membership", domain.MembershipKey(e.ID, subject)).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("revoke audit count: %d %v", count, err)
	}
}

func TestPendingGrantCompletionDoesNotDeadlockRevocation(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	subject := string(e.ID) + "-pending-staff"
	seedUser(t, admin, subject)
	runtime := connection(t, true)
	r := New(runtime)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	grantID := string(e.ID) + "-staff-grant"
	grant := authorizationOutboxModel{ID: grantID, ResourceType: "dealer", ResourceID: string(e.ID), Relation: "editor", SubjectType: "user", SubjectID: subject, OwnerUserID: e.OwnerUserID, ActorUserID: e.OwnerUserID, Operation: ports.AuthorizationTouch, LockedBy: "grant-worker", CreatedAt: testTime}
	if err := admin.Create(&grant).Error; err != nil {
		t.Fatal(err)
	}
	if err := admin.Model(&grant).Update("locked_until", gorm.Expr("CURRENT_TIMESTAMP + INTERVAL '1 minute'")).Error; err != nil {
		t.Fatal(err)
	}
	revision := int64(1)
	if err := admin.Create(&membershipModel{DealerID: string(e.ID), UserID: subject, Role: "editor", Active: true, Revision: 1, PendingAuthorizationChangeID: &grantID, PendingAuthorizationRevision: &revision, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	// A dedicated single-connection pool lets the test observe the precise server
	// lock wait, instead of guessing with sleeps before completing the grant.
	revoker := connection(t, true)
	pool, _ := revoker.DB()
	pool.SetMaxOpenConns(1)
	var backend struct {
		PID int `gorm:"column:pid"`
	}
	if err := revoker.Table("user_models").Select("pg_backend_pid() AS pid").Limit(1).Scan(&backend).Error; err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	store := &platformstore.Store{DB: runtime}
	err := store.WithinResource(ctx, "dealer", string(e.ID), func(context.Context) error {
		go func() {
			event := a
			event.ID += "-revoke"
			event.Action = audit.ResourceUpdated
			event.TargetType = "dealer_membership"
			event.TargetID = domain.MembershipKey(e.ID, subject)
			_, err := New(revoker).RevokeMembership(ctx, e.OwnerUserID, e.ID, subject, 1, string(e.ID)+"-delete", event)
			done <- err
		}()
		ticker := time.NewTicker(5 * time.Millisecond)
		defer ticker.Stop()
		for {
			var waiting int64
			if err := admin.WithContext(ctx).Table("pg_stat_activity").Where("pid=? AND wait_event_type='Lock'", backend.PID).Count(&waiting).Error; err != nil {
				return err
			}
			if waiting == 1 {
				break
			}
			select {
			case <-ctx.Done():
				return fmt.Errorf("revoker did not reach resource lock: %w", ctx.Err())
			case <-ticker.C:
			}
		}
		applied := a
		applied.ID += "-staff-applied"
		applied.Action = audit.AuthorizationApplied
		return store.CompleteAuthorizationChangeWithAudit(ctx, grantID, "grant-worker", applied)
	})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("revocation did not finish after completion")
	}
	if _, err := r.Get(ctx, subject, e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("completion revived revoked staff: %v", err)
	}
}
