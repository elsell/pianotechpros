package inventory

import (
	"errors"
	"testing"
	"time"
)

func commandFixture(t *testing.T) Record {
	t.Helper()
	r, err := NewDraft("piano", "dealer", "PT-1", time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func TestAttributeRevisionAndHistory(t *testing.T) {
	r := commandFixture(t)
	a := r.Attributes
	a.Make = "Custom"
	a.AskingPrice = &Money{MinorUnits: 10000, Currency: "USD"}
	next, event, err := r.Revise(a, 1, "actor", Voice, r.UpdatedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if next.Revision != 2 || next.Status != Draft || next.ID != r.ID || next.DealerID != r.DealerID || !next.CreatedAt.Equal(r.CreatedAt) {
		t.Fatal("identity or lifecycle changed")
	}
	if event.ActorID != "actor" || event.Source != Voice || event.Revision != 2 || event.Kind != "attributes" || len(event.Fields) != 2 {
		t.Fatalf("incomplete history: %+v", event)
	}
	a.AskingPrice.MinorUnits = 999
	if next.AskingPrice.MinorUnits != 10000 || r.AskingPrice != nil {
		t.Fatal("mutation aliases input")
	}
	if _, _, err := next.Revise(a, 1, "actor", Manual, next.UpdatedAt); !errors.Is(err, ErrConflict) {
		t.Fatal("accepted stale revision")
	}
	if _, _, err := next.Revise(next.Attributes, 2, "actor", Manual, next.UpdatedAt); !errors.Is(err, ErrNoChange) {
		t.Fatal("accepted empty edit")
	}
}
func TestSaleAndCorrectionDoNotPublishDraftOrAlterHistory(t *testing.T) {
	r := commandFixture(t)
	r.Title = "Private edit"
	price := &Money{MinorUnits: 250000, Currency: "USD"}
	sold, event, err := r.Transition(Sold, price, "", 1, "actor", Manual, r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	price.MinorUnits = 0
	if sold.Title != r.Title || sold.Status != Sold || event.SalePrice.MinorUnits != 250000 || event.From != Draft || event.To != Sold {
		t.Fatal("sale lost private data or price")
	}
	if _, _, err := sold.Transition(Available, nil, "", 2, "actor", Manual, sold.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("correction requires reason")
	}
	corrected, correction, err := sold.Transition(Available, nil, "Sale cancelled", 2, "actor", Manual, sold.UpdatedAt)
	if err != nil || corrected.Status != Available || correction.Reason != "Sale cancelled" || correction.SalePrice != nil || event.SalePrice.MinorUnits != 250000 {
		t.Fatal("history rewritten")
	}
	if _, _, err := r.Transition(Sold, nil, "", 1, "actor", Manual, r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("sale without price")
	}
	if _, _, err := r.Transition(Available, nil, "", 1, "actor", Voice, r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("voice changed lifecycle")
	}
}
func TestInvalidCommandContextAndFields(t *testing.T) {
	r := commandFixture(t)
	a := r.Attributes
	a.Title = "Updated"
	for _, c := range []struct {
		actor  string
		source Source
		at     time.Time
	}{{"", Manual, r.UpdatedAt}, {"actor", "unknown", r.UpdatedAt}, {"actor", Manual, time.Time{}}, {"actor", Manual, r.UpdatedAt.Add(-time.Second)}} {
		if _, _, err := r.Revise(a, 1, c.actor, c.source, c.at); !errors.Is(err, ErrInvalidFields) {
			t.Fatal("invalid context accepted")
		}
	}
	a.StockNumber = ""
	if _, _, err := r.Revise(a, 1, "actor", Manual, r.UpdatedAt); !errors.Is(err, ErrInvalidFields) {
		t.Fatal("blank stock accepted")
	}
	for _, target := range []Status{Draft, "bogus"} {
		if _, _, err := r.Transition(target, nil, "", 1, "actor", Manual, r.UpdatedAt); err == nil {
			t.Fatal("invalid transition accepted")
		}
	}
	if _, _, err := r.Transition(Available, &Money{Currency: "USD"}, "", 1, "actor", Manual, r.UpdatedAt); err == nil {
		t.Fatal("price on nonsale accepted")
	}
}

func TestLifecycleCorrectionsAndRevisionExhaustion(t *testing.T) {
	for _, from := range []Status{Draft, Available, Reserved, InService, Sold, Archived} {
		for _, to := range []Status{Draft, Available, Reserved, InService, Sold, Archived} {
			r := commandFixture(t)
			r.Status = from
			var price *Money
			if to == Sold {
				price = &Money{MinorUnits: 0, Currency: "USD"}
			}
			next, event, err := r.Transition(to, price, "Explicit correction", 1, "actor", Manual, r.UpdatedAt)
			if from == to && to != Sold {
				if !errors.Is(err, ErrNoChange) {
					t.Fatal("accepted duplicate lifecycle")
				}
				continue
			}
			if err != nil || next.Revision != 2 || event.From != from || event.To != to {
				t.Fatalf("transition %s -> %s: %v", from, to, err)
			}
			if to == Sold && event.SalePrice == nil {
				t.Fatal("zero sale price lost")
			}
		}
	}
	r := commandFixture(t)
	r.Revision = 9007199254740991
	if _, _, err := r.Transition(Available, nil, "", r.Revision, "actor", Manual, r.UpdatedAt); !errors.Is(err, ErrRevisionExhausted) {
		t.Fatal("overflowing revision accepted")
	}
}

func TestLifecycleResultDoesNotAliasPrivateDraft(t *testing.T) {
	r := commandFixture(t)
	r.Manufactured = &ManufacturingDate{Year: 1920}
	r.AcquisitionCost = &Money{MinorUnits: 12345, Currency: "USD"}
	next, _, err := r.Transition(Available, nil, "", 1, "actor", Manual, r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	next.Manufactured.Year = 2000
	next.AcquisitionCost.MinorUnits = 0
	if r.Manufactured.Year != 1920 || r.AcquisitionCost.MinorUnits != 12345 {
		t.Fatal("transition result aliases earlier revision")
	}
}
