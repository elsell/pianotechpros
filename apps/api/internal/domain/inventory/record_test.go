package inventory

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestDraftAcceptsUnknownFactsAndPreservesIdentity(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	draft, err := NewDraft("piano", "dealer", " PT-001 ", now)
	if err != nil {
		t.Fatal(err)
	}
	if draft.DealerID != "dealer" || draft.ID != "piano" || draft.Revision != 1 || draft.Status != Draft || draft.StockNumber != "PT-001" || !draft.CreatedAt.Equal(now) {
		t.Fatalf("unexpected draft: %+v", draft)
	}
	if draft.Form != "" || draft.Condition != "" || draft.AskingPrice != nil || draft.Manufactured != nil {
		t.Fatal("invented unknown facts")
	}
	for _, input := range [][3]string{{"", "dealer", "stock"}, {"piano", " ", "stock"}, {"piano", "dealer", ""}} {
		if _, err := NewDraft(input[0], input[1], input[2], now); !errors.Is(err, ErrInvalidFields) {
			t.Fatal("accepted missing identity/stock")
		}
	}
}

func TestDatePrecisionAndCalendar(t *testing.T) {
	for _, d := range []ManufacturingDate{{Year: 1920}, {Year: 1920, Month: 2}, {Year: 2000, Month: 2, Day: 29}} {
		got, err := ValidateAttributes(Attributes{Manufactured: &d})
		if err != nil || *got.Manufactured != d {
			t.Fatalf("lost date precision: %+v %v", got, err)
		}
	}
	for _, d := range []ManufacturingDate{{}, {Year: 10000}, {Year: -1}, {Year: 1900, Month: 2, Day: 29}, {Year: 2024, Day: 1}, {Year: 2024, Month: 13}, {Year: 2024, Month: 4, Day: 31}, {Year: 2024, Month: -1}, {Year: 2024, Month: 1, Day: -1}} {
		if _, err := ValidateAttributes(Attributes{Manufactured: &d}); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("accepted invalid date: %+v", d)
		}
	}
}

func TestMoneyAndValidatedInputIsolation(t *testing.T) {
	input := Attributes{AskingPrice: &Money{MinorUnits: 0, Currency: "USD"}, AcquisitionCost: &Money{MinorUnits: 12345, Currency: "EUR"}, Manufactured: &ManufacturingDate{Year: 1900}}
	got, err := ValidateAttributes(input)
	if err != nil {
		t.Fatal(err)
	}
	input.AskingPrice.MinorUnits = 100
	input.AcquisitionCost.Currency = "BAD"
	input.Manufactured.Year = 2000
	if got.AskingPrice.MinorUnits != 0 || got.AcquisitionCost.Currency != "EUR" || got.Manufactured.Year != 1900 {
		t.Fatal("caller mutated validated values")
	}
	for _, money := range []Money{{MinorUnits: -1, Currency: "USD"}, {MinorUnits: 9007199254740992, Currency: "USD"}, {Currency: "usd"}, {Currency: "US"}, {Currency: "12A"}} {
		if _, err := ValidateAttributes(Attributes{AskingPrice: &money}); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("accepted invalid money: %+v", money)
		}
	}
}

func TestFieldsAndDisplayTitle(t *testing.T) {
	for _, form := range []Form{"", Grand, FullSizeUpright, StudioUpright, Console, Spinet} {
		for _, condition := range []Condition{"", New, Used, Restored, Rebuilt, Consignment, Other} {
			if _, err := ValidateAttributes(Attributes{Form: form, Condition: condition, PlayerSystem: true}); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, input := range []Attributes{{Form: "player"}, {Condition: "unknown-value"}, {Make: string([]byte{0xff})}, {Title: strings.Repeat("é", 241)}, {PrivateNotes: strings.Repeat("x", 10001)}} {
		if _, err := ValidateAttributes(input); !errors.Is(err, ErrInvalidFields) {
			t.Fatal("accepted invalid fields")
		}
	}
	a, err := ValidateAttributes(Attributes{Title: "  Custom title  ", Make: "Custom maker", Model: "Model", StockNumber: "PT-1", Finish: strings.Repeat("é", 200)})
	if err != nil || a.DisplayTitle() != "Custom title" {
		t.Fatal("invalid custom fields")
	}
	a.Title = ""
	if a.DisplayTitle() != "Custom maker Model" {
		t.Fatal("wrong generated title")
	}
	a.Make = ""
	a.Model = ""
	if a.DisplayTitle() != "PT-1" {
		t.Fatal("wrong fallback title")
	}
}
