package dealerstore

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/adapters/photoprocessor"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func normalizedTestPhoto(t *testing.T) ports.ProcessedPhoto {
	t.Helper()
	im := image.NewRGBA(image.Rect(0, 0, 2, 2))
	im.Set(0, 0, color.White)
	var b bytes.Buffer
	if err := png.Encode(&b, im); err != nil {
		t.Fatal(err)
	}
	p, err := photoprocessor.New().Process(context.Background(), &b)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestInventoryPhotoAtomicUploadReplayAndAuthorizedReads(t *testing.T) {
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
	event.ID += "-photo"
	event.Action = audit.ResourceUpdated
	upload := app.PhotoUpload{ID: draft.ID + "-photo", Key: "photo-intent-0001", ExpectedRevision: 1, Image: normalizedTestPhoto(t)}
	out, err := r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, upload, event)
	if err != nil || out.Replay || out.State.Record.Revision != 2 || len(out.State.Photos) != 1 {
		t.Fatalf("upload: %+v %v", out, err)
	}
	event.ID += "-retry"
	retry := upload
	retry.ID += "-unused"
	out, err = r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, retry, event)
	if err != nil || !out.Replay || out.PhotoID != upload.ID || out.State.Record.Revision != 2 {
		t.Fatalf("replay: %+v %v", out, err)
	}
	event.ID += "-changed"
	retry.ExpectedRevision = 2
	if _, err := r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, retry, event); !errors.Is(err, ports.ErrIdempotencyConflict) {
		t.Fatalf("changed intent: %v", err)
	}
	event.ID += "-read"
	event.Action = audit.ResourceViewed
	state, err := r.GetPhotos(ctx, e.OwnerUserID, draft.DealerID, draft.ID, event)
	if err != nil || len(state.Photos) != 1 {
		t.Fatalf("list: %v", err)
	}
	event.ID += "-bytes"
	photo, err := r.GetPhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, upload.ID, event)
	if err != nil || !bytes.Equal(photo.JPEG, upload.Image.JPEG) {
		t.Fatalf("read bytes: %v", err)
	}
	event.ID += "-denied"
	event.ActorUserID = "outsider"
	if _, err := r.GetPhoto(ctx, "outsider", draft.DealerID, draft.ID, upload.ID, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("outsider: %v", err)
	}
	event.ActorUserID = e.OwnerUserID
	if _, err := r.GetPhoto(ctx, e.OwnerUserID, "other", draft.ID, upload.ID, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("dealer scope: %v", err)
	}
	// Reused audit ID must roll back new bytes, attachment, history and reservation.
	event.ID = a.ID
	event.Action = audit.ResourceUpdated
	next := upload
	next.ID += "-next"
	next.Key += "-next"
	next.ExpectedRevision = 2
	if _, err := r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, next, event); err == nil {
		t.Fatal("unaudited upload succeeded")
	}
	var n int64
	if err := admin.Table("inventory_photo_assets").Where("id=?", next.ID).Count(&n).Error; err != nil || n != 0 {
		t.Fatal("failed upload retained bytes")
	}
	event.ID += "-fixed"
	if _, err := r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, next, event); err != nil {
		t.Fatalf("reservation rollback: %v", err)
	}
	if err := runtime.Table("inventory_photo_assets").Where("id=?", upload.ID).Update("jpeg", []byte{1}).Error; err == nil {
		t.Fatal("runtime overwrote asset")
	}
	if err := admin.Model(&photoAssetModel{}).Where("id=?", upload.ID).Update("sha256", upload.Image.SHA256).Error; err == nil {
		t.Fatal("asset guard missing")
	}
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, e.OwnerUserID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	event.ID += "-revoked"
	event.Action = audit.ResourceViewed
	if _, err := r.GetPhotos(ctx, e.OwnerUserID, draft.DealerID, draft.ID, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("revoked reader: %v", err)
	}
}

func TestInventoryPhotoConcurrentWritesAndDetachedReplay(t *testing.T) {
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
	uploads := []app.PhotoUpload{
		{ID: draft.ID + "-one", Key: "photo-concurrent-one", ExpectedRevision: 1, Image: normalizedTestPhoto(t)},
		{ID: draft.ID + "-two", Key: "photo-concurrent-two", ExpectedRevision: 1, Image: normalizedTestPhoto(t)},
	}
	type response struct {
		index  int
		result app.PhotoUploadResult
		err    error
	}
	results := make(chan response, 2)
	for i, upload := range uploads {
		go func(i int, u app.PhotoUpload) {
			ev := event
			ev.ID += u.ID
			out, err := r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, u, ev)
			results <- response{i, out, err}
		}(i, upload)
	}
	winner := -1
	conflicts := 0
	for range uploads {
		v := <-results
		if v.err == nil {
			winner = v.index
		} else if errors.Is(v.err, ports.ErrConflict) {
			conflicts++
		} else {
			t.Fatal(v.err)
		}
	}
	if winner < 0 || conflicts != 1 {
		t.Fatalf("concurrency winner=%d conflicts=%d", winner, conflicts)
	}
	upload := uploads[winner]
	var assets int64
	if err := admin.Table("inventory_photo_assets").Where("record_id=?", draft.ID).Count(&assets).Error; err != nil || assets != 1 {
		t.Fatal("losing upload retained bytes")
	}
	// Model a later draft detach; immutable asset must survive and replay must not reattach.
	if err := admin.Where("record_id=?", draft.ID).Delete(&photoReferenceModel{}).Error; err != nil {
		t.Fatal(err)
	}
	event.ID += "-detached-replay"
	result, err := r.StorePhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, upload, event)
	if err != nil || !result.Replay || len(result.State.Photos) != 0 || result.PhotoID != upload.ID {
		t.Fatalf("detached replay: %+v %v", result, err)
	}
	event.ID += "-removed-read"
	event.Action = audit.ResourceViewed
	if out, err := r.GetPhoto(ctx, e.OwnerUserID, draft.DealerID, draft.ID, upload.ID, event); !errors.Is(err, ports.ErrNotFound) || len(out.JPEG) != 0 {
		t.Fatalf("removed bytes exposed: %v", err)
	}
	if err := admin.Table("inventory_photo_assets").Where("record_id=?", draft.ID).Count(&assets).Error; err != nil || assets != 1 {
		t.Fatal("detach deleted immutable bytes")
	}
	// A matching asset ID cannot be attached to another record through SQL.
	other := draft
	other.ID += "-other"
	other.StockNumber = "PT-2"
	createEvent := event
	createEvent.ID += "-other"
	createEvent.TargetID = other.ID
	createEvent.Action = audit.ResourceCreated
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, other, "other", createEvent); err != nil {
		t.Fatal(err)
	}
	if err := runtime.Create(&photoReferenceModel{RecordID: other.ID, DealerID: other.DealerID, PhotoID: upload.ID, Position: 0}).Error; err == nil {
		t.Fatal("cross-record reference allowed")
	}
	event.ID = a.ID
	if out, err := r.GetPhotos(ctx, e.OwnerUserID, draft.DealerID, draft.ID, event); err == nil || out.Record.ID != "" {
		t.Fatalf("unaudited list returned data: %v", err)
	}
}
