package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func photoEditFixture(t *testing.T) (*Repository, *gorm.DB, app.PhotoState, audit.Event) {
	t.Helper()
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	draft, err := domain.NewDraft(string(e.ID)+"-piano", string(e.ID), "PT-1", testTime)
	if err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID += "-draft"
	event.TargetType = "inventory"
	event.TargetID = draft.ID
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, draft, "draft", event); err != nil {
		t.Fatal(err)
	}
	event.Action = audit.ResourceUpdated
	var state app.PhotoState
	for i, suffix := range []string{"-one", "-two"} {
		event.ID += suffix
		out, err := r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, app.PhotoUpload{ID: draft.ID + suffix, Key: "photo-edit-intent" + suffix, ExpectedRevision: int64(i + 1), Image: normalizedTestPhoto(t)}, event)
		if err != nil {
			t.Fatal(err)
		}
		state = out.State
	}
	event.ID += "-edit"
	return r, admin, state, event
}

func TestInventoryPhotoEditsKeepDenseOrderAndImmutableBytes(t *testing.T) {
	r, admin, state, event := photoEditFixture(t)
	ctx := context.Background()
	actor, dealerID, id := event.ActorUserID, state.Record.DealerID, state.Record.ID
	one, two := state.Photos[0].ID, state.Photos[1].ID
	state, err := r.ReorderPhotos(ctx, actor, dealerID, id, []string{two, one}, 3, event)
	if err != nil || state.Record.Revision != 4 || state.Photos[0].ID != two {
		t.Fatalf("reorder: %+v %v", state, err)
	}
	event.ID += "-alt"
	state, err = r.DescribePhoto(ctx, actor, dealerID, id, two, " Keyboard close-up ", 4, event)
	if err != nil || state.Record.Revision != 5 || state.Photos[0].AltText != "Keyboard close-up" {
		t.Fatalf("alt: %+v %v", state, err)
	}
	event.ID += "-no-op"
	state, err = r.DescribePhoto(ctx, actor, dealerID, id, two, "Keyboard close-up", 5, event)
	if err != nil || state.Record.Revision != 5 {
		t.Fatalf("no-op: %v", err)
	}
	var logged struct{ Action string }
	if err := admin.Table("audit_event_models").Where("id=?", event.ID).Take(&logged).Error; err != nil || logged.Action != string(audit.ResourceViewed) {
		t.Fatalf("no-op audit: %+v %v", logged, err)
	}
	event.ID += "-remove"
	state, err = r.RemovePhoto(ctx, actor, dealerID, id, two, 5, event)
	if err != nil || state.Record.Revision != 6 || len(state.Photos) != 1 || state.Photos[0].ID != one {
		t.Fatalf("remove: %+v %v", state, err)
	}
	var refs []photoReferenceModel
	if err := admin.Where("record_id=?", id).Find(&refs).Error; err != nil || len(refs) != 1 || refs[0].Position != 0 {
		t.Fatalf("sparse references: %+v %v", refs, err)
	}
	var assets int64
	if err := admin.Table("inventory_photo_assets").Where("record_id=?", id).Count(&assets).Error; err != nil || assets != 2 {
		t.Fatal("removal deleted bytes")
	}
	var histories int64
	if err := admin.Table("inventory_history").Where("record_id=?", id).Count(&histories).Error; err != nil || histories != 6 {
		t.Fatal("missing or duplicate history")
	}
	var previous inventoryHistoryModel
	if err := admin.Where("record_id=? AND revision=?", id, 5).First(&previous).Error; err != nil {
		t.Fatal(err)
	}
	var snapshot app.PhotoState
	if err := json.Unmarshal(previous.Snapshot, &snapshot); err != nil || len(snapshot.Photos) != 2 || snapshot.Photos[0].ID != two || snapshot.Photos[0].AltText != "Keyboard close-up" {
		t.Fatalf("retained photo history: %+v %v", snapshot, err)
	}
	event.ID += "-list"
	event.Action = audit.ResourceViewed
	loaded, err := r.GetPhotos(ctx, actor, dealerID, id, event)
	if err != nil || loaded.Record.Revision != 6 || len(loaded.Photos) != 1 || loaded.Photos[0].ID != one {
		t.Fatalf("persisted state: %+v %v", loaded, err)
	}
	event.ID += "-removed"
	if _, err := r.GetPhoto(ctx, actor, dealerID, id, two, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("removed draft image readable: %v", err)
	}
}

func TestInventoryPhotoEditFailureRollsBackAndRejectsScope(t *testing.T) {
	r, admin, state, event := photoEditFixture(t)
	ctx := context.Background()
	actor, dealerID, id := event.ActorUserID, state.Record.DealerID, state.Record.ID
	one, two := state.Photos[0].ID, state.Photos[1].ID
	// Force audit insertion failure after draft-reference replacement.
	event.ID = event.ID[:len(event.ID)-len("-edit")]
	if out, err := r.ReorderPhotos(ctx, actor, dealerID, id, []string{two, one}, 3, event); err == nil || out.Record.ID != "" {
		t.Fatal("unaudited reorder returned state")
	}
	event.ID += "-read"
	event.Action = audit.ResourceViewed
	loaded, err := r.GetPhotos(ctx, actor, dealerID, id, event)
	if err != nil || loaded.Record.Revision != 3 || loaded.Photos[0].ID != one {
		t.Fatalf("failed edit survived: %+v %v", loaded, err)
	}
	event.ID += "-edit"
	event.Action = audit.ResourceUpdated
	if _, err := r.ReorderPhotos(ctx, actor, dealerID, id, []string{one, one}, 3, event); !errors.Is(err, domain.ErrInvalidFields) {
		t.Fatalf("duplicate order: %v", err)
	}
	if _, err := r.ReorderPhotos(ctx, actor, dealerID, id, []string{one, two}, 2, event); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stale no-op: %v", err)
	}
	if _, err := r.RemovePhoto(ctx, actor, dealerID, id, "foreign", 3, event); !errors.Is(err, domain.ErrInvalidFields) {
		t.Fatalf("foreign photo: %v", err)
	}
	if _, err := r.RemovePhoto(ctx, actor, "foreign", id, one, 3, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("foreign dealer: %v", err)
	}
	event.ActorUserID = "outsider"
	if _, err := r.RemovePhoto(ctx, "outsider", dealerID, id, one, 3, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("outsider: %v", err)
	}
	event.ActorUserID = actor
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", dealerID, actor).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := r.RemovePhoto(ctx, actor, dealerID, id, one, 3, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("revoked editor: %v", err)
	}
}

func TestInventoryPhotoEditsViewerAndConcurrentRevision(t *testing.T) {
	r, admin, state, event := photoEditFixture(t)
	ctx := context.Background()
	actor, dealerID, id := event.ActorUserID, state.Record.DealerID, state.Record.ID
	one, two := state.Photos[0].ID, state.Photos[1].ID
	viewer := id + "-viewer"
	seedUser(t, admin, viewer)
	if err := admin.Create(&membershipModel{DealerID: dealerID, UserID: viewer, Role: "viewer", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	event.ActorUserID = viewer
	event.ID += "-viewer"
	if _, err := r.DescribePhoto(ctx, viewer, dealerID, id, one, "Cannot edit", 3, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("viewer edited: %v", err)
	}
	event.Action = audit.ResourceViewed
	if _, err := r.GetPhotos(ctx, viewer, dealerID, id, event); err != nil {
		t.Fatalf("viewer cannot read: %v", err)
	}
	event.ActorUserID = actor
	event.Action = audit.ResourceUpdated
	results := make(chan error, 2)
	go func() {
		ev := event
		ev.ID += "-reorder"
		_, err := r.ReorderPhotos(ctx, actor, dealerID, id, []string{two, one}, 3, ev)
		results <- err
	}()
	go func() {
		ev := event
		ev.ID += "-describe"
		_, err := r.DescribePhoto(ctx, actor, dealerID, id, one, "New description", 3, ev)
		results <- err
	}()
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
		t.Fatalf("concurrent edits: success=%d conflict=%d", successes, conflicts)
	}
	event.ID += "-read"
	event.Action = audit.ResourceViewed
	actual, err := r.GetPhotos(ctx, actor, dealerID, id, event)
	if err != nil || actual.Record.Revision != 4 || len(actual.Photos) != 2 {
		t.Fatalf("concurrent final state: %+v %v", actual, err)
	}
	// The losing change must not leak through a partially replaced reference set.
	if actual.Photos[0].ID == two && actual.Photos[1].AltText != "" {
		t.Fatal("losing edit leaked")
	}
	if actual.Photos[0].ID == one && actual.Photos[0].AltText != "New description" {
		t.Fatal("winning edit missing")
	}
}
