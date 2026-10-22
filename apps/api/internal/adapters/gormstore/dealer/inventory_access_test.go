package dealerstore

import (
	"context"
	"errors"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
)

func TestInventoryMembershipReaderUsesPersistedAuthority(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	subject := string(e.ID) + "-staff"
	seedUser(t, admin, subject)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	pending, err := r.DealerAccess(ctx, e.OwnerUserID, string(e.ID))
	if err != nil {
		t.Fatal(err)
	}
	if pending.OwnerUserID != e.OwnerUserID || !pending.UserActive || pending.Membership.Allows(domain.View) {
		t.Fatal("pending grant treated as authority")
	}
	completeGrant(t, runtime, c, a)
	active, err := r.DealerAccess(ctx, e.OwnerUserID, string(e.ID))
	if err != nil || !active.Membership.Allows(domain.ManageInventory) {
		t.Fatalf("confirmed owner inaccessible: %+v %v", active, err)
	}
	if err := admin.Create(&membershipModel{DealerID: string(e.ID), UserID: subject, Role: "editor", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	editor, err := r.DealerAccess(ctx, subject, string(e.ID))
	if err != nil || editor.OwnerUserID != e.OwnerUserID || editor.Membership.UserID != subject || !editor.Membership.Allows(domain.ManageInventory) {
		t.Fatalf("runtime scoped read: %+v %v", editor, err)
	}
	for _, pair := range [][2]string{{"outsider", string(e.ID)}, {subject, "other-shop"}} {
		if _, err := r.DealerAccess(ctx, pair[0], pair[1]); !errors.Is(err, ports.ErrNotFound) {
			t.Fatalf("unscoped membership: %v", err)
		}
	}
	if _, err := r.DealerAccess(ctx, "", string(e.ID)); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal("unscoped actor accepted")
	}
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, subject).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	revoked, err := r.DealerAccess(ctx, subject, string(e.ID))
	if err != nil || revoked.Membership.Allows(domain.View) {
		t.Fatal("revoked membership allowed")
	}
	if err := admin.Table("user_models").Where("id=?", e.OwnerUserID).Update("status", "disabled").Error; err != nil {
		t.Fatal(err)
	}
	disabled, err := r.DealerAccess(ctx, e.OwnerUserID, string(e.ID))
	if err != nil || disabled.UserActive {
		t.Fatal("disabled account treated as active")
	}
}
