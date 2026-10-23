package dealerstore

import (
	"context"
	"crypto/sha256"
	"errors"
	"testing"
	"time"

	application "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestOwnerStaffAndInvitationListsAreScopedAndBounded(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	if err := db.Create(&membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "viewer", Active: false, Revision: 2, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"inv-a", "inv-b", "inv-c"} {
		i, event := inviteFixture(t)
		i.ID = id
		i.TokenDigest = sha256.Sum256([]byte(id))
		event.ID = id + "-audit"
		event.TargetID = id
		if err := r.CreateStaffInvitation(ctx, "owner", i, event); err != nil {
			t.Fatal(err)
		}
	}
	page := application.StaffPageRequest{Snapshot: testTime.Add(time.Minute), Limit: 1}
	for _, actor := range []string{"staff", "outsider"} {
		if _, err := r.ListStaff(ctx, actor, e.ID, page); !errors.Is(err, ports.ErrNotFound) {
			t.Fatalf("%s staff listing: %v", actor, err)
		}
		if _, err := r.ListStaffInvitations(ctx, actor, e.ID, page); !errors.Is(err, ports.ErrNotFound) {
			t.Fatalf("%s invitation listing: %v", actor, err)
		}
	}
	members, err := r.ListStaff(ctx, "owner", e.ID, page)
	if err != nil || len(members.Items) != 1 || !members.HasMore || members.Items[0].UserID != "owner" {
		t.Fatalf("first staff: %+v %v", members, err)
	}
	page.AfterID = members.Items[0].UserID
	page.AfterCreated = members.Items[0].CreatedAt
	members, err = r.ListStaff(ctx, "owner", e.ID, page)
	if err != nil || len(members.Items) != 1 || members.HasMore || members.Items[0].UserID != "staff" || members.Items[0].Active {
		t.Fatalf("revoked staff: %+v %v", members, err)
	}
	page.AfterID = ""
	page.AfterCreated = time.Time{}
	invites, err := r.ListStaffInvitations(ctx, "owner", e.ID, page)
	if err != nil || len(invites.Items) != 1 || !invites.HasMore || invites.Items[0].ID != "inv-a" {
		t.Fatalf("first invitation: %+v %v", invites, err)
	}
	page.AfterID = invites.Items[0].ID
	page.AfterCreated = invites.Items[0].CreatedAt
	invites, err = r.ListStaffInvitations(ctx, "owner", e.ID, page)
	if err != nil || len(invites.Items) != 1 || invites.Items[0].ID != "inv-b" {
		t.Fatalf("next invitation: %+v %v", invites, err)
	}
	page.Limit = 101
	if _, err := r.ListStaff(ctx, "owner", e.ID, page); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("unbounded staff list: %v", err)
	}
	if _, err := r.ListStaffInvitations(ctx, "owner", e.ID, page); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("unbounded invitation list: %v", err)
	}
}

func TestStaffListsRecheckCurrentOwnerAuthority(t *testing.T) {
	for _, scenario := range []string{"editor", "disabled-account", "unconfirmed-owner", "inactive-owner"} {
		t.Run(scenario, func(t *testing.T) {
			db := database(t)
			r := New(db)
			ctx := context.Background()
			e, c, k, a := fixture(t)
			if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
				t.Fatal(err)
			}
			completeGrant(t, db, c, a)
			actor := "owner"
			switch scenario {
			case "editor":
				actor = "staff"
				if err := db.Create(&membershipModel{DealerID: string(e.ID), UserID: actor, Role: "editor", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
					t.Fatal(err)
				}
			case "disabled-account":
				if err := db.Table("user_models").Where("id=?", actor).Update("status", "disabled").Error; err != nil {
					t.Fatal(err)
				}
			case "unconfirmed-owner":
				if err := db.Model(&membershipModel{}).Where("dealer_id=? AND user_id=?", e.ID, actor).Update("granted_revision", 0).Error; err != nil {
					t.Fatal(err)
				}
			case "inactive-owner":
				if err := db.Model(&membershipModel{}).Where("dealer_id=? AND user_id=?", e.ID, actor).Update("active", false).Error; err != nil {
					t.Fatal(err)
				}
			}
			page := application.StaffPageRequest{Snapshot: testTime.Add(time.Minute), Limit: 50}
			if _, err := r.ListStaff(ctx, actor, e.ID, page); !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("staff list: %v", err)
			}
			if _, err := r.ListStaffInvitations(ctx, actor, e.ID, page); !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("invitation list: %v", err)
			}
		})
	}
}
