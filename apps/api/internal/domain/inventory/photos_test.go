package inventory

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

func photoFixture(t *testing.T) (Record, PhotoCollection, time.Time) {
	t.Helper()
	at := time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC)
	r, err := NewDraft("record", "dealer", "PT-1", at)
	if err != nil {
		t.Fatal(err)
	}
	c, err := RestorePhotos(r.ID, r.DealerID, nil)
	if err != nil {
		t.Fatal(err)
	}
	return r, c, at.Add(time.Second)
}
func readyPhoto(id string) PhotoEvidence {
	return PhotoEvidence{ID: id, RecordID: "record", DealerID: "dealer", Ready: true, AltText: "  Piano  "}
}

func TestPhotoCommandsPreservePrivateRecordAndSnapshots(t *testing.T) {
	r, c, at := photoFixture(t)
	r.PrivateNotes = "private"
	next, c, h, err := r.AttachPhoto(c, readyPhoto("one"), 1, "actor", at)
	if err != nil {
		t.Fatal(err)
	}
	if next.Revision != 2 || h.Revision != 2 || h.Kind != "photos" || !reflect.DeepEqual(h.Fields, []string{"photos"}) || h.ActorID != "actor" || h.Source != Manual || !h.At.Equal(at) {
		t.Fatalf("history: %+v", h)
	}
	if !reflect.DeepEqual(next.Attributes, r.Attributes) || next.Status != r.Status || r.Revision != 1 {
		t.Fatal("unrelated mutation")
	}
	next, c, _, err = next.AttachPhoto(c, readyPhoto("two"), 2, "actor", at)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := c.Evidence()
	next, c, _, err = next.ReorderPhotos(c, []string{"two", "one"}, 3, "actor", at)
	if err != nil || c.Evidence()[0].ID != "two" || snapshot[0].ID != "one" {
		t.Fatalf("reorder: %v", err)
	}
	next, c, _, err = next.DescribePhoto(c, "two", " Keyboard ", 4, "actor", at)
	if err != nil || c.Evidence()[0].AltText != "Keyboard" {
		t.Fatalf("describe: %v", err)
	}
	next, c, _, err = next.RemovePhoto(c, "two", 5, "actor", at)
	if err != nil || next.Revision != 6 || len(c.Evidence()) != 1 || len(snapshot) != 2 {
		t.Fatalf("remove: %v", err)
	}
	out := c.Evidence()
	out[0].AltText = "external"
	if c.Evidence()[0].AltText != "Piano" {
		t.Fatal("mutable evidence")
	}
}

func TestPhotoCommandsRejectInvalidEvidenceOrderAndScope(t *testing.T) {
	r, c, at := photoFixture(t)
	for _, mutate := range []func(*PhotoEvidence){
		func(p *PhotoEvidence) { p.Ready = false }, func(p *PhotoEvidence) { p.RecordID = "other" },
		func(p *PhotoEvidence) { p.DealerID = "other" }, func(p *PhotoEvidence) { p.ID = " one" },
		func(p *PhotoEvidence) { p.ID = "" }, func(p *PhotoEvidence) { p.AltText = string([]byte{255}) },
	} {
		p := readyPhoto("one")
		mutate(&p)
		if _, _, _, err := r.AttachPhoto(c, p, 1, "actor", at); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("invalid evidence: %v", err)
		}
	}
	r, c, _, _ = r.AttachPhoto(c, readyPhoto("one"), 1, "actor", at)
	r, c, _, _ = r.AttachPhoto(c, readyPhoto("two"), 2, "actor", at)
	for _, ids := range [][]string{nil, {"one"}, {"one", "one"}, {"one", "foreign"}, {"one", "two", "three"}} {
		if _, _, _, err := r.ReorderPhotos(c, ids, 3, "actor", at); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("order %v: %v", ids, err)
		}
	}
	if _, _, _, err := r.AttachPhoto(c, readyPhoto("one"), 3, "actor", at); !errors.Is(err, ErrNoChange) {
		t.Fatalf("duplicate: %v", err)
	}
	if _, _, _, err := r.ReorderPhotos(c, []string{"one", "two"}, 3, "actor", at); !errors.Is(err, ErrNoChange) {
		t.Fatalf("unchanged: %v", err)
	}
	if _, _, _, err := r.DescribePhoto(c, "one", "Piano", 3, "actor", at); !errors.Is(err, ErrNoChange) {
		t.Fatalf("unchanged alt: %v", err)
	}
	if _, _, _, err := r.RemovePhoto(c, "missing", 3, "actor", at); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("missing: %v", err)
	}
	if _, _, _, err := r.RemovePhoto(c, "one", 2, "actor", at); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale: %v", err)
	}
	if _, _, _, err := r.RemovePhoto(c, "one", 3, "", at); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("actor: %v", err)
	}
	foreign, _ := RestorePhotos("other", "dealer", nil)
	if _, _, _, err := r.AttachPhoto(foreign, readyPhoto("three"), 3, "actor", at); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("scope: %v", err)
	}
}

func TestPhotosRestoreAndCapacity(t *testing.T) {
	r, _, at := photoFixture(t)
	photos := make([]PhotoEvidence, 50)
	for i := range photos {
		photos[i] = readyPhoto(string(rune('A' + i)))
	}
	c, err := RestorePhotos("record", "dealer", photos)
	if err != nil {
		t.Fatal(err)
	}
	photos[0].AltText = "external"
	if c.Evidence()[0].AltText != "Piano" {
		t.Fatal("restore aliases input")
	}
	if _, _, _, err := r.AttachPhoto(c, readyPhoto("extra"), 1, "actor", at); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("capacity: %v", err)
	}
	if _, err := RestorePhotos("record", "dealer", append(photos, readyPhoto("extra"))); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("restore capacity: %v", err)
	}
	if _, err := RestorePhotos("record", "dealer", []PhotoEvidence{readyPhoto("same"), readyPhoto("same")}); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("duplicates: %v", err)
	}
}

func TestDraftPhotoRemovalPreservesPublishedPhoto(t *testing.T) {
	r, photos := publishFixture(t)
	c, err := RestorePhotos(r.ID, r.DealerID, photos)
	if err != nil {
		t.Fatal(err)
	}
	r, pub, _, err := r.Publish(c.Evidence(), r.Revision, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	next, c, _, err := r.RemovePhoto(c, "photo", r.Revision, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	view, visible := pub.View()
	if !visible || len(view.Photos) != 1 || view.Photos[0].ID != "photo" || len(c.Evidence()) != 0 || next.Status != Available {
		t.Fatal("draft removal changed published snapshot")
	}
}

func TestPhotoRevisionDoesNotAliasPreviousAttributes(t *testing.T) {
	r, c, at := photoFixture(t)
	r.Manufactured = &ManufacturingDate{Year: 1920}
	r.AskingPrice = &Money{MinorUnits: 100, Currency: "USD"}
	r.AcquisitionCost = &Money{MinorUnits: 50, Currency: "USD"}
	next, _, _, err := r.AttachPhoto(c, readyPhoto("one"), 1, "actor", at)
	if err != nil {
		t.Fatal(err)
	}
	next.Manufactured.Year = 2000
	next.AskingPrice.MinorUnits = 200
	next.AcquisitionCost.MinorUnits = 90
	if r.Manufactured.Year != 1920 || r.AskingPrice.MinorUnits != 100 || r.AcquisitionCost.MinorUnits != 50 {
		t.Fatal("new revision aliases previous attributes")
	}
}

func TestPhotoTextLimitsUseUnicodeCharacters(t *testing.T) {
	r, c, at := photoFixture(t)
	p := readyPhoto(strings.Repeat("界", 128))
	p.AltText = strings.Repeat("鍵", 240)
	if _, _, _, err := r.AttachPhoto(c, p, 1, "actor", at); err != nil {
		t.Fatalf("valid boundary: %v", err)
	}
	p.ID += "x"
	if _, _, _, err := r.AttachPhoto(c, p, 1, "actor", at); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("long ID: %v", err)
	}
	p.ID = "valid"
	p.AltText += "x"
	if _, _, _, err := r.AttachPhoto(c, p, 1, "actor", at); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("long alt: %v", err)
	}
	p.ID = string([]byte{255})
	p.AltText = ""
	if _, _, _, err := r.AttachPhoto(c, p, 1, "actor", at); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("invalid ID encoding: %v", err)
	}
}
