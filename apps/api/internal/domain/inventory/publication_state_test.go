package inventory

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestPublicationStateRoundTripPreservesHiddenLifecycleAndIsolation(t *testing.T) {
	r, photos := publishFixture(t)
	r.PriceVisible = true
	next, pub, _, err := r.Publish(photos, r.Revision, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	state := pub.State()
	encoded, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	var decoded PublicationState
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(state, decoded) {
		t.Fatal("serialized state changed")
	}
	state = decoded
	restored, err := RestorePublication(state)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := pub.View()
	got, visible := restored.View()
	if !visible || !reflect.DeepEqual(got, want) {
		t.Fatal("visible round trip changed snapshot")
	}
	state.Snapshot.Photos[0].AltText = "changed"
	state.Snapshot.Price.MinorUnits = 1
	state.Snapshot.Manufactured.Year = 2000
	got, _ = restored.View()
	if !reflect.DeepEqual(got, want) {
		t.Fatal("restore aliases input")
	}
	exported := restored.State()
	exported.Snapshot.Photos[0].AltText = "changed again"
	exported.Snapshot.Price.MinorUnits = 2
	exported.Snapshot.Manufactured.Year = 2001
	got, _ = restored.View()
	original, _ := pub.View()
	if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(original, want) {
		t.Fatal("export aliases publication")
	}
	_, hidden, _, err := next.Unpublish(restored, next.Revision, "actor", next.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	stored := hidden.State()
	hiddenAgain, err := RestorePublication(stored)
	if err != nil {
		t.Fatal(err)
	}
	if _, visible := hiddenAgain.View(); visible {
		t.Fatal("restoration republished hidden snapshot")
	}
	if !reflect.DeepEqual(stored, hiddenAgain.State()) || len(stored.Snapshot.Photos) != 1 {
		t.Fatal("hidden snapshot lost retained content")
	}
}

func TestPublicationStateRejectsCorruptStorage(t *testing.T) {
	r, photos := publishFixture(t)
	r.PriceVisible = true
	_, pub, _, err := r.Publish(photos, 1, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*PublicationState){
		"empty identity":         func(s *PublicationState) { s.Snapshot.ID = "" },
		"padded identity":        func(s *PublicationState) { s.Snapshot.DealerID = " dealer " },
		"invalid utf8 identity":  func(s *PublicationState) { s.Snapshot.ID = "\xff" },
		"initial revision":       func(s *PublicationState) { s.Snapshot.PublicationRevision = 1 },
		"future snapshot":        func(s *PublicationState) { s.Snapshot.PublicationRevision = s.AppliedRevision + 1 },
		"unsafe applied":         func(s *PublicationState) { s.AppliedRevision = 9007199254740992 },
		"invalid status":         func(s *PublicationState) { s.Snapshot.Status = "unknown" },
		"visible archive":        func(s *PublicationState) { s.Snapshot.Status = Archived },
		"visible draft":          func(s *PublicationState) { s.Snapshot.Status = Draft },
		"visible service":        func(s *PublicationState) { s.Snapshot.Status = InService },
		"empty stock":            func(s *PublicationState) { s.Snapshot.StockNumber = "" },
		"missing form":           func(s *PublicationState) { s.Snapshot.Form = "" },
		"missing condition":      func(s *PublicationState) { s.Snapshot.Condition = "" },
		"missing title":          func(s *PublicationState) { s.Snapshot.Title = "" },
		"oversized title":        func(s *PublicationState) { s.Snapshot.Title = strings.Repeat("x", 322) },
		"oversized manual title": func(s *PublicationState) { s.Snapshot.Title = strings.Repeat("x", 241) },
		"noncanonical title":     func(s *PublicationState) { s.Snapshot.Title = " title " },
		"noncanonical field":     func(s *PublicationState) { s.Snapshot.Make = " Maker " },
		"invalid price":          func(s *PublicationState) { s.Snapshot.Price.MinorUnits = -1 },
		"invalid date":           func(s *PublicationState) { s.Snapshot.Manufactured.Month = 13 },
		"no photos":              func(s *PublicationState) { s.Snapshot.Photos = nil },
		"duplicate photos":       func(s *PublicationState) { s.Snapshot.Photos = append(s.Snapshot.Photos, s.Snapshot.Photos[0]) },
		"empty photo id":         func(s *PublicationState) { s.Snapshot.Photos[0].ID = "" },
		"noncanonical alt":       func(s *PublicationState) { s.Snapshot.Photos[0].AltText = " alt " },
		"oversized alt":          func(s *PublicationState) { s.Snapshot.Photos[0].AltText = strings.Repeat("x", 241) },
		"invalid photo utf8":     func(s *PublicationState) { s.Snapshot.Photos[0].ID = "\xff" },
		"invalid alt utf8":       func(s *PublicationState) { s.Snapshot.Photos[0].AltText = "\xff" },
	}
	for name, corrupt := range cases {
		t.Run(name, func(t *testing.T) {
			state := pub.State()
			corrupt(&state)
			if _, err := RestorePublication(state); !errors.Is(err, ErrInvalidFields) {
				t.Fatalf("corrupt state accepted: %v", err)
			}
		})
	}
}

func TestPublicationStateSupportsDerivedTitleAndHiddenStatusOverlays(t *testing.T) {
	r, photos := publishFixture(t)
	r.Title = ""
	r.Make = strings.Repeat("M", 160)
	r.Model = strings.Repeat("N", 160)
	next, pub, _, err := r.Publish(photos, 1, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = RestorePublication(pub.State()); err != nil {
		t.Fatal("legitimate derived title rejected", err)
	}
	for _, status := range []Status{Available, Reserved, Sold, Archived, InService, Draft} {
		t.Run(string(status), func(t *testing.T) {
			next.Revision = 3
			next.Status = status
			overlay, err := pub.ApplyLifecycle(next)
			if err != nil {
				t.Fatal(err)
			}
			restored, err := RestorePublication(overlay.State())
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(overlay.State(), restored.State()) {
				t.Fatal("overlay altered")
			}
		})
	}
}

func TestPublicationCommandsCannotEmitUnrestorableState(t *testing.T) {
	r, photos := publishFixture(t)
	for _, id := range []string{" padded ", "\xff"} {
		invalid := r
		invalid.ID = id
		evidence := append([]PhotoEvidence(nil), photos...)
		evidence[0].RecordID = id
		if _, _, _, err := invalid.Publish(evidence, 1, "actor", r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
			t.Fatal("invalid publication identity accepted", err)
		}
	}
	next, pub, _, err := r.Publish(photos, 1, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	next.Revision = 9007199254740992
	if _, err := pub.ApplyLifecycle(next); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("unsafe overlay revision accepted", err)
	}
}
