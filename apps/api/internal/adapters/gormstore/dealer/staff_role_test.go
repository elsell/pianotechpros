package dealerstore

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func TestRoleChangeQueuesDeleteBeforePendingGrant(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	if err := db.Create(&membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "editor", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID = "changed-role"
	event.Action = audit.ResourceUpdated
	event.TargetType = "dealer_membership"
	event.TargetID = domain.MembershipKey(e.ID, "staff")
	event.OccurredAt = testTime.Add(time.Minute)
	next, err := r.ChangeMembershipRole(ctx, "owner", e.ID, "staff", domain.RoleViewer, 1, "z-delete", "a-touch", event)
	if err != nil || next.Revision != 2 || next.Role != domain.RoleViewer || next.Allows(domain.View) {
		t.Fatalf("role change: %+v %v", next, err)
	}
	if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("pending role exposed dealer: %v", err)
	}
	var changes []authorizationOutboxModel
	if err := db.Where("subject_id=? AND resource_id=?", "staff", e.ID).Order("created_at ASC,id ASC").Find(&changes).Error; err != nil {
		t.Fatal(err)
	}
	if len(changes) != 2 || changes[0].Operation != ports.AuthorizationDelete || changes[0].Relation != "editor" || changes[1].Operation != ports.AuthorizationTouch || changes[1].Relation != "viewer" || !changes[1].CreatedAt.After(changes[0].CreatedAt) {
		t.Fatalf("wrong ordered changes: %+v", changes)
	}
	var member membershipModel
	if err := db.Where("dealer_id=? AND user_id=?", e.ID, "staff").First(&member).Error; err != nil {
		t.Fatal(err)
	}
	if member.PendingAuthorizationChangeID == nil || *member.PendingAuthorizationChangeID != "a-touch" || member.PendingAuthorizationRevision == nil || *member.PendingAuthorizationRevision != 2 || member.GrantedRevision != 1 {
		t.Fatalf("pending revision: %+v", member)
	}
	// Exercise the real completion boundary after the ordered delete is applied.
	for _, row := range changes {
		if err := db.Model(&authorizationOutboxModel{}).Where("id=?", row.ID).Updates(map[string]any{"locked_by": "worker", "locked_until": gorm.Expr("CURRENT_TIMESTAMP + INTERVAL '1 minute'")}).Error; err != nil {
			t.Fatal(err)
		}
		change := c
		change.ID = row.ID
		change.Relation = row.Relation
		change.SubjectID = "staff"
		change.Operation = row.Operation
		completeGrant(t, db, change, a)
		if row.Operation == ports.AuthorizationDelete {
			if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("delete confirmed access: %v", err)
			}
		}
	}
	if _, err := r.Get(ctx, "staff", e.ID); err != nil {
		t.Fatalf("confirmed viewer cannot read: %v", err)
	}
}

func TestRoleChangeFailureLeavesMembershipAndQueueUnchanged(t *testing.T) {
	for _, scenario := range []string{"owner", "outsider", "stale", "invalid-role", "inactive", "duplicate-ids", "audit-failure", "touch-failure"} {
		t.Run(scenario, func(t *testing.T) {
			db := database(t)
			r := New(db)
			ctx := context.Background()
			e, c, k, a := fixture(t)
			if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
				t.Fatal(err)
			}
			completeGrant(t, db, c, a)
			member := membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "editor", Active: scenario != "inactive", Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}
			if err := db.Create(&member).Error; err != nil {
				t.Fatal(err)
			}
			actor, subject, role, revision, deleteID, touchID := "owner", "staff", domain.RoleViewer, int64(1), "delete", "touch"
			event := a
			event.ID = "changed"
			event.Action = audit.ResourceUpdated
			event.TargetType = "dealer_membership"
			switch scenario {
			case "owner":
				subject = "owner"
			case "outsider":
				actor = "outsider"
			case "stale":
				revision = 2
			case "invalid-role":
				role = domain.RoleOwner
			case "duplicate-ids":
				touchID = deleteID
			case "audit-failure":
				event.ID = a.ID
			case "touch-failure":
				touchID = c.ID
			}
			event.ActorUserID = actor
			event.OwnerUserID = actor
			event.TargetID = domain.MembershipKey(e.ID, subject)
			if _, err := r.ChangeMembershipRole(ctx, actor, e.ID, subject, role, revision, deleteID, touchID, event); err == nil {
				t.Fatal("invalid role transition accepted")
			}
			var after membershipModel
			if err := db.Where("dealer_id=? AND user_id=?", e.ID, "staff").First(&after).Error; err != nil {
				t.Fatal(err)
			}
			if after.Role != member.Role || after.Revision != 1 || after.Active != member.Active || after.PendingAuthorizationChangeID != nil {
				t.Fatalf("failed edit changed membership: %+v", after)
			}
			var count int64
			if err := db.Table("authorization_outbox_models").Where("subject_id=? AND resource_id=?", "staff", e.ID).Count(&count).Error; err != nil || count != 0 {
				t.Fatalf("failed edit leaked queue: %d %v", count, err)
			}
		})
	}
}

func TestConcurrentRuntimeRoleChangesHaveOneWinner(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	subject := string(e.ID) + "-role-staff"
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
			_, err := r.ChangeMembershipRole(ctx, e.OwnerUserID, e.ID, subject, domain.RoleViewer, 1, string(e.ID)+suffix+"-delete", string(e.ID)+suffix+"-touch", event)
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
		t.Fatalf("role race: %d success, %d conflict", success, conflict)
	}
	var count int64
	if err := db.Table("authorization_outbox_models").Where("resource_id=? AND subject_id=?", e.ID, subject).Count(&count).Error; err != nil || count != 2 {
		t.Fatalf("role queue count: %d %v", count, err)
	}
	if _, err := r.Get(ctx, subject, e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("unconfirmed role granted access: %v", err)
	}
}
