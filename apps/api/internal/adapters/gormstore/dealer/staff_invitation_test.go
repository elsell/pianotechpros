package dealerstore

import (
	"context"
	"crypto/sha256"
	"errors"
	platformstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"sync/atomic"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type invitationClock struct{ now time.Time }

func (c invitationClock) Now() time.Time { return c.now }
func inviteFixture(t *testing.T) (domain.StaffInvitation, audit.Event) {
	t.Helper()
	i, err := domain.NewStaffInvitation("invite", "shop", "owner", domain.RoleEditor, sha256.Sum256([]byte("synthetic-invitation")), testTime, testTime.Add(72*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	a := audit.Event{ID: "invite-created", OwnerUserID: "owner", ActorUserID: "owner", Action: audit.InvitationCreated, TargetType: "dealer_staff_invitation", TargetID: i.ID, Outcome: audit.Succeeded, CorrelationID: "test", OccurredAt: testTime}
	return i, a
}
func TestStaffInvitationAcceptanceAndReplay(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	invite, created := inviteFixture(t)
	if err := r.CreateStaffInvitation(ctx, "owner", invite, created); err != nil {
		t.Fatal(err)
	}
	accepted := created
	accepted.ID = "accepted"
	accepted.ActorUserID = "staff"
	accepted.Action = audit.InvitationConsumed
	clock := invitationClock{testTime.Add(time.Hour)}
	member, err := r.AcceptStaffInvitation(ctx, "staff", e.ID, invite.ID, invite.TokenDigest, "staff-touch", accepted, clock)
	if err != nil || member.Revision != 1 || member.Role != domain.RoleEditor || member.Allows(domain.View) {
		t.Fatalf("accept: %+v %v", member, err)
	}
	if _, err := r.Get(ctx, "staff", e.ID); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("unconfirmed membership readable: %v", err)
	}
	var persisted invitationModel
	if err := db.Where("id=?", invite.ID).First(&persisted).Error; err != nil {
		t.Fatal(err)
	}
	if persisted.ConsumedBy == nil || *persisted.ConsumedBy != "staff" || persisted.ConsumedAt == nil || !persisted.ConsumedAt.Equal(clock.now) {
		t.Fatalf("consumption: %+v", persisted)
	}
	var auditRow auditModel
	if err := db.Where("id=?", accepted.ID).First(&auditRow).Error; err != nil || !auditRow.OccurredAt.Equal(clock.now) {
		t.Fatalf("audit time: %+v %v", auditRow, err)
	}
	accepted.ID = "replay"
	accepted.ActorUserID = "outsider"
	if _, err := r.AcceptStaffInvitation(ctx, "outsider", e.ID, invite.ID, invite.TokenDigest, "replay-touch", accepted, clock); !errors.Is(err, domain.ErrInvalidInvitation) {
		t.Fatalf("replayed link: %v", err)
	}
}
func TestStaffInvitationFailuresAreAtomic(t *testing.T) {
	for _, scenario := range []string{"expired", "unknown", "wrong-dealer", "wrong-digest", "revoked", "owner", "inactive-recipient", "inactive-issuer", "pending-issuer", "active-member", "audit-failure", "outbox-failure"} {
		t.Run(scenario, func(t *testing.T) {
			db := database(t)
			r := New(db)
			ctx := context.Background()
			e, c, k, a := fixture(t)
			if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
				t.Fatal(err)
			}
			completeGrant(t, db, c, a)
			invite, created := inviteFixture(t)
			if err := r.CreateStaffInvitation(ctx, "owner", invite, created); err != nil {
				t.Fatal(err)
			}
			actor, id, dealerID, digest, changeID := "staff", invite.ID, e.ID, invite.TokenDigest, "accept-touch"
			clock := invitationClock{testTime.Add(time.Hour)}
			event := created
			event.ID = "accepted"
			event.Action = audit.InvitationConsumed
			switch scenario {
			case "expired":
				clock.now = invite.ExpiresAt
			case "unknown":
				id = "unknown"
			case "wrong-dealer":
				dealerID = "unknown"
			case "wrong-digest":
				digest = sha256.Sum256([]byte("wrong"))
			case "revoked":
				revoked := created
				revoked.ID = "revoked"
				revoked.Action = audit.InvitationRevoked
				if err := r.RevokeStaffInvitation(ctx, "owner", e.ID, id, revoked); err != nil {
					t.Fatal(err)
				}
			case "owner":
				actor = "owner"
			case "inactive-recipient":
				if err := db.Table("user_models").Where("id=?", "staff").Update("status", "disabled").Error; err != nil {
					t.Fatal(err)
				}
			case "inactive-issuer":
				if err := db.Table("user_models").Where("id=?", "owner").Update("status", "disabled").Error; err != nil {
					t.Fatal(err)
				}
			case "pending-issuer":
				if err := db.Model(&membershipModel{}).Where("dealer_id=? AND user_id=?", e.ID, "owner").Update("granted_revision", 0).Error; err != nil {
					t.Fatal(err)
				}
			case "active-member":
				if err := db.Create(&membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "viewer", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
					t.Fatal(err)
				}
			case "audit-failure":
				event.ID = created.ID
			case "outbox-failure":
				changeID = c.ID
			}
			event.ActorUserID = actor
			event.TargetID = id
			if _, err := r.AcceptStaffInvitation(ctx, actor, dealerID, id, digest, changeID, event, clock); err == nil {
				t.Fatal("invalid acceptance succeeded")
			}
			var stored invitationModel
			if err := db.Where("id=?", invite.ID).First(&stored).Error; err != nil {
				t.Fatal(err)
			}
			if stored.ConsumedAt != nil || stored.ConsumedBy != nil {
				t.Fatal("failed acceptance consumed token")
			}
			var count int64
			if err := db.Table("authorization_outbox_models").Where("subject_id=?", "staff").Count(&count).Error; err != nil || count != 0 {
				t.Fatalf("failed acceptance queued grant: %d %v", count, err)
			}
		})
	}
}

func TestStaffInvitationCreateRevokeOwnershipAndAuditRollback(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	invite, created := inviteFixture(t)
	unauthorized := invite
	unauthorized.OwnerUserID = "outsider"
	denied := created
	denied.ActorUserID = "outsider"
	denied.OwnerUserID = "outsider"
	if err := r.CreateStaffInvitation(ctx, "outsider", unauthorized, denied); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("outsider create: %v", err)
	}
	duplicate := created
	duplicate.ID = a.ID
	if err := r.CreateStaffInvitation(ctx, "owner", invite, duplicate); err == nil {
		t.Fatal("create accepted duplicate audit")
	}
	var count int64
	if err := db.Model(&invitationModel{}).Where("id=?", invite.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("create rollback: %d %v", count, err)
	}
	if err := r.CreateStaffInvitation(ctx, "owner", invite, created); err != nil {
		t.Fatal(err)
	}
	revoked := created
	revoked.ID = "revoked"
	revoked.Action = audit.InvitationRevoked
	denied = revoked
	denied.ActorUserID = "outsider"
	denied.OwnerUserID = "outsider"
	if err := r.RevokeStaffInvitation(ctx, "outsider", e.ID, invite.ID, denied); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("outsider revoke: %v", err)
	}
	duplicate = revoked
	duplicate.ID = created.ID
	if err := r.RevokeStaffInvitation(ctx, "owner", e.ID, invite.ID, duplicate); err == nil {
		t.Fatal("revoke accepted duplicate audit")
	}
	var stored invitationModel
	if err := db.Where("id=?", invite.ID).First(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if stored.RevokedAt != nil {
		t.Fatal("unaudited revoke persisted")
	}
	if err := r.RevokeStaffInvitation(ctx, "owner", e.ID, invite.ID, revoked); err != nil {
		t.Fatal(err)
	}
}

func TestFreshInvitationReactivatesOnlyWithNewPendingRevision(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	oldTime := testTime.Add(-time.Hour)
	if err := db.Create(&membershipModel{DealerID: string(e.ID), UserID: "staff", Role: "viewer", Active: true, Revision: 3, GrantedRevision: 3, CreatedAt: oldTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	removed := a
	removed.ID = "remove"
	removed.Action = audit.ResourceUpdated
	removed.TargetType = "dealer_membership"
	removed.TargetID = domain.MembershipKey(e.ID, "staff")
	if _, err := r.RevokeMembership(ctx, "owner", e.ID, "staff", 3, "queued-delete", removed); err != nil {
		t.Fatal(err)
	}
	invite, created := inviteFixture(t)
	if err := r.CreateStaffInvitation(ctx, "owner", invite, created); err != nil {
		t.Fatal(err)
	}
	accepted := created
	accepted.ID = "accept"
	accepted.ActorUserID = "staff"
	accepted.Action = audit.InvitationConsumed
	member, err := r.AcceptStaffInvitation(ctx, "staff", e.ID, invite.ID, invite.TokenDigest, "new-touch", accepted, invitationClock{testTime.Add(time.Minute)})
	if err != nil || member.Revision != 5 || member.GrantedRevision != 3 || member.Role != domain.RoleEditor || !member.CreatedAt.Equal(oldTime) || member.Allows(domain.View) {
		t.Fatalf("rejoin: %+v %v", member, err)
	}
	var changes []authorizationOutboxModel
	if err := db.Where("resource_id=? AND subject_id=?", e.ID, "staff").Order("created_at ASC,id ASC").Find(&changes).Error; err != nil {
		t.Fatal(err)
	}
	if len(changes) != 2 || changes[0].ID != "queued-delete" || changes[1].ID != "new-touch" {
		t.Fatalf("pending revoke reordered: %+v", changes)
	}
}

func TestConcurrentRuntimeInvitationAcceptorsHaveOneWinner(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	ctx := context.Background()
	db := connection(t, true)
	r := New(db)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	invite, created := inviteFixture(t)
	invite.ID = string(e.ID) + "-invite"
	invite.DealerID = e.ID
	invite.OwnerUserID = e.OwnerUserID
	invite.TokenDigest = sha256.Sum256([]byte(invite.ID))
	created.ID = invite.ID + "-created"
	created.ActorUserID = e.OwnerUserID
	created.OwnerUserID = e.OwnerUserID
	created.TargetID = invite.ID
	if err := r.CreateStaffInvitation(ctx, e.OwnerUserID, invite, created); err != nil {
		t.Fatal(err)
	}
	actors := []string{string(e.ID) + "-first", string(e.ID) + "-second"}
	for _, actor := range actors {
		seedUser(t, admin, actor)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, actor := range actors {
		go func(actor string) {
			event := created
			event.ID = actor + "-accepted"
			event.ActorUserID = actor
			event.Action = audit.InvitationConsumed
			<-start
			_, err := r.AcceptStaffInvitation(ctx, actor, e.ID, invite.ID, invite.TokenDigest, actor+"-touch", event, invitationClock{testTime.Add(time.Hour)})
			results <- err
		}(actor)
	}
	close(start)
	success, invalid := 0, 0
	for i := 0; i < 2; i++ {
		err := <-results
		if err == nil {
			success++
		} else if errors.Is(err, domain.ErrInvalidInvitation) {
			invalid++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || invalid != 1 {
		t.Fatalf("accept race: success=%d invalid=%d", success, invalid)
	}
	var count int64
	if err := db.Table("dealer_memberships").Where("dealer_id=? AND role!='owner'", e.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("accepted membership count: %d %v", count, err)
	}
	if err := db.Table("audit_event_models").Where("target_id=? AND action=?", invite.ID, audit.InvitationConsumed).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("accept audit count: %d %v", count, err)
	}
	err := db.Where("id=?", invite.ID).Delete(&invitationModel{}).Error
	var denied *pgconn.PgError
	if !errors.As(err, &denied) || denied.Code != "42501" {
		t.Fatalf("runtime delete must be forbidden: %v", err)
	}
	err = db.Where("dealer_id=? AND user_id=?", e.ID, actors[0]).Delete(&membershipModel{}).Error
	if !errors.As(err, &denied) || denied.Code != "42501" {
		t.Fatalf("runtime membership delete must be forbidden: %v", err)
	}
}

type advancingInvitationClock struct{ nanos atomic.Int64 }

func (c *advancingInvitationClock) Now() time.Time { return time.Unix(0, c.nanos.Load()).UTC() }
func TestInvitationExpiringDuringLockWaitCannotBeConsumed(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	runtime := connection(t, true)
	r := New(runtime)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	invite, created := inviteFixture(t)
	invite.ID = string(e.ID) + "-invite"
	invite.DealerID = e.ID
	invite.OwnerUserID = e.OwnerUserID
	invite.TokenDigest = sha256.Sum256([]byte(invite.ID))
	created.ID = invite.ID + "-created"
	created.ActorUserID = e.OwnerUserID
	created.OwnerUserID = e.OwnerUserID
	created.TargetID = invite.ID
	if err := r.CreateStaffInvitation(ctx, e.OwnerUserID, invite, created); err != nil {
		t.Fatal(err)
	}
	actor := string(e.ID) + "-staff"
	seedUser(t, admin, actor)
	acceptor := connection(t, true)
	pool, _ := acceptor.DB()
	pool.SetMaxOpenConns(1)
	var backend struct {
		PID int `gorm:"column:pid"`
	}
	if err := acceptor.Table("user_models").Select("pg_backend_pid() AS pid").Limit(1).Scan(&backend).Error; err != nil {
		t.Fatal(err)
	}
	clock := &advancingInvitationClock{}
	clock.nanos.Store(invite.ExpiresAt.Add(-time.Minute).UnixNano())
	done := make(chan error, 1)
	store := &platformstore.Store{DB: runtime}
	err := store.WithinResource(ctx, "dealer", string(e.ID), func(context.Context) error {
		go func() {
			event := created
			event.ID = actor + "-accept"
			event.ActorUserID = actor
			event.Action = audit.InvitationConsumed
			_, err := New(acceptor).AcceptStaffInvitation(ctx, actor, e.ID, invite.ID, invite.TokenDigest, actor+"-touch", event, clock)
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
				return ctx.Err()
			case <-ticker.C:
			}
		}
		clock.nanos.Store(invite.ExpiresAt.UnixNano())
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, domain.ErrInvalidInvitation) {
			t.Fatalf("stale request time permitted consumption: %v", err)
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	var row invitationModel
	if err := admin.Where("id=?", invite.ID).First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.ConsumedAt != nil {
		t.Fatal("expired invitation consumed")
	}
}

func TestInvitationDatabaseRejectsInvalidPersistedStates(t *testing.T) {
	db := database(t)
	r := New(db)
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(context.Background(), e, c, k, a); err != nil {
		t.Fatal(err)
	}
	invite, _ := inviteFixture(t)
	for _, scenario := range []string{"owner-role", "short-digest", "zero-digest", "short-life", "long-life", "recipient-without-time", "time-without-recipient", "owner-consumed", "consumed-at-expiry", "consumed-and-revoked"} {
		t.Run(scenario, func(t *testing.T) {
			row := invitationModel{ID: scenario, DealerID: string(e.ID), OwnerUserID: e.OwnerUserID, Role: string(invite.Role), TokenDigest: invite.TokenDigest[:], CreatedAt: invite.CreatedAt, ExpiresAt: invite.ExpiresAt}
			subject := "staff"
			consumed := testTime.Add(time.Hour)
			switch scenario {
			case "owner-role":
				row.Role = "owner"
			case "short-digest":
				row.TokenDigest = []byte{1}
			case "zero-digest":
				row.TokenDigest = make([]byte, 32)
			case "short-life":
				row.ExpiresAt = testTime.Add(time.Minute)
			case "long-life":
				row.ExpiresAt = testTime.Add(8 * 24 * time.Hour)
			case "recipient-without-time":
				row.ConsumedBy = &subject
			case "time-without-recipient":
				row.ConsumedAt = &consumed
			case "owner-consumed":
				subject = "owner"
				row.ConsumedBy = &subject
				row.ConsumedAt = &consumed
			case "consumed-at-expiry":
				consumed = invite.ExpiresAt
				row.ConsumedBy = &subject
				row.ConsumedAt = &consumed
			case "consumed-and-revoked":
				row.ConsumedBy = &subject
				row.ConsumedAt = &consumed
				row.RevokedAt = &consumed
			}
			err := db.Transaction(func(tx *gorm.DB) error { return tx.Create(&row).Error })
			if !errors.Is(err, gorm.ErrCheckConstraintViolated) {
				t.Fatalf("invalid persisted state not rejected by check constraint: %v", err)
			}
		})
	}
}

func TestInvitationCandidateRequiresLiveTokenAndActiveAccounts(t *testing.T) {
	db := database(t)
	r := New(db)
	ctx := context.Background()
	e, c, k, a := fixture(t)
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, db, c, a)
	invite, created := inviteFixture(t)
	if err := r.CreateStaffInvitation(ctx, "owner", invite, created); err != nil {
		t.Fatal(err)
	}
	candidate, err := r.StaffInvitationCandidate(ctx, "staff", e.ID, invite.ID, invite.TokenDigest)
	if err != nil || candidate.Invitation.ID != invite.ID || candidate.DealerName != e.Name {
		t.Fatalf("live candidate: %+v %v", candidate, err)
	}
	if _, err := r.StaffInvitationCandidate(ctx, "", e.ID, invite.ID, invite.TokenDigest); err == nil {
		t.Fatal("unscoped invitation read accepted")
	}
	if _, err := r.StaffInvitationCandidate(ctx, "staff", e.ID, invite.ID, sha256.Sum256([]byte("wrong"))); !errors.Is(err, domain.ErrInvalidInvitation) {
		t.Fatalf("wrong digest: %v", err)
	}
	if err := db.Table("user_models").Where("id=?", "owner").Update("status", "disabled").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := r.StaffInvitationCandidate(ctx, "staff", e.ID, invite.ID, invite.TokenDigest); !errors.Is(err, domain.ErrInvalidInvitation) {
		t.Fatalf("disabled issuer: %v", err)
	}
}
