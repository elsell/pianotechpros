package dealerstore

import (
	"context"
	"errors"
	"fmt"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/dbmigrations"
	"strings"
	"testing"
	"time"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestInquiryInboxReadAndAcknowledgmentAreAudited(t *testing.T) {
	repository, admin, profile, state, event := publicFixture(t)
	ctx := context.Background()
	id := string(profile.ID) + "-inbox"
	if err := repository.CreatePublicInquiry(ctx, app.Submission{ID: id, Slug: profile.Slug, PianoID: state.Record.ID, At: testTime, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Visit", Preference: domain.Email}}); err != nil {
		t.Fatal(err)
	}
	event.TargetType, event.TargetID, event.Action = "inquiry", id, audit.ResourceViewed
	event.ID += "-inquiry-view"
	entry, err := repository.GetInboxInquiry(ctx, event.ActorUserID, string(profile.ID), id, event)
	if err != nil || entry.State().Contact.Message != "Visit" || entry.State().ReadAt != nil {
		t.Fatal("read", err)
	}
	event.ID += "-read"
	event.Action = audit.ResourceUpdated
	event.OccurredAt = event.OccurredAt.Add(time.Minute + 247*time.Nanosecond)
	entry, err = repository.MarkInboxInquiryRead(ctx, event.ActorUserID, string(profile.ID), id, 1, event)
	if err != nil || entry.State().ReadBy != event.ActorUserID || entry.State().Revision != 2 {
		t.Fatal("mark read", err)
	}
	first := entry.State().ReadAt
	var receipts int64
	if err := admin.Table("buyer_inquiry_reads").Where("inquiry_id=?", id).Count(&receipts).Error; err != nil || receipts != 1 {
		t.Fatal("receipt missing", err)
	}
	event.ID += "-again"
	event.OccurredAt = event.OccurredAt.Add(time.Minute)
	entry, err = repository.MarkInboxInquiryRead(ctx, event.ActorUserID, string(profile.ID), id, 2, event)
	if err != nil || !entry.State().ReadAt.Equal(*first) {
		t.Fatal("first read changed", err)
	}
	var row struct{ Action string }
	if err := admin.Table("audit_event_models").Where("id=?", event.ID).Take(&row).Error; err != nil || row.Action != string(audit.ResourceViewed) {
		t.Fatal("noop read audit", err)
	}
	event.ID += "-stale"
	if _, err := repository.MarkInboxInquiryRead(ctx, event.ActorUserID, string(profile.ID), id, 1, event); !errors.Is(err, ports.ErrConflict) {
		t.Fatal("stale revision", err)
	}
	if err := repository.DB.Table("buyer_inquiry_reads").Where("inquiry_id=?", id).Update("read_at", testTime).Error; err == nil {
		t.Fatal("runtime rewrote receipt")
	}
	if err := repository.DB.Exec("DELETE FROM buyer_inquiry_reads WHERE inquiry_id=?", id).Error; err == nil {
		t.Fatal("runtime removed receipt")
	}
	if err := repository.DB.Exec("TRUNCATE buyer_inquiry_reads").Error; err == nil {
		t.Fatal("runtime truncated receipts")
	}
	down, err := dbmigrations.Files.ReadFile("000026_inquiry_read_receipts.down.sql")
	if err != nil {
		t.Fatal(err)
	}
	rollback := admin.Begin()
	rollbackErr := rollback.Exec(string(down)).Error
	_ = rollback.Rollback().Error
	if rollbackErr == nil || !strings.Contains(rollbackErr.Error(), "cannot roll back retained inquiry acknowledgments") {
		t.Fatal("rollback did not preserve acknowledgments", rollbackErr)
	}

}
func TestInquiryInboxAuditFailureRollsBackAcknowledgment(t *testing.T) {
	repository, admin, profile, state, event := publicFixture(t)
	ctx := context.Background()
	id := string(profile.ID) + "-rollback"
	if err := repository.CreatePublicInquiry(ctx, app.Submission{ID: id, Slug: profile.Slug, PianoID: state.Record.ID, At: testTime, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Visit", Preference: domain.Email}}); err != nil {
		t.Fatal(err)
	}
	// A persisted audit ID forces the real database audit insertion to fail.
	event.TargetType, event.TargetID, event.Action = "inquiry", id, audit.ResourceUpdated
	if err := admin.Create(fromAudit(event)).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repository.MarkInboxInquiryRead(ctx, event.ActorUserID, string(profile.ID), id, 1, event); err == nil {
		t.Fatal("unaudited success")
	}
	var count int64
	if err := admin.Table("buyer_inquiry_reads").Where("inquiry_id=?", id).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("receipt survived audit failure", err)
	}
	event.Action = audit.ResourceViewed
	if _, err := repository.GetInboxInquiry(ctx, event.ActorUserID, string(profile.ID), id, event); err == nil {
		t.Fatal("unaudited read")
	}
	event.Action = audit.ResourceListed
	event.TargetID = string(profile.ID)
	if _, err := repository.ListInboxInquiries(ctx, event.ActorUserID, string(profile.ID), domain.ListQuery{Limit: 30, Snapshot: testTime}, event); err == nil {
		t.Fatal("unaudited list")
	}
}

func TestInquiryInboxRechecksPersistedAuthorityForEveryOperation(t *testing.T) {
	for _, scenario := range []string{"editor", "viewer", "revoked", "pending-grant", "disabled-account", "outsider", "wrong-dealer", "wrong-inquiry"} {
		t.Run(scenario, func(t *testing.T) {
			repository, admin, profile, state, event := publicFixture(t)
			ctx := context.Background()
			id := string(profile.ID) + "-scope"
			shop := string(profile.ID)
			if err := repository.CreatePublicInquiry(ctx, app.Submission{ID: id, Slug: profile.Slug, PianoID: state.Record.ID, At: testTime, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Private contact", Preference: domain.Email}}); err != nil {
				t.Fatal(err)
			}
			actor := shop + "-reader"
			seedUser(t, admin, actor)
			member := membershipModel{DealerID: shop, UserID: actor, Role: "editor", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}
			switch scenario {
			case "viewer":
				member.Role = "viewer"
			case "revoked":
				member.Active = false
			case "pending-grant":
				member.GrantedRevision = 0
			case "disabled-account":
				if err := admin.Table("user_models").Where("id=?", actor).Update("status", "disabled").Error; err != nil {
					t.Fatal(err)
				}
			}
			if scenario != "outsider" {
				if err := admin.Create(&member).Error; err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "wrong-dealer" {
				shop = "other-shop"
			}
			if scenario == "wrong-inquiry" {
				id = "other-inquiry"
			}
			event.ActorUserID = actor
			event.TargetType = "inquiry"
			event.TargetID = id
			event.Action = audit.ResourceViewed
			event.ID += "-scope-view"
			_, err := repository.GetInboxInquiry(ctx, actor, shop, id, event)
			allowed := scenario == "editor"
			if allowed && err != nil || !allowed && !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("read %v", err)
			}
			event.ID += "-mark"
			event.Action = audit.ResourceUpdated
			_, err = repository.MarkInboxInquiryRead(ctx, actor, shop, id, 1, event)
			if allowed && err != nil || !allowed && !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("mark %v", err)
			}
			event.ID += "-list"
			event.TargetID = shop
			event.Action = audit.ResourceListed
			page, err := repository.ListInboxInquiries(ctx, actor, shop, domain.ListQuery{Limit: 30, Snapshot: testTime}, event)
			listAllowed := allowed || scenario == "wrong-inquiry"
			if listAllowed && (err != nil || len(page.Inquiries) != 1) || !listAllowed && !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("list %v count %d", err, len(page.Inquiries))
			}
		})
	}
}
func TestInquiryInboxPaginationAndHistoricalVisibility(t *testing.T) {
	repository, admin, profile, state, event := publicFixture(t)
	ctx := context.Background()
	base := string(profile.ID)
	for _, suffix := range []string{"1", "2", "3", "future"} {
		at := testTime
		if suffix == "future" {
			at = at.Add(time.Minute)
		}
		if err := repository.CreatePublicInquiry(ctx, app.Submission{ID: base + "-" + suffix, Slug: profile.Slug, PianoID: state.Record.ID, At: at, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Visit", Preference: domain.Email}}); err != nil {
			t.Fatal(err)
		}
	}
	event.ID += "-unpublish-inbox"
	if _, err := repository.UnpublishRecord(ctx, event.ActorUserID, base, state.Record.ID, state.Record.Revision, event); err != nil {
		t.Fatal(err)
	}
	event.TargetType, event.TargetID, event.Action = "inquiry", base, audit.ResourceListed
	event.ID += "-page"
	page, err := repository.ListInboxInquiries(ctx, event.ActorUserID, base, domain.ListQuery{Limit: 2, Snapshot: testTime}, event)
	if err != nil || !page.HasMore || len(page.Inquiries) != 2 || page.Inquiries[0].State().ID != base+"-3" || page.Inquiries[1].State().ID != base+"-2" {
		t.Fatalf("first page %+v %v", page, err)
	}
	last := page.Inquiries[1].State()
	event.ID += "-next"
	page, err = repository.ListInboxInquiries(ctx, event.ActorUserID, base, domain.ListQuery{Limit: 2, Snapshot: testTime, AfterID: last.ID, AfterCreated: last.CreatedAt}, event)
	if err != nil || page.HasMore || len(page.Inquiries) != 1 || page.Inquiries[0].State().ID != base+"-1" {
		t.Fatalf("next page %+v %v", page, err)
	}
	event.Action = audit.ResourceViewed
	event.TargetID = base + "-1"
	event.ID += "-detail"
	if _, err := repository.GetInboxInquiry(ctx, event.ActorUserID, base, event.TargetID, event); err != nil {
		t.Fatal("historical inquiry hidden by unpublish", err)
	}
	// The SQL guard independently rejects a receipt with no matching audit.
	if err := repository.DB.Create(&inquiryReadModel{InquiryID: base + "-1", DealerID: base, ActorUserID: event.ActorUserID, ReadAt: testTime, AuditID: "missing-audit"}).Error; err == nil {
		t.Fatal("unaudited direct receipt accepted")
	}
	// A previously committed audit is not evidence of atomic acknowledgment.
	event.ID += "-prior-committed"
	event.Action = audit.ResourceUpdated
	event.OccurredAt = testTime
	if err := admin.Create(fromAudit(event)).Error; err != nil {
		t.Fatal(err)
	}
	if err := repository.DB.Create(&inquiryReadModel{InquiryID: base + "-1", DealerID: base, ActorUserID: event.ActorUserID, ReadAt: event.OccurredAt, AuditID: event.ID}).Error; err == nil {
		t.Fatal("receipt reused an earlier transaction audit")
	}
	// Even a matching audit cannot authorize a timestamp before the inquiry arrived.
	event.ID += "-early"
	event.Action = audit.ResourceUpdated
	event.OccurredAt = testTime.Add(-time.Second)
	if err := admin.Create(fromAudit(event)).Error; err != nil {
		t.Fatal(err)
	}
	if err := repository.DB.Create(&inquiryReadModel{InquiryID: base + "-1", DealerID: base, ActorUserID: event.ActorUserID, ReadAt: event.OccurredAt, AuditID: event.ID}).Error; err == nil {
		t.Fatal("early receipt accepted")
	}
}

func TestInquiryReadConcurrentAcknowledgmentsPreserveFirstWriter(t *testing.T) {
	repository, admin, profile, state, event := publicFixture(t)
	ctx := context.Background()
	id := string(profile.ID) + "-concurrent"
	if err := repository.CreatePublicInquiry(ctx, app.Submission{ID: id, Slug: profile.Slug, PianoID: state.Record.ID, At: testTime, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Visit", Preference: domain.Email}}); err != nil {
		t.Fatal(err)
	}
	event.TargetType, event.TargetID, event.Action = "inquiry", id, audit.ResourceUpdated
	type result struct {
		entry domain.Inquiry
		err   error
	}
	results := make(chan result, 2)
	start := make(chan struct{})
	for index := range 2 {
		go func() {
			<-start
			attempt := event
			attempt.ID += fmt.Sprintf("-read-%d", index)
			attempt.OccurredAt = attempt.OccurredAt.Add(time.Duration(index) * time.Second)
			entry, err := repository.MarkInboxInquiryRead(ctx, attempt.ActorUserID, string(profile.ID), id, 1, attempt)
			results <- result{entry, err}
		}()
	}
	close(start)
	successes, conflicts := 0, 0
	var winner domain.Inquiry
	for range 2 {
		result := <-results
		if result.err == nil {
			successes++
			winner = result.entry
		} else if errors.Is(result.err, ports.ErrConflict) {
			conflicts++
		} else {
			t.Fatal(result.err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatal("concurrent acknowledgments", successes, conflicts)
	}
	var receipt inquiryReadModel
	if err := admin.Where("inquiry_id=?", id).Take(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	if !receipt.ReadAt.Equal(*winner.State().ReadAt) {
		t.Fatal("winner timestamp changed")
	}
	var count int64
	if err := admin.Table("audit_event_models").Where("target_type='inquiry' AND target_id=? AND action='resource.updated'", id).Count(&count).Error; err != nil || count != 1 {
		t.Fatal("duplicate mutation audit", err)
	}
}
