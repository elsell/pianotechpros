package inventory

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func publishFixture(t *testing.T) (Record, []PhotoEvidence) {
	r := commandFixture(t)
	r.Form = Grand
	r.Condition = Used
	r.Make = "Maker"
	r.Title = "Original title"
	r.Serial = "PRIVATE-SERIAL"
	r.PrivateNotes = "PRIVATE-NOTES"
	r.Location = "PRIVATE-LOCATION"
	r.AcquisitionCost = &Money{MinorUnits: 98765, Currency: "USD"}
	r.AskingPrice = &Money{MinorUnits: 12345, Currency: "USD"}
	r.Manufactured = &ManufacturingDate{Year: 1920}
	return r, []PhotoEvidence{{ID: "photo", RecordID: r.ID, DealerID: r.DealerID, Ready: true, AltText: " Piano "}}
}
func TestPublicationReadinessAndScopedPhotos(t *testing.T) {
	r := commandFixture(t)
	_, _, _, err := r.Publish(nil, 1, "actor", r.UpdatedAt)
	var readiness *ReadinessError
	if !errors.As(err, &readiness) || len(readiness.Missing) != 4 {
		t.Fatalf("missing readiness: %v", err)
	}
	r, photos := publishFixture(t)
	for _, invalid := range []PhotoEvidence{{ID: "photo", RecordID: "other", DealerID: r.DealerID, Ready: true}, {ID: "photo", RecordID: r.ID, DealerID: "other", Ready: true}, {ID: "photo", RecordID: r.ID, DealerID: r.DealerID}, {ID: "", RecordID: r.ID, DealerID: r.DealerID, Ready: true}} {
		if _, _, _, err := r.Publish([]PhotoEvidence{invalid}, 1, "actor", r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
			t.Fatal("untrusted photo accepted")
		}
	}
	if _, _, _, err := r.Publish(append(photos, photos...), 1, "actor", r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("duplicate photo accepted")
	}
}
func TestPublicSnapshotNeverLeaksPrivateFieldsOrAliasesDraft(t *testing.T) {
	r, photos := publishFixture(t)
	next, pub, event, err := r.Publish(photos, 1, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	view, visible := pub.View()
	if !visible || view.Status != Available || next.Status != Available || event.Kind != "publish" || view.Price != nil {
		t.Fatal("wrong publication state")
	}
	raw, _ := json.Marshal(view)
	for _, secret := range []string{"PRIVATE", "Serial", "AcquisitionCost", "PrivateNotes", "SalePrice", "Location", "98765", "12345"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("leaked %s", secret)
		}
	}
	r.Title = "Unpublished edit"
	r.Manufactured.Year = 2000
	photos[0].AltText = "Changed"
	view.Title = "Mutated consumer"
	view.Photos[0].AltText = "Changed consumer"
	view.Manufactured.Year = 2001
	stable, _ := pub.View()
	if stable.Title != "Original title" || stable.Manufactured.Year != 1920 || stable.Photos[0].AltText != "Piano" {
		t.Fatal("snapshot alias")
	}
}
func TestLifecycleOverlayAndUnpublishPreserveSnapshot(t *testing.T) {
	r, photos := publishFixture(t)
	r.PriceVisible = true
	current, pub, _, err := r.Publish(photos, 1, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	draft := current.Attributes
	draft.Title = "New private title"
	edited, _, err := current.Revise(draft, 2, "actor", Manual, current.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	sold, _, err := edited.Transition(Sold, &Money{MinorUnits: 9000, Currency: "USD"}, "", 3, "actor", Manual, edited.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	live, err := pub.ApplyLifecycle(sold)
	if err != nil {
		t.Fatal(err)
	}
	view, _ := live.View()
	if view.Status != Sold || view.Title != "Original title" || view.Price.MinorUnits != 12345 || view.PublicationRevision != 2 {
		t.Fatal("sale published unrelated edit")
	}
	if _, err := live.ApplyLifecycle(sold); !errors.Is(err, ErrConflict) {
		t.Fatal("duplicate overlay accepted")
	}
	hiddenRecord, hidden, _, err := sold.Unpublish(live, 4, "actor", sold.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := hidden.View(); ok {
		t.Fatal("unpublish visible")
	}
	corrected, _, err := hiddenRecord.Transition(Available, nil, "Cancelled sale", 5, "actor", Manual, hiddenRecord.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	stillHidden, err := hidden.ApplyLifecycle(corrected)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := stillHidden.View(); ok {
		t.Fatal("correction republished")
	}
	if original, _ := pub.View(); original.Status != Available {
		t.Fatal("overlay mutated old value")
	}
}

func TestArchiveForeignRecordsAndRepublish(t *testing.T) {
	r, photos := publishFixture(t)
	r.PriceVisible = true
	current, pub, _, err := r.Publish(photos, 1, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	current.AskingPrice.MinorUnits = 777
	current.Manufactured.Year = 2000
	view, _ := pub.View()
	view.Price.MinorUnits = 1
	stable, _ := pub.View()
	if stable.Price.MinorUnits != 12345 || stable.Manufactured.Year != 1920 {
		t.Fatal("returned draft/view aliases snapshot")
	}
	foreign := current
	foreign.DealerID = "other"
	foreign.Revision++
	if _, err := pub.ApplyLifecycle(foreign); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("foreign overlay")
	}
	if _, _, _, err := foreign.Unpublish(pub, foreign.Revision, "actor", foreign.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("foreign unpublish")
	}
	archived, _, err := current.Transition(Archived, nil, "", 2, "actor", Manual, current.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	hidden, err := pub.ApplyLifecycle(archived)
	if err != nil {
		t.Fatal(err)
	}
	if _, visible := hidden.View(); visible {
		t.Fatal("archive remained visible")
	}
	if len(hidden.snapshot.Photos) != 1 {
		t.Fatal("archive removed retained image reference")
	}
	if _, _, _, err := archived.Publish(photos, 3, "actor", archived.UpdatedAt); err == nil {
		t.Fatal("archived published without correction")
	}
	restored, _, err := archived.Transition(Available, nil, "Restore archived record", 3, "actor", Manual, archived.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	restored.Title = "Explicit republish"
	_, newPub, _, err := restored.Publish(photos, 4, "actor", restored.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	updated, _ := newPub.View()
	if updated.Title != "Explicit republish" || updated.PublicationRevision != 5 {
		t.Fatal("wrong new snapshot")
	}
	old, _ := pub.View()
	if old.Title != "Original title" || old.PublicationRevision != 2 {
		t.Fatal("rewrote earlier snapshot")
	}
}
