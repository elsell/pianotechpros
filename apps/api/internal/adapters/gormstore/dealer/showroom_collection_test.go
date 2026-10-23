package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	inventoryapp "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	showroom "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func collectionPiano(t *testing.T, r *Repository, dealerID, suffix string, attrs inventory.Attributes, status inventory.Status, event audit.Event) inventory.Record {
	t.Helper()
	ctx := context.Background()
	draft, err := inventory.NewDraft(dealerID+suffix, dealerID, suffix, testTime)
	if err != nil {
		t.Fatal(err)
	}
	event.ID = draft.ID + "-create"
	event.TargetType = "inventory"
	event.TargetID = draft.ID
	event.Action = audit.ResourceCreated
	if _, _, err = r.CreateDraft(ctx, event.ActorUserID, draft, draft.ID, event); err != nil {
		t.Fatal(err)
	}
	event.ID += "-photo"
	event.Action = audit.ResourceUpdated
	photo, err := r.StorePhoto(ctx, event.ActorUserID, dealerID, draft.ID, inventoryapp.PhotoUpload{ID: draft.ID + "-photo", Key: draft.ID, ExpectedRevision: 1, Image: normalizedTestPhoto(t)}, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-revise"
	attrs.StockNumber = suffix
	record, err := r.ReviseRecord(ctx, event.ActorUserID, dealerID, draft.ID, photo.State.Record.Revision, attrs, inventory.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-publish"
	state, err := r.PublishRecord(ctx, event.ActorUserID, dealerID, draft.ID, record.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	if status != inventory.Available {
		event.ID += "-status"
		var sale *inventory.Money
		if status == inventory.Sold {
			sale = &inventory.Money{MinorUnits: 100, Currency: "USD"}
		}
		state, err = r.TransitionRecord(ctx, event.ActorUserID, dealerID, draft.ID, state.Record.Revision, status, sale, "", event)
		if err != nil {
			t.Fatal(err)
		}
	}
	return state.Record
}

func TestPublicCollectionFiltersOnlyPublishedValues(t *testing.T) {
	r, _, profile, state, event := publicFixture(t)
	_, _, _, _, _ = publicFixture(t) // A foreign showroom must never enter this collection.
	attrs := state.Record.Attributes
	attrs.Title = "100%_\\ Piano"
	attrs.Form = inventory.StudioUpright
	attrs.Featured = true
	attrs.PriceVisible = true
	attrs.AskingPrice = &inventory.Money{MinorUnits: 0, Currency: "USD"}
	featured := collectionPiano(t, r, string(profile.ID), "-a", attrs, inventory.Reserved, event)
	attrs.Title = "Sold grand"
	attrs.Form = inventory.Grand
	attrs.Featured = false
	attrs.AskingPrice = &inventory.Money{MinorUnits: 25000, Currency: "USD"}
	sold := collectionPiano(t, r, string(profile.ID), "-b", attrs, inventory.Sold, event)
	attrs.Title = "Euro grand"
	attrs.AskingPrice = &inventory.Money{MinorUnits: 25000, Currency: "EUR"}
	euro := collectionPiano(t, r, string(profile.ID), "-c", attrs, inventory.Available, event)
	hidden := collectionPiano(t, r, string(profile.ID), "-hidden", attrs, inventory.Available, event)
	hideEvent := event
	hideEvent.ID += "-hide-piano"
	hideEvent.TargetID = hidden.ID
	if _, err := r.UnpublishRecord(context.Background(), event.ActorUserID, hidden.DealerID, hidden.ID, hidden.Revision, hideEvent); err != nil {
		t.Fatal(err)
	}
	draft, err := inventory.NewDraft(string(profile.ID)+"-draft", string(profile.ID), "draft-only", testTime)
	if err != nil {
		t.Fatal(err)
	}
	draftEvent := event
	draftEvent.ID += "-private-draft"
	draftEvent.TargetID, draftEvent.Action = draft.ID, audit.ResourceCreated
	if _, _, err := r.CreateDraft(context.Background(), event.ActorUserID, draft, draft.ID, draftEvent); err != nil {
		t.Fatal(err)
	}
	zero, price := int64(0), int64(25000)
	for _, tt := range []struct {
		name string
		q    showroom.Query
		ids  []string
	}{
		{"default", showroom.Query{}, []string{featured.ID, euro.ID, state.Record.ID}},
		{"all", showroom.Query{Availability: "all"}, []string{featured.ID, sold.ID, euro.ID, state.Record.ID}},
		{"sold", showroom.Query{Availability: "sold"}, []string{sold.ID}},
		{"form", showroom.Query{Form: inventory.StudioUpright}, []string{featured.ID}},
		{"literal", showroom.Query{Search: "%_\\ pIANO"}, []string{featured.ID}},
		{"zero", showroom.Query{Currency: "USD", MinPrice: &zero, MaxPrice: &zero}, []string{featured.ID}},
		{"currency", showroom.Query{Currency: "EUR"}, []string{euro.ID}},
		{"exact", showroom.Query{Availability: "all", Currency: "USD", MinPrice: &price, MaxPrice: &price}, []string{sold.ID}},
		{"empty", showroom.Query{Search: "no matching piano"}, nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			tt.q.Limit = 100
			page, err := r.ListPublicPianos(context.Background(), profile.Slug, tt.q)
			if err != nil {
				t.Fatal(err)
			}
			var ids []string
			for _, p := range page.Pianos {
				ids = append(ids, p.ID)
			}
			if !reflect.DeepEqual(ids, tt.ids) || page.HasMore || page.Profile.ID != string(profile.ID) {
				t.Fatalf("page: %+v ids %v want %v", page, ids, tt.ids)
			}
		})
	}
	attrs = featured.Attributes
	attrs.Title = "PRIVATE SEARCH"
	attrs.Featured = false
	attrs.AskingPrice = &inventory.Money{MinorUnits: 9, Currency: "EUR"}
	event.ID += "-private"
	event.TargetID = featured.ID
	if _, err := r.ReviseRecord(context.Background(), event.ActorUserID, featured.DealerID, featured.ID, featured.Revision, attrs, inventory.Manual, event); err != nil {
		t.Fatal(err)
	}
	page, err := r.ListPublicPianos(context.Background(), profile.Slug, showroom.Query{Limit: 1, Currency: "USD", MaxPrice: &zero})
	if err != nil || len(page.Pianos) != 1 || page.Pianos[0].Title != "100%_\\ Piano" {
		t.Fatalf("private changes leaked: %+v %v", page, err)
	}
	var ids []string
	q := showroom.Query{Limit: 1, Availability: "all"}
	for i := 0; i < 5; i++ {
		page, err := r.ListPublicPianos(context.Background(), profile.Slug, q)
		if err != nil || len(page.Pianos) != 1 {
			t.Fatalf("pagination: %+v %v", page, err)
		}
		p := page.Pianos[0]
		ids = append(ids, p.ID)
		if !page.HasMore {
			break
		}
		q.AfterID = p.ID
		q.AfterFeatured = p.Featured
	}
	if !reflect.DeepEqual(ids, []string{featured.ID, sold.ID, euro.ID, state.Record.ID}) {
		t.Fatalf("continuation duplicates/skips: %v", ids)
	}
	profile.ShowroomPublished = false
	event.ID += "-hide"
	event.TargetType = "dealer"
	event.TargetID = string(profile.ID)
	if err := r.Update(context.Background(), event.ActorUserID, profile, event); err != nil {
		t.Fatal(err)
	}
	page, err = r.ListPublicPianos(context.Background(), profile.Slug, showroom.Query{Limit: 10, Search: "no match"})
	if !errors.Is(err, ports.ErrNotFound) || page.Profile.ID != "" || len(page.Pianos) != 0 {
		t.Fatalf("hidden empty page: %+v %v", page, err)
	}
}

func TestPublicCollectionRejectsInvalidQueryBeforeStorage(t *testing.T) {
	if _, err := New(nil).ListPublicPianos(context.Background(), "shop", showroom.Query{}); !errors.Is(err, showroom.ErrInvalidQuery) {
		t.Fatal(err)
	}
}

func TestPublicCollectionRejectsMalformedFeaturedSnapshot(t *testing.T) {
	for _, kind := range []string{"missing", "null", "lowercase", "conflicting"} {
		t.Run(kind, func(t *testing.T) {
			r, _, profile, state, event := publicFixture(t)
			// Inject a malformed persisted snapshot through this connection's writer;
			// retain real PostgreSQL constraints and the immutable snapshot guards.
			const callback = "test:malformed-publication"
			err := r.DB.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
				row, ok := tx.Statement.Dest.(*publicationSnapshotModel)
				if !ok {
					return
				}
				var fields map[string]json.RawMessage
				if err := json.Unmarshal(row.Snapshot, &fields); err != nil {
					tx.AddError(err)
					return
				}
				switch kind {
				case "missing":
					delete(fields, "Featured")
				case "null":
					fields["Featured"] = json.RawMessage("null")
				case "lowercase":
					delete(fields, "Featured")
					fields["featured"] = json.RawMessage("true")
				case "conflicting":
					fields["Featured"] = json.RawMessage("false")
					fields["featured"] = json.RawMessage("true")
				}
				body, err := json.Marshal(fields)
				if err != nil {
					tx.AddError(err)
					return
				}
				row.Snapshot = body
			})
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { r.DB.Callback().Create().Remove(callback) })
			if _, err := r.PublishRecord(context.Background(), event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, event); err != nil {
				t.Fatal(err)
			}
			page, err := r.ListPublicPianos(context.Background(), profile.Slug, showroom.Query{Limit: 1})
			if err == nil || page.Profile.ID != "" || len(page.Pianos) != 0 || page.HasMore {
				t.Fatalf("corrupt ordering produced continuation data: %+v %v", page, err)
			}
		})
	}
}

func TestPublicCollectionDependencyFailureDiscardsProfileAndPage(t *testing.T) {
	r, admin, profile, _, _ := publicFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	page, err := r.ListPublicPianos(ctx, profile.Slug, showroom.Query{Limit: 10})
	if err == nil || page.Profile.ID != "" || len(page.Pianos) != 0 || page.HasMore {
		t.Fatalf("cancelled read: %+v %v", page, err)
	}
	if err := admin.Model(&model{}).Where("id=?", profile.ID).Update("email", "malformed").Error; err != nil {
		t.Fatal(err)
	}
	page, err = r.ListPublicPianos(context.Background(), profile.Slug, showroom.Query{Limit: 10})
	if err == nil || page.Profile.ID != "" || len(page.Pianos) != 0 || page.HasMore {
		t.Fatalf("corrupt profile: %+v %v", page, err)
	}
}

func TestPublicCollectionWaitsBehindUnpublish(t *testing.T) {
	for _, target := range []string{"showroom", "piano"} {
		t.Run(target, func(t *testing.T) {
			r, admin, profile, state, event := publicFixture(t)
			tx := r.DB.Begin()
			if tx.Error != nil {
				t.Fatal(tx.Error)
			}
			defer tx.Rollback()
			if target == "showroom" {
				profile.ShowroomPublished = false
				event.TargetType = "dealer"
				event.TargetID = string(profile.ID)
				if err := New(tx).Update(context.Background(), event.ActorUserID, profile, event); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := New(tx).UnpublishRecord(context.Background(), event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, event); err != nil {
					t.Fatal(err)
				}
			}
			reader := connection(t, true)
			pool, err := reader.DB()
			if err != nil {
				t.Fatal(err)
			}
			pool.SetMaxOpenConns(1)
			var pid int
			if err := reader.Table("pg_stat_activity").Select("pid").Where("pid=pg_backend_pid()").Scan(&pid).Error; err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result := make(chan error, 1)
			go func() {
				page, err := New(reader).ListPublicPianos(ctx, profile.Slug, showroom.Query{Limit: 10})
				if len(page.Pianos) != 0 || page.HasMore {
					result <- errors.New("unpublished piano leaked")
					return
				}
				if target == "showroom" && page.Profile.ID != "" {
					result <- errors.New("unpublished showroom leaked")
					return
				}
				result <- err
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
					t.Fatalf("read did not wait: %v", err)
				case <-ctx.Done():
					t.Fatal("read did not acquire visibility lock")
				default:
				}
				time.Sleep(10 * time.Millisecond)
			}
			if err := tx.Commit().Error; err != nil {
				t.Fatal(err)
			}
			err = <-result
			if target == "showroom" {
				if !errors.Is(err, ports.ErrNotFound) {
					t.Fatal(err)
				}
			} else if err != nil {
				t.Fatal(err)
			}
		})
	}
}
