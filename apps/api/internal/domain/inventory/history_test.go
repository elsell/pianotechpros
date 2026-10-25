package inventory

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func historyFixture(t *testing.T) (Record, Record, History) {
	t.Helper()
	before, err := NewDraft("piano", "dealer", "PT-1", time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	attributes := before.Attributes
	attributes.Make = "Steinway"
	attributes.Model = "B"
	after, event, err := before.ReviseAttributed(attributes, 1, "actor", []string{"make"}, before.UpdatedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	return before, after, event
}
func TestHistoryProjectionDerivesChangedFieldsAndPreservesUnknownOrigins(t *testing.T) {
	before, after, event := historyFixture(t)
	event.Fields = nil // Attribute persistence stores snapshots and origins, not the field list.
	got, err := RestoreHistory(event, &before, after)
	if err != nil || !reflect.DeepEqual(got.Fields, []string{"make", "model"}) || got.FieldSources["make"] != Voice || got.FieldSources["model"] != Manual {
		t.Fatalf("projection %+v %v", got, err)
	}
	got.Fields[0] = "private_notes"
	got.FieldSources["make"] = Manual
	if event.FieldSources["make"] != Voice {
		t.Fatal("returned mutable origins alias persisted evidence")
	}
	event.FieldSources = nil
	event.Source = Voice
	got, err = RestoreHistory(event, &before, after)
	if err != nil || got.FieldSources != nil || got.Source != Voice {
		t.Fatal("invented older per-field provenance", got, err)
	}
}
func TestHistoryProjectionRejectsCorruptEvidence(t *testing.T) {
	changes := []func(*Record, *Record, *History){
		func(b, a *Record, h *History) { a.DealerID = "other" },
		func(b, a *Record, h *History) { b.Revision = 99 },
		func(b, a *Record, h *History) { h.Revision++ },
		func(b, a *Record, h *History) { h.ActorID = " " },
		func(b, a *Record, h *History) { h.Kind = "unknown" },
		func(b, a *Record, h *History) { h.Source = "provider" },
		func(b, a *Record, h *History) { h.At = h.At.Add(time.Second) },
		func(b, a *Record, h *History) { a.Status = Sold },
		func(b, a *Record, h *History) { a.Make = " padded " },
		func(b, a *Record, h *History) { h.FieldSources["private_notes"] = Voice },
		func(b, a *Record, h *History) { delete(h.FieldSources, "make") },
		func(b, a *Record, h *History) { h.Source = Manual },
		func(b, a *Record, h *History) { h.Fields = []string{"private_notes"} },
		func(b, a *Record, h *History) { h.Reason = "unrelated" },
	}
	for i, change := range changes {
		before, after, event := historyFixture(t)
		change(&before, &after, &event)
		if _, err := RestoreHistory(event, &before, after); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("corrupt evidence %d accepted: %v", i, err)
		}
	}
	before, after, event := historyFixture(t)
	if _, err := RestoreHistory(event, nil, after); err == nil {
		t.Fatal("missing predecessor accepted")
	}
	event.Kind = "created"
	event.Revision = 1
	event.At = before.CreatedAt
	event.Source = Manual
	event.FieldSources = nil
	event.Fields = nil
	if _, err := RestoreHistory(event, nil, before); err != nil {
		t.Fatal("creation rejected", err)
	}
}
func TestHistoryProjectionRestoresLifecycleAndCopiesMoney(t *testing.T) {
	before, _, _ := historyFixture(t)
	after, event, err := before.Transition(Sold, &Money{MinorUnits: 10000, Currency: "USD"}, "", 1, "actor", Manual, before.UpdatedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	got, err := RestoreHistory(event, &before, after)
	if err != nil || got.From != Draft || got.To != Sold || got.SalePrice.MinorUnits != 10000 {
		t.Fatal(got, err)
	}
	got.SalePrice.MinorUnits = 1
	if event.SalePrice.MinorUnits != 10000 {
		t.Fatal("sale price aliased")
	}
	event.From = Available
	if _, err := RestoreHistory(event, &before, after); err == nil {
		t.Fatal("false lifecycle accepted")
	}
}

func TestHistoryProjectionPhotosAndPublication(t *testing.T) {
	before, _, _ := historyFixture(t)
	at := before.UpdatedAt.Add(time.Second)
	photos, _ := RestorePhotos(before.ID, before.DealerID, nil)
	photo := PhotoEvidence{ID: "photo", RecordID: before.ID, DealerID: before.DealerID, AltText: "Keyboard", Ready: true}
	after, _, event, err := before.AttachPhoto(photos, photo, 1, "actor", at)
	if err != nil {
		t.Fatal(err)
	}
	event.Fields = nil // Photo snapshots store record and ready photo evidence.
	got, err := RestoreHistory(event, &before, after)
	if err != nil || !reflect.DeepEqual(got.Fields, []string{"photos"}) {
		t.Fatal(got, err)
	}
	after.PrivateNotes = "unrelated edit"
	if _, err := RestoreHistory(event, &before, after); err == nil {
		t.Fatal("photo event changed private attributes")
	}
}

func TestHistoryProjectionPublicationEvents(t *testing.T) {
	before, photos := publishFixture(t)
	after, publication, event, err := before.Publish(photos, before.Revision, "actor", before.UpdatedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	got, err := RestoreHistory(event, &before, after)
	if err != nil || !reflect.DeepEqual(got.Fields, []string{"publication", "status"}) {
		t.Fatal(got, err)
	}
	hidden, _, unpublish, err := after.Unpublish(publication, after.Revision, "actor", after.UpdatedAt.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RestoreHistory(unpublish, &after, hidden); err != nil {
		t.Fatal(err)
	}
	event.Fields = []string{"publication"}
	if _, err := RestoreHistory(event, &before, after); err == nil {
		t.Fatal("omitted status change accepted")
	}
}

func TestHistoryProjectionPersistedTimestampPrecision(t *testing.T) {
	at := time.Date(2026, 10, 25, 0, 0, 0, 123456789, time.UTC)
	created, _ := NewDraft("piano", "dealer", "PT-1", at)
	stored := created
	stored.CreatedAt = stored.CreatedAt.Truncate(time.Microsecond)
	stored.UpdatedAt = stored.UpdatedAt.Truncate(time.Microsecond)
	attributes := stored.Attributes
	attributes.Make = "Steinway"
	after, event, err := stored.ReviseAttributed(attributes, 1, "actor", nil, at.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	event.At = event.At.Truncate(time.Microsecond) // History row timestamp read from persistence.
	got, err := RestoreHistory(event, &created, after)
	if err != nil || !got.At.Equal(event.At) {
		t.Fatalf("valid persisted history rejected: %v", err)
	}
	event.At = event.At.Add(time.Microsecond)
	if _, err := RestoreHistory(event, &created, after); err == nil {
		t.Fatal("full microsecond mismatch accepted")
	}
}
