package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestInventoryPublicationPersistsSnapshotSaleAndUnpublishAtomically(t *testing.T) {
	r, admin, photos, event := photoEditFixture(t)
	ctx := context.Background()
	actor, id, dealerID := event.ActorUserID, photos.Record.ID, photos.Record.DealerID
	attrs := photos.Record.Attributes
	attrs.Title = "Published piano"
	attrs.Form = domain.Grand
	attrs.Condition = domain.Used
	attrs.AskingPrice = &domain.Money{MinorUnits: 12000, Currency: "USD"}
	attrs.PriceVisible = true
	record, err := r.ReviseRecord(ctx, actor, dealerID, id, photos.Record.Revision, attrs, domain.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-publish"
	state, err := r.PublishRecord(ctx, actor, dealerID, id, record.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	publishedRevision := state.Record.Revision
	view, visible := state.Publication.View()
	if !visible || view.Title != "Published piano" || len(view.Photos) != 2 || state.Record.Status != domain.Available {
		t.Fatal("publication incomplete")
	}
	// Private edits must not change the retained snapshot.
	event.ID += "-private"
	attrs.Title = "Unpublished piano"
	attrs.AskingPrice.MinorUnits = 30000
	record, err = r.ReviseRecord(ctx, actor, dealerID, id, state.Record.Revision, attrs, domain.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-private-photo-removal"
	removed, err := r.RemovePhoto(ctx, actor, dealerID, id, photos.Photos[0].ID, record.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	record = removed.Record
	event.ID += "-sale"
	state, err = r.TransitionRecord(ctx, actor, dealerID, id, record.Revision, domain.Sold, &domain.Money{MinorUnits: 10000, Currency: "USD"}, "", event)
	if err != nil {
		t.Fatal(err)
	}
	view, visible = state.Publication.View()
	if !visible || view.Status != domain.Sold || view.Title != "Published piano" || view.Price.MinorUnits != 12000 || view.PublicationRevision != publishedRevision || len(view.Photos) != 2 {
		t.Fatal("sale published unrelated changes")
	}
	var history inventoryHistoryModel
	if err := admin.Where("record_id=? AND revision=?", id, state.Record.Revision).First(&history).Error; err != nil {
		t.Fatal(err)
	}
	if !containsJSONSale(history.Snapshot) {
		t.Fatal("sale event was not retained privately")
	}
	event.ID += "-hide"
	state, err = r.UnpublishRecord(ctx, actor, dealerID, id, state.Record.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-correct"
	state, err = r.TransitionRecord(ctx, actor, dealerID, id, state.Record.Revision, domain.Available, nil, "sale reversed", event)
	if err != nil {
		t.Fatal(err)
	}
	if _, visible := state.Publication.View(); visible {
		t.Fatal("correction republished hidden record")
	}
	// Reload through the scoped audited read boundary.
	read := event
	read.ID += "-read"
	read.Action = audit.ResourceViewed
	loaded, err := r.GetPublication(ctx, actor, dealerID, id, read)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Publication == nil || loaded.Publication.State().Visible || loaded.Publication.State().Snapshot.Title != "Published piano" {
		t.Fatal("hidden snapshot lost")
	}
	event.ID += "-republish"
	state, err = r.PublishRecord(ctx, actor, dealerID, id, state.Record.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	view, visible = state.Publication.View()
	if !visible || view.Title != "Unpublished piano" || view.Price.MinorUnits != 30000 || len(view.Photos) != 1 {
		t.Fatal("explicit republish did not update snapshot")
	}

	historyRead := event
	historyRead.ID += "-history"
	historyRead.Action = audit.ResourceListed
	timeline, err := r.ListHistory(ctx, actor, dealerID, id, domain.HistoryQuery{Limit: 50}, historyRead)
	if err != nil || len(timeline.Entries) != int(state.Record.Revision) || timeline.HasMore {
		t.Fatalf("complete persisted timeline: %+v %v", timeline, err)
	}
	kinds := map[string]bool{}
	saleFound := false
	for _, entry := range timeline.Entries {
		kinds[entry.Kind] = true
		if entry.SalePrice != nil && entry.SalePrice.MinorUnits == 10000 {
			saleFound = true
		}
	}
	for _, kind := range []string{"created", "attributes", "photos", "publish", "unpublish", "lifecycle"} {
		if !kinds[kind] {
			t.Fatalf("missing persisted history kind %s", kind)
		}
	}
	if !saleFound {
		t.Fatal("private sale history lost price")
	}
	var count int64
	if err := admin.Table("inventory_publication_snapshots").Where("record_id=?", id).Count(&count).Error; err != nil || count != 2 {
		t.Fatal("old snapshot was replaced", err, count)
	}
	if err := admin.Table("inventory_publication_photos").Where("record_id=?", id).Count(&count).Error; err != nil || count != 3 {
		t.Fatal("retained media references missing", err, count)
	}
	// Duplicate audit ID must roll back the next lifecycle and visibility state.
	before := state.Record.Revision
	if _, err = r.TransitionRecord(ctx, actor, dealerID, id, before, domain.Archived, nil, "", event); err == nil {
		t.Fatal("duplicate audit accepted")
	}
	read.ID += "-rollback"
	loaded, err = r.GetPublication(ctx, actor, dealerID, id, read)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Record.Revision != before || !loaded.Publication.State().Visible {
		t.Fatal("failed audit partially committed")
	}
	if _, err = r.PublishRecord(ctx, actor, dealerID, id, before-1, event); !errors.Is(err, ports.ErrConflict) {
		t.Fatal("stale revision accepted", err)
	}
	foreign := read
	foreign.ActorUserID = "foreign"
	if _, err = r.GetPublication(ctx, "foreign", dealerID, id, foreign); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("foreign actor read publication")
	}
	read.ID += "-foreign"
	read.TargetID = "foreign"
	if _, err = r.GetPublication(ctx, actor, dealerID, "foreign", read); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("foreign record accepted", err)
	}
	if err := r.DB.Exec("UPDATE inventory_publications SET visible=false WHERE record_id=?", id).Error; err == nil {
		t.Fatal("unaudited pointer update accepted")
	}
	for _, table := range []string{"inventory_publication_snapshots", "inventory_publication_photos"} {
		if err := r.DB.Exec("DELETE FROM "+table+" WHERE record_id=?", id).Error; err == nil {
			t.Fatal("runtime deleted retained state", table)
		}
		if err := admin.Exec("DELETE FROM "+table+" WHERE record_id=?", id).Error; err == nil {
			t.Fatal("owner bypassed immutable guard", table)
		}
		if err := r.DB.Exec("TRUNCATE " + table + " CASCADE").Error; err == nil {
			t.Fatal("runtime truncated retained state", table)
		}
		if err := admin.Exec("TRUNCATE " + table + " CASCADE").Error; err == nil {
			t.Fatal("owner truncated retained state", table)
		}
	}
}

func TestInventoryPublicationReadinessAndMissingPublicationAreFailClosed(t *testing.T) {
	r, admin, state, event := photoEditFixture(t)
	ctx := context.Background()
	record := state.Record
	_, err := r.PublishRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, event)
	var readiness *domain.ReadinessError
	if !errors.As(err, &readiness) {
		t.Fatal("unready draft published", err)
	}
	if _, err := r.UnpublishRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, event); !errors.Is(err, domain.ErrNoChange) {
		t.Fatal("missing publication treated as visible", err)
	}
	var count int64
	if err := admin.Table("inventory_publication_snapshots").Where("record_id=?", record.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("failed publication persisted", err)
	}
	event.ID += "-read"
	event.Action = audit.ResourceViewed
	loaded, err := r.GetPublication(ctx, event.ActorUserID, record.DealerID, record.ID, event)
	if err != nil || loaded.Publication != nil || loaded.Record.Revision != record.Revision {
		t.Fatal("unpublished draft read failed", err)
	}
}

func containsJSONSale(raw []byte) bool {
	var stored struct{ Event domain.History }
	return json.Unmarshal(raw, &stored) == nil && stored.Event.SalePrice != nil && stored.Event.SalePrice.MinorUnits == 10000 && stored.Event.Kind == "lifecycle"
}

func TestInventoryPublicationRejectsRevokedAuthorityAndReadAuditFailure(t *testing.T) {
	r, admin, state, event := photoEditFixture(t)
	ctx := context.Background()
	record := state.Record
	event.Action = audit.ResourceViewed
	loaded, err := r.GetPublication(ctx, event.ActorUserID, record.DealerID, record.ID, event)
	if err != nil || loaded.Record.ID != record.ID {
		t.Fatal(err)
	}
	if result, err := r.GetPublication(ctx, event.ActorUserID, record.DealerID, record.ID, event); err == nil || result.Record.ID != "" {
		t.Fatal("unaudited read returned data")
	}
	if err := admin.Table("user_models").Where("id=?", event.ActorUserID).Update("status", "disabled").Error; err != nil {
		t.Fatal(err)
	}
	event.ID += "-revoked"
	event.Action = audit.ResourceUpdated
	if _, err := r.TransitionRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, domain.Archived, nil, "", event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("revoked actor mutated record", err)
	}
	var current inventoryRecordModel
	if err := admin.Where("id=?", record.ID).First(&current).Error; err != nil || current.Revision != record.Revision {
		t.Fatal("revoked command changed record", err)
	}
}

func TestInventoryPublicationCannotAppendToAnOldSnapshot(t *testing.T) {
	r, _, photos, event := photoEditFixture(t)
	ctx := context.Background()
	actor := event.ActorUserID
	record := photos.Record
	attrs := record.Attributes
	attrs.Title = "Piano"
	attrs.Form = domain.Grand
	attrs.Condition = domain.Used
	next, err := r.ReviseRecord(ctx, actor, record.DealerID, record.ID, record.Revision, attrs, domain.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-publish"
	published, err := r.PublishRecord(ctx, actor, record.DealerID, record.ID, next.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-new-photo"
	added, err := r.StorePhoto(ctx, actor, record.DealerID, record.ID, app.PhotoUpload{ID: record.ID + "-new", Key: "publication-later-photo", ExpectedRevision: published.Record.Revision, Image: normalizedTestPhoto(t)}, event)
	if err != nil {
		t.Fatal(err)
	}
	ref := publicationPhotoModel{RecordID: record.ID, DealerID: record.DealerID, PublicationRevision: published.Record.Revision, PhotoID: record.ID + "-new"}
	if err := r.DB.Create(&ref).Error; err == nil {
		t.Fatal("later photo attached to retained snapshot")
	}
	view, _ := published.Publication.View()
	view.PublicationRevision = added.State.Record.Revision
	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	row := publicationSnapshotModel{RecordID: record.ID, DealerID: record.DealerID, Revision: view.PublicationRevision, Snapshot: raw}
	if err := r.DB.Create(&row).Error; err == nil {
		t.Fatal("nonpublication history used to create snapshot")
	}
}

func TestInventoryPublicationSnapshotFailureRollsBackRecordHistoryAndAudit(t *testing.T) {
	r, admin, photos, event := photoEditFixture(t)
	ctx := context.Background()
	record := photos.Record
	attrs := record.Attributes
	attrs.Title = "Piano"
	attrs.Form = domain.Grand
	attrs.Condition = domain.Used
	record, err := r.ReviseRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, attrs, domain.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	// A controlled database constraint fails after record, audit and history writes.
	escaped := strings.ReplaceAll(record.ID, "'", "''")
	if err := admin.Exec("ALTER TABLE inventory_publication_snapshots ADD CONSTRAINT publication_test_failure CHECK (record_id <> '" + escaped + "')").Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := admin.Exec("ALTER TABLE inventory_publication_snapshots DROP CONSTRAINT publication_test_failure").Error; err != nil {
			t.Error(err)
		}
	})
	event.ID += "-failed-snapshot"
	if _, err := r.PublishRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, event); err == nil {
		t.Fatal("snapshot failure returned success")
	}
	var row inventoryRecordModel
	if err := admin.Where("id=?", record.ID).First(&row).Error; err != nil || row.Revision != record.Revision || row.Status != record.Status {
		t.Fatal("failed snapshot changed record", err)
	}
	var count int64
	if err := admin.Table("inventory_history").Where("record_id=? AND revision>?", record.ID, record.Revision).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("failed snapshot left history", err)
	}
	if err := admin.Table("audit_event_models").Where("id=?", event.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("failed snapshot left success audit", err)
	}
}

func TestInventoryPublicationConcurrentCommandsCommitOneRevision(t *testing.T) {
	r, admin, photos, event := photoEditFixture(t)
	ctx := context.Background()
	record := photos.Record
	attrs := record.Attributes
	attrs.Title = "Piano"
	attrs.Form = domain.Grand
	attrs.Condition = domain.Used
	record, err := r.ReviseRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, attrs, domain.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	for _, suffix := range []string{"-publish-one", "-publish-two"} {
		command := event
		command.ID += suffix
		go func() {
			_, err := r.PublishRecord(ctx, command.ActorUserID, record.DealerID, record.ID, record.Revision, command)
			results <- err
		}()
	}
	successes, conflicts := 0, 0
	for range 2 {
		err := <-results
		if err == nil {
			successes++
		} else if errors.Is(err, ports.ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatal("concurrent commands did not arbitrate", successes, conflicts)
	}
	var count int64
	if err := admin.Table("inventory_publication_snapshots").Where("record_id=?", record.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatal("concurrent snapshot count", count, err)
	}
}
