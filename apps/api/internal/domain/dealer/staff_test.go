package dealer

import (
	"errors"
	"math"
	"testing"
	"time"
)

var staffNow = time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)

func TestMembershipCapabilitiesAndOwnerProtection(t *testing.T) {
	for _, role := range []Role{RoleOwner, RoleEditor, RoleViewer} {
		m := Membership{DealerID: "shop", UserID: "user", Role: role, Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: staffNow, UpdatedAt: staffNow}
		for _, capability := range []Capability{View, ManageProfile, ManageMembers, ManageInventory, PublishInventory, ManageInquiries} {
			want := role == RoleOwner || capability == View || (role == RoleEditor && capability != ManageProfile && capability != ManageMembers)
			if m.Allows(capability) != want {
				t.Fatalf("%s %s", role, capability)
			}
			inactive := m
			inactive.Active = false
			if inactive.Allows(capability) {
				t.Fatal("inactive membership grants capability")
			}
		}
		if m.Allows(Capability("unknown")) {
			t.Fatal("unknown capability granted")
		}
		if role == RoleOwner {
			if _, err := m.ChangeRole(RoleViewer, 1, staffNow.Add(time.Minute)); !errors.Is(err, ErrOwnerImmutable) {
				t.Fatalf("demoted founder: %v", err)
			}
			if _, err := m.Revoke(1, staffNow.Add(time.Minute)); !errors.Is(err, ErrOwnerImmutable) {
				t.Fatalf("removed founder: %v", err)
			}
		}
	}
	unknown := Membership{DealerID: "shop", UserID: "staff", Role: Role("administrator"), Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: staffNow, UpdatedAt: staffNow}
	if unknown.Allows(View) {
		t.Fatal("unknown role granted")
	}
}
func TestStaffMembershipRevisionAndReactivation(t *testing.T) {
	m, err := NewStaffMembership("shop", "staff", RoleEditor, staffNow)
	if err != nil {
		t.Fatal(err)
	}
	changed, err := m.ChangeRole(RoleViewer, 1, staffNow.Add(time.Minute))
	if err != nil || changed.Revision != 2 || changed.Role != RoleViewer || changed.DealerID != m.DealerID || changed.UserID != m.UserID || !changed.CreatedAt.Equal(m.CreatedAt) {
		t.Fatalf("changed %+v %v", changed, err)
	}
	if _, err := changed.ChangeRole(RoleEditor, 1, staffNow.Add(time.Minute)); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("stale role edit: %v", err)
	}
	if _, err := changed.ChangeRole(RoleOwner, 2, staffNow.Add(time.Minute)); !errors.Is(err, ErrInvalidStaffRole) {
		t.Fatalf("promoted founder: %v", err)
	}
	revoked, err := changed.Revoke(2, staffNow.Add(2*time.Minute))
	if err != nil || revoked.Active || revoked.Revision != 3 {
		t.Fatalf("revoked %+v %v", revoked, err)
	}
	if _, err := revoked.ChangeRole(RoleEditor, 3, staffNow.Add(3*time.Minute)); !errors.Is(err, ErrInactiveMembership) {
		t.Fatalf("role edit reactivated revoked membership: %v", err)
	}
	restored, err := revoked.Reactivate(RoleEditor, staffNow.Add(3*time.Minute))
	if err != nil || !restored.Active || restored.Revision != 4 || !restored.CreatedAt.Equal(m.CreatedAt) {
		t.Fatalf("restored %+v %v", restored, err)
	}
	if _, err := restored.Reactivate(RoleViewer, staffNow.Add(4*time.Minute)); !errors.Is(err, ErrActiveMembership) {
		t.Fatalf("invitation overwrote active role: %v", err)
	}
	if m.Revision != 1 || m.Role != RoleEditor || !m.Active {
		t.Fatal("transition mutated original value")
	}
}
func TestInvitationExactExpiryOneTimeUseAndRevocation(t *testing.T) {
	digest := [32]byte{1}
	invite, err := NewStaffInvitation("invite", "shop", "owner", RoleViewer, digest, staffNow, staffNow.Add(72*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := invite.Consume("staff", invite.ExpiresAt); !errors.Is(err, ErrInvalidInvitation) {
		t.Fatalf("accepted at expiry: %v", err)
	}
	if _, err := invite.Consume("owner", staffNow); !errors.Is(err, ErrInvalidInvitation) {
		t.Fatalf("owner consumed own invitation: %v", err)
	}
	consumed, err := invite.Consume("staff", staffNow.Add(time.Minute))
	if err != nil || consumed.ConsumedBy != "staff" || !consumed.ConsumedAt.Equal(staffNow.Add(time.Minute)) {
		t.Fatalf("consume %+v %v", consumed, err)
	}
	if _, err := consumed.Consume("other", staffNow.Add(2*time.Minute)); !errors.Is(err, ErrInvalidInvitation) {
		t.Fatalf("replayed: %v", err)
	}
	if _, err := consumed.Revoke(staffNow.Add(2 * time.Minute)); !errors.Is(err, ErrInvalidInvitation) {
		t.Fatalf("revoked consumed invitation: %v", err)
	}
	revoked, err := invite.Revoke(staffNow.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := revoked.Consume("staff", staffNow.Add(2*time.Minute)); !errors.Is(err, ErrInvalidInvitation) {
		t.Fatalf("consumed revoked invitation: %v", err)
	}
	if !invite.ConsumedAt.IsZero() || !invite.RevokedAt.IsZero() {
		t.Fatal("transition mutated original invitation")
	}
}
func TestStaffConstructorsRejectInvalidValues(t *testing.T) {
	for _, role := range []Role{RoleOwner, Role(""), Role("admin")} {
		if _, err := NewStaffMembership("shop", "staff", role, staffNow); err == nil {
			t.Fatalf("accepted staff role %q", role)
		}
		if _, err := NewStaffInvitation("invite", "shop", "owner", role, [32]byte{1}, staffNow, staffNow.Add(time.Hour)); err == nil {
			t.Fatalf("invited role %q", role)
		}
	}
	for _, duration := range []time.Duration{-time.Hour, 0, time.Minute, 7*24*time.Hour + time.Second} {
		if _, err := NewStaffInvitation("invite", "shop", "owner", RoleViewer, [32]byte{1}, staffNow, staffNow.Add(duration)); err == nil {
			t.Fatalf("accepted expiry %s", duration)
		}
	}
	for _, ids := range [][3]string{{"", "shop", "owner"}, {"invite", "", "owner"}, {"invite", "shop", ""}} {
		if _, err := NewStaffInvitation(ids[0], ID(ids[1]), ids[2], RoleViewer, [32]byte{1}, staffNow, staffNow.Add(time.Hour)); err == nil {
			t.Fatal("empty invitation identity accepted")
		}
	}
	if _, err := NewStaffInvitation("invite", "shop", "owner", RoleViewer, [32]byte{}, staffNow, staffNow.Add(time.Hour)); err == nil {
		t.Fatal("zero digest accepted")
	}
	m, _ := NewStaffMembership("shop", "staff", RoleViewer, staffNow)
	if _, err := m.Revoke(1, staffNow.Add(-time.Second)); err == nil {
		t.Fatal("backdated membership change accepted")
	}
}

func TestMalformedMembershipNeverGrantsAccess(t *testing.T) {
	original, _ := NewStaffMembership("shop", "staff", RoleEditor, staffNow)
	for _, alter := range []func(*Membership){
		func(m *Membership) { m.DealerID = "" },
		func(m *Membership) { m.UserID = "staff\nother" },
		func(m *Membership) { m.UserID = " staff" },
		func(m *Membership) { m.UserID = string([]byte{0xff}) },
		func(m *Membership) { m.Revision = 0 },
		func(m *Membership) { m.CreatedAt = time.Time{} },
		func(m *Membership) { m.UpdatedAt = staffNow.Add(-time.Second) },
	} {
		candidate := original
		alter(&candidate)
		if candidate.Valid() || candidate.Allows(View) || candidate.Allows(ManageInventory) {
			t.Fatalf("malformed membership granted access: %+v", candidate)
		}
	}
	overflow := original
	overflow.Revision = math.MaxInt64
	if _, err := overflow.Revoke(math.MaxInt64, staffNow); !errors.Is(err, ErrInvalidMembership) {
		t.Fatalf("revision overflow: %v", err)
	}
}
func TestInvitationTimeBoundsAndMalformedConsumptionState(t *testing.T) {
	for _, duration := range []time.Duration{time.Hour, 7 * 24 * time.Hour} {
		invitation, err := NewStaffInvitation("invite", "shop", "owner", RoleEditor, [32]byte{1}, staffNow, staffNow.Add(duration))
		if err != nil || !invitation.Available(staffNow) {
			t.Fatalf("valid lifetime rejected: %v", err)
		}
		if _, err := invitation.Consume("staff", staffNow.Add(-time.Nanosecond)); !errors.Is(err, ErrInvalidInvitation) {
			t.Fatal("future invitation accepted early")
		}
		if _, err := invitation.Consume("staff", invitation.ExpiresAt.Add(-time.Nanosecond)); err != nil {
			t.Fatalf("unexpired invitation rejected: %v", err)
		}
		invitation.ConsumedBy = "staff"
		if invitation.Valid() || invitation.Available(staffNow) {
			t.Fatal("partial consumption state was available")
		}
		invitation.ConsumedAt = staffNow
		invitation.RevokedAt = staffNow
		if invitation.Valid() {
			t.Fatal("simultaneously consumed and revoked state accepted")
		}
	}
}

func TestReactivationCannotReusePreviousRemoteGrant(t *testing.T) {
	pending, _ := NewStaffMembership("shop", "staff", RoleEditor, staffNow)
	if pending.Allows(ManageInventory) {
		t.Fatal("new pending grant authorized inventory")
	}
	confirmed, err := pending.ConfirmGrant(1, staffNow)
	if err != nil || !confirmed.Allows(ManageInventory) {
		t.Fatalf("confirmed grant unavailable: %v", err)
	}
	revoked, _ := confirmed.Revoke(1, staffNow.Add(time.Minute))
	rejoined, _ := revoked.Reactivate(RoleEditor, staffNow.Add(2*time.Minute))
	// Simulate an old editor relationship still present remotely: the local gate
	// must deny until THIS revision's outbox touch is confirmed.
	if rejoined.Allows(View) || rejoined.Allows(ManageInventory) {
		t.Fatal("rejoined member reused stale remote grant")
	}
	if _, err := rejoined.ConfirmGrant(1, staffNow.Add(3*time.Minute)); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("old completion confirmed new grant: %v", err)
	}
	current, err := rejoined.ConfirmGrant(rejoined.Revision, staffNow.Add(3*time.Minute))
	if err != nil || !current.Allows(ManageInventory) {
		t.Fatalf("current grant failed: %v", err)
	}
	duplicate, err := current.ConfirmGrant(current.Revision, staffNow.Add(4*time.Minute))
	if err != nil || duplicate != current {
		t.Fatal("duplicate completion mutated membership")
	}
	downgraded, _ := current.ChangeRole(RoleViewer, current.Revision, staffNow.Add(4*time.Minute))
	if downgraded.Allows(View) || downgraded.Allows(ManageInventory) {
		t.Fatal("pending role edit reused earlier grant")
	}
	ready, _ := downgraded.ConfirmGrant(downgraded.Revision, staffNow.Add(5*time.Minute))
	if !ready.Allows(View) || ready.Allows(ManageInventory) {
		t.Fatal("confirmed downgrade has wrong capabilities")
	}
	if _, err := revoked.ConfirmGrant(revoked.Revision, staffNow.Add(3*time.Minute)); !errors.Is(err, ErrInactiveMembership) {
		t.Fatalf("confirmed revoked membership: %v", err)
	}
}

func TestMembershipKeyPreservesDealerAndUserBoundaries(t *testing.T) {
	keys := map[string]bool{}
	for _, pair := range [][2]string{{"a", "b/c"}, {"a/b", "c"}, {"a", "b"}, {"other", "b"}, {"a\"", "b"}, {"a", "\"b"}} {
		key := MembershipKey(ID(pair[0]), pair[1])
		if keys[key] {
			t.Fatalf("ambiguous membership target: %q", key)
		}
		keys[key] = true
	}
	if got := MembershipKey("dealer", "user"); got != `["dealer","user"]` {
		t.Fatalf("unstable target: %s", got)
	}
}
