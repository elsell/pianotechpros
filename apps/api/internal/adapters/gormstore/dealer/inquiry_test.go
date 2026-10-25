package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestPublicInquiryPersistsSnapshotAndRejectsHiddenListings(t *testing.T) {
	r, admin, profile, state, event := publicFixture(t)
	ctx := context.Background()
	in := app.Submission{ID: string(profile.ID) + "-inquiry", Slug: profile.Slug, PianoID: state.Record.ID, At: testTime, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Please arrange a visit", Preference: domain.Email}}
	if err := r.CreatePublicInquiry(ctx, in); err != nil {
		t.Fatal(err)
	}
	var row inquiryModel
	if err := admin.Where("id=?", in.ID).Take(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.BuyerName != "Buyer" || row.DealerID != string(profile.ID) || row.PublicationRevision != state.Record.Revision || strings.Contains(string(row.Snapshot), "PRIVATE") {
		t.Fatalf("invalid persisted inquiry %+v", row)
	}
	var snapshot map[string]any
	if err := json.Unmarshal(row.Snapshot, &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot["Title"] != "Published piano" || snapshot["Price"] != nil {
		t.Fatal("private state leaked")
	}
	snapshot["Title"] = "client substituted title"
	corrupted := row
	corrupted.ID += "-tampered"
	corrupted.Snapshot, _ = json.Marshal(snapshot)
	if err := r.DB.Create(&corrupted).Error; err == nil {
		t.Fatal("database accepted a substituted snapshot")
	}
	event.ID += "-inquiry-unpublish"
	if _, err := r.UnpublishRecord(ctx, event.ActorUserID, string(profile.ID), state.Record.ID, state.Record.Revision, event); err != nil {
		t.Fatal(err)
	}
	in.ID += "-hidden"
	if err := r.CreatePublicInquiry(ctx, in); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("hidden submission: %v", err)
	}
	var count int64
	if err := admin.Table("buyer_inquiries").Where("record_id=?", state.Record.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatal("failed submission persisted")
	}
	if err := r.DB.Model(&inquiryModel{}).Where("record_id=?", state.Record.ID).Update("message", "changed").Error; err == nil {
		t.Fatal("runtime changed buyer message")
	}
	if err := r.DB.Where("record_id=?", state.Record.ID).Delete(&inquiryModel{}).Error; err == nil {
		t.Fatal("runtime deleted inquiry")
	}
}
func TestPublicInquiryRejectsNoncanonicalInputBeforeStorage(t *testing.T) {
	r, admin, profile, state, _ := publicFixture(t)
	in := app.Submission{ID: string(profile.ID) + "-bad-inquiry", Slug: profile.Slug, PianoID: state.Record.ID, At: testTime, Contact: domain.Contact{Name: " Buyer ", Email: "buyer@example.com", Message: "Hello", Preference: domain.Email}}
	if err := r.CreatePublicInquiry(context.Background(), in); err == nil {
		t.Fatal("repository accepted noncanonical contact")
	}
	var count int64
	if err := admin.Table("buyer_inquiries").Where("record_id=?", state.Record.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("invalid input persisted")
	}
}

func TestPublicInquiryWaitsForConcurrentUnpublish(t *testing.T) {
	for _, target := range []string{"showroom", "piano"} {
		t.Run(target, func(t *testing.T) {
			r, admin, profile, state, event := publicFixture(t)
			tx := r.DB.Begin()
			if tx.Error != nil {
				t.Fatal(tx.Error)
			}
			defer tx.Rollback()
			writer := New(tx)
			if target == "showroom" {
				profile.ShowroomPublished = false
				event.TargetType, event.TargetID = "dealer", string(profile.ID)
				if err := writer.Update(context.Background(), event.ActorUserID, profile, event); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := writer.UnpublishRecord(context.Background(), event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, event); err != nil {
					t.Fatal(err)
				}
			}
			readerDB := connection(t, true)
			pool, err := readerDB.DB()
			if err != nil {
				t.Fatal(err)
			}
			pool.SetMaxOpenConns(1)
			var pid int
			if err := readerDB.Table("pg_stat_activity").Select("pid").Where("pid=pg_backend_pid()").Scan(&pid).Error; err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result := make(chan error, 1)
			go func() {
				result <- New(readerDB).CreatePublicInquiry(ctx, app.Submission{ID: string(profile.ID) + "-racing-inquiry", Slug: profile.Slug, PianoID: state.Record.ID, At: testTime, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Hello", Preference: domain.Email}})
			}()

			for {
				var blocked bool
				if err := admin.Table("pg_stat_activity").Select("count(*) > 0").Where("pid=? AND wait_event_type='Lock'", pid).Scan(&blocked).Error; err != nil {
					t.Fatal(err)
				}
				if blocked {
					break
				}
				select {
				case err := <-result:
					t.Fatalf("submission did not wait for visibility transaction: %v", err)
				case <-ctx.Done():
					t.Fatal("submission did not acquire visibility lock")
				default:
				}
				time.Sleep(10 * time.Millisecond)
			}
			if err := tx.Commit().Error; err != nil {
				t.Fatal(err)
			}
			if err := <-result; !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("submission ignored committed unpublish: %v", err)
			}
		})
	}
}
