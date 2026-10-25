package inventory

import (
	"errors"
	"reflect"
	"testing"
)

func TestAttributedRevisionSeparatesManualAndVoiceFields(t *testing.T) {
	r := commandFixture(t)
	a := r.Attributes
	a.Make = "Steinway"
	a.Model = "Model B"
	a.PrivateNotes = "Typed note"
	labels := []string{"make", "model"}
	next, event, err := r.ReviseAttributed(a, 1, "actor", labels, r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	if next.Revision != 2 || next.Status != Draft || event.Source != Mixed {
		t.Fatalf("invalid attributed revision: %+v %v", event, err)
	}
	want := map[string]Source{"make": Voice, "model": Voice, "private_notes": Manual}
	if !reflect.DeepEqual(event.FieldSources, want) {
		t.Fatalf("sources: %#v", event.FieldSources)
	}
	labels[0] = "private_notes"
	event.Fields[0] = "other"
	if event.FieldSources["make"] != Voice || r.Make != "" {
		t.Fatal("aliased input or prior record")
	}
}
func TestAttributedRevisionRejectsFalseAndProtectedLabels(t *testing.T) {
	r := commandFixture(t)
	a := r.Attributes
	a.Title = "Updated"
	for _, labels := range [][]string{{"title", "title"}, {"id"}, {"status"}, {"dealer_id"}, {"revision"}, {"make"}, {" title"}, {"unknown"}} {
		if _, _, err := r.ReviseAttributed(a, 1, "actor", labels, r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("accepted %v: %v", labels, err)
		}
	}
	if _, _, err := r.ReviseAttributed(a, 2, "actor", []string{"title"}, r.UpdatedAt); !errors.Is(err, ErrConflict) {
		t.Fatal("accepted stale revision")
	}
	if _, _, err := r.Revise(a, 1, "actor", Mixed, r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("mixed accepted as whole-command source")
	}
	if _, _, err := r.Transition(Available, nil, "", 1, "actor", Mixed, r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("mixed accepted for lifecycle")
	}
}
func TestAttributedRevisionDefaultsToManualAndRejectsExcessLabels(t *testing.T) {
	r := commandFixture(t)
	a := r.Attributes
	a.Title = "Typed"
	_, event, err := r.ReviseAttributed(a, 1, "actor", nil, r.UpdatedAt)
	if err != nil || event.Source != Manual || event.FieldSources["title"] != Manual {
		t.Fatalf("manual default: %+v %v", event, err)
	}
	labels := make([]string, 19)
	for i := range labels {
		labels[i] = "title"
	}
	if _, _, err := r.ReviseAttributed(a, 1, "actor", labels, r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("accepted oversized attribution")
	}
}

func TestAttributedRevisionUniformSourcesAndNormalization(t *testing.T) {
	r := commandFixture(t)
	a := r.Attributes
	a.Title = "Updated"
	a.Manufactured = &ManufacturingDate{Year: 1990}
	a.AskingPrice = &Money{Currency: "USD", MinorUnits: 10000}
	for _, source := range []Source{Manual, Voice} {
		_, event, err := r.Revise(a, 1, "actor", source, r.UpdatedAt)
		if err != nil {
			t.Fatal(err)
		}
		if len(event.FieldSources) != 3 {
			t.Fatalf("incomplete sources: %+v", event)
		}
		for _, field := range event.Fields {
			if event.FieldSources[field] != source {
				t.Fatalf("wrong source for %s", field)
			}
		}
	}
	_, event, err := r.ReviseAttributed(a, 1, "actor", []string{"title", "manufactured", "asking_price"}, r.UpdatedAt)
	if err != nil || event.Source != Voice {
		t.Fatalf("uniform voice: %+v %v", event, err)
	}
	a = r.Attributes
	a.Make = " "
	if _, _, err := r.ReviseAttributed(a, 1, "actor", []string{"make"}, r.UpdatedAt); err == nil {
		t.Fatal("unchanged normalized field labeled voice")
	}
}
