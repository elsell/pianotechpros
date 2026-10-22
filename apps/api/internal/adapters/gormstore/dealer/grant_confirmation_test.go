package dealerstore

import (
	"context"
	"errors"
	"testing"

	platformstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func completeGrant(t *testing.T, db *gorm.DB, c ports.AuthorizationChange, event audit.Event) {
	t.Helper()
	event.ID = c.ID + "-applied"
	event.Action = audit.AuthorizationApplied
	if err := (&platformstore.Store{DB: db}).CompleteAuthorizationChangeWithAudit(context.Background(), c.ID, c.LockedBy, event); err != nil {
		t.Fatal(err)
	}
}
func TestGrantConfirmationAndAuditCommitTogether(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, event := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, event); err != nil {
		t.Fatal(err)
	}
	if _, err := r.GetCreationOwner(ctx, "owner", e.ID); err != nil {
		t.Fatalf("pending creation owner unavailable: %v", err)
	}
	if _, err := r.GetCreationOwner(ctx, "outsider", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("outsider used creation capability: %v", err)
	}
	if _, err := r.Get(ctx, "owner", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("pending grant exposed profile: %v", err)
	}
	update := event
	update.ID = "pending-update"
	update.Action = audit.ResourceUpdated
	if err := r.Update(ctx, "owner", e, update); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("pending grant permitted profile edit: %v", err)
	}
	page, err := r.List(ctx, "owner", application.PageRequest{Limit: 10, Snapshot: testTime})
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("pending grant exposed list: %+v %v", page, err)
	}
	failedAudit := event
	failedAudit.Action = audit.AuthorizationApplied
	store := &platformstore.Store{DB: db}
	if err := store.CompleteAuthorizationChangeWithAudit(ctx, c.ID, c.LockedBy, failedAudit); err == nil {
		t.Fatal("duplicate audit ID unexpectedly committed")
	}
	if _, err := r.Get(ctx, "owner", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("audit failure confirmed grant: %v", err)
	}
	completeGrant(t, db, c, event)
	if _, err := r.Get(ctx, "owner", e.ID); err != nil {
		t.Fatalf("confirmed grant unavailable: %v", err)
	}
	var member struct {
		GrantedRevision              int64
		PendingAuthorizationChangeID *string
	}
	if err := db.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, "owner").First(&member).Error; err != nil || member.GrantedRevision != 1 || member.PendingAuthorizationChangeID != nil {
		t.Fatalf("confirmation state %+v %v", member, err)
	}
}
func TestSupersededOrRevokedGrantCannotConfirmCurrentMembership(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, event := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, event); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, event)
	queue := func(id string) ports.AuthorizationChange {
		t.Helper()
		change := c
		change.ID = id
		change.Relation = "viewer"
		change.SubjectID = "staff"
		row := authorizationOutboxModel{ID: id, ResourceType: "dealer", ResourceID: string(e.ID), Relation: "viewer", SubjectType: "user", SubjectID: "staff", OwnerUserID: "owner", ActorUserID: "owner", Operation: ports.AuthorizationTouch, LockedBy: c.LockedBy, CreatedAt: testTime}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&row).Update("locked_until", gorm.Expr("CURRENT_TIMESTAMP + INTERVAL '1 minute'")).Error; err != nil {
			t.Fatal(err)
		}
		return change
	}
	old := queue("staff-old")
	current := queue("staff-current")
	if err := db.Table("dealer_memberships").Create(map[string]any{"dealer_id": e.ID, "user_id": "staff", "role": "viewer", "active": true, "revision": 3, "granted_revision": 1, "pending_authorization_change_id": current.ID, "pending_authorization_revision": 3, "created_at": testTime, "updated_at": testTime}).Error; err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, old, event)
	if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("old completion restored access: %v", err)
	}
	if err := db.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, "staff").Update("revision", 4).Error; err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, current, event)
	if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("old revision completion restored access: %v", err)
	}
	fresh := queue("staff-fresh")
	if err := db.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, "staff").Updates(map[string]any{"pending_authorization_change_id": fresh.ID, "pending_authorization_revision": 4}).Error; err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, fresh, event)
	if _, err := r.Get(ctx, "staff", e.ID); err != nil {
		t.Fatalf("current completion failed: %v", err)
	}
	revoked := queue("staff-revoked")
	if err := db.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, "staff").Updates(map[string]any{"active": false, "revision": 5, "pending_authorization_change_id": revoked.ID, "pending_authorization_revision": 5}).Error; err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, revoked, event)
	if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("completion restored revoked access: %v", err)
	}
	var granted int64
	if err := db.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, "staff").Select("granted_revision").Scan(&granted).Error; err != nil || granted != 4 {
		t.Fatalf("revoked confirmation changed: %d %v", granted, err)
	}
}
