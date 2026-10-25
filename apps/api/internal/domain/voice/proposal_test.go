package voice

import (
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"reflect"
	"strings"
	"testing"
)

func ptr[T any](value T) *T { return &value }
func candidate(field string, value Value) Candidate {
	return Candidate{Field: field, Value: value, Confidence: High, Evidence: "spoken evidence"}
}
func TestProposalAddsExplicitValuesAndIgnoresBlanks(t *testing.T) {
	p, err := NewProposal("spoken evidence", []Candidate{candidate("make", Value{Text: ptr("  Steinway  ")}), candidate("model", Value{Text: ptr(" ")}), candidate("finish", Value{}), candidate("featured", Value{Boolean: ptr(false)}), candidate("asking_price", Value{Money: &inventory.Money{MinorUnits: 0, Currency: "USD"}})})
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Candidates()) != 3 {
		t.Fatal("blank suggestions survived")
	}
	base := inventory.Attributes{StockNumber: "PT-1", Model: "Existing", Featured: true}
	changes, err := p.Apply(base, []string{"make", "featured", "asking_price"})
	if err != nil {
		t.Fatal(err)
	}
	after := changes.After()
	if after.Make != "Steinway" || after.Model != "Existing" || after.Featured || after.AskingPrice == nil || after.AskingPrice.MinorUnits != 0 {
		t.Fatal("additive values lost")
	}
	if base.Make != "" || !base.Featured {
		t.Fatal("mutated input")
	}
}
func TestProposalRejectsInvalidOrUnauthorizedCandidates(t *testing.T) {
	bad := []Candidate{candidate("status", Value{Text: ptr("sold")}), candidate("photos", Value{}), candidate("make", Value{Boolean: ptr(true)}), candidate("featured", Value{Text: ptr("false")}), candidate("make", Value{Text: ptr("x"), Boolean: ptr(false)}), candidate("form", Value{Text: ptr("unknown")}), candidate("manufactured", Value{Date: &inventory.ManufacturingDate{Year: 2025, Month: 2, Day: 29}}), candidate("asking_price", Value{Money: &inventory.Money{MinorUnits: -1, Currency: "USD"}}), candidate("make", Value{Text: ptr(string([]byte{0xff}))})}
	for _, c := range bad {
		if _, err := NewProposal("spoken evidence", []Candidate{c}); !errors.Is(err, ErrInvalidProposal) {
			t.Errorf("accepted invalid %s", c.Field)
		}
	}
	c := candidate("make", Value{Text: ptr("A")})
	c.Evidence = "not spoken"
	if _, err := NewProposal("spoken evidence", []Candidate{c}); err == nil {
		t.Fatal("ungrounded evidence")
	}
	c.Evidence = "spoken evidence"
	c.Confidence = "certain"
	if _, err := NewProposal("spoken evidence", []Candidate{c}); err == nil {
		t.Fatal("invalid confidence")
	}
	c.Confidence = High
	if _, err := NewProposal("spoken evidence", []Candidate{c, c}); err == nil {
		t.Fatal("duplicate field")
	}
}
func TestUndoPreservesLaterEditsAndProposalIsolation(t *testing.T) {
	values := []Candidate{candidate("make", Value{Text: ptr("New")}), candidate("asking_price", Value{Money: &inventory.Money{MinorUnits: 12345, Currency: "USD"}})}
	p, err := NewProposal("spoken evidence", values)
	if err != nil {
		t.Fatal(err)
	}
	*values[0].Value.Text = "tampered"
	copy := p.Candidates()
	copy[1].Value.Money.MinorUnits = 99
	changes, err := p.Apply(inventory.Attributes{StockNumber: "PT-1", Make: "Old"}, []string{"make", "asking_price"})
	if err != nil {
		t.Fatal(err)
	}
	current := changes.After()
	current.Make = "Manual correction"
	current.PrivateNotes = "Later note"
	current.AskingPrice.MinorUnits = 9
	current = changes.After()
	current.Make = "Manual correction"
	current.PrivateNotes = "Later note"
	restored, conflicts, err := changes.Undo(current)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Make != "Manual correction" || restored.PrivateNotes != "Later note" || restored.AskingPrice != nil || len(conflicts) != 1 || conflicts[0] != "make" {
		t.Fatal("undo overwrote later edits", conflicts)
	}
	if changes.After().AskingPrice.MinorUnits != 12345 {
		t.Fatal("nested state aliased")
	}
	if _, err := p.Apply(current, []string{"status"}); err == nil {
		t.Fatal("unknown selection")
	}
	if _, err := p.Apply(current, []string{"make", "make"}); err == nil {
		t.Fatal("duplicate selection")
	}
}

func TestEveryEditableFieldAppliesAndUndoesWithoutLosingPrecision(t *testing.T) {
	expected := inventory.Attributes{StockNumber: "PT-2", Title: "Grand", Featured: true, Form: inventory.Grand, PlayerSystem: true, Condition: inventory.Used, Make: "Maker", Model: "Model", Serial: "Serial", Manufactured: &inventory.ManufacturingDate{Year: 2024, Month: 2, Day: 29}, Size: "5 ft", Finish: "Walnut", AskingPrice: &inventory.Money{MinorUnits: 9007199254740991, Currency: "USD"}, PriceVisible: true, Location: "Studio", Description: "Description", AcquisitionCost: &inventory.Money{MinorUnits: 0, Currency: "JPY"}, PrivateNotes: "Private"}
	values := []Candidate{
		candidate("stock_number", Value{Text: ptr("PT-2")}), candidate("title", Value{Text: ptr("Grand")}), candidate("featured", Value{Boolean: ptr(true)}), candidate("form", Value{Text: ptr("grand")}), candidate("player_system", Value{Boolean: ptr(true)}), candidate("condition", Value{Text: ptr("used")}), candidate("make", Value{Text: ptr("Maker")}), candidate("model", Value{Text: ptr("Model")}), candidate("serial", Value{Text: ptr("Serial")}), candidate("manufactured", Value{Date: &inventory.ManufacturingDate{Year: 2024, Month: 2, Day: 29}}), candidate("size", Value{Text: ptr("5 ft")}), candidate("finish", Value{Text: ptr("Walnut")}), candidate("asking_price", Value{Money: &inventory.Money{MinorUnits: 9007199254740991, Currency: "USD"}}), candidate("price_visible", Value{Boolean: ptr(true)}), candidate("location", Value{Text: ptr("Studio")}), candidate("description", Value{Text: ptr("Description")}), candidate("acquisition_cost", Value{Money: &inventory.Money{MinorUnits: 0, Currency: "JPY"}}), candidate("private_notes", Value{Text: ptr("Private")}),
	}
	values[0].Confidence = Uncertain
	proposal, err := NewProposal("spoken evidence", values)
	if err != nil {
		t.Fatal(err)
	}
	if proposal.Candidates()[0].Confidence != Uncertain {
		t.Fatal("lost ambiguity")
	}
	fields := make([]string, len(values))
	for i, v := range values {
		fields[i] = v.Field
	}
	base := inventory.Attributes{StockNumber: "PT-1"}
	changes, err := proposal.Apply(base, fields)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(changes.After(), expected) || len(changes.Fields()) != 18 {
		t.Fatal("incomplete extraction", changes.Fields())
	}
	restored, conflicts, err := changes.Undo(changes.After())
	if err != nil || len(conflicts) != 0 || !reflect.DeepEqual(restored, base) {
		t.Fatal("undo did not restore", err, conflicts)
	}
	selected, err := proposal.Apply(base, []string{"make"})
	if err != nil || selected.After().Make != "Maker" || selected.After().StockNumber != "PT-1" || selected.After().AskingPrice != nil {
		t.Fatal("unselected fields changed")
	}
	copied := changes.Fields()
	copied[0] = "status"
	before := changes.Before()
	before.StockNumber = "tampered"
	if changes.Before().StockNumber != "PT-1" || changes.Fields()[0] != "stock_number" {
		t.Fatal("mutable change set")
	}
}
func TestProposalBoundsAndInvalidStateFailAtomically(t *testing.T) {
	c := candidate("make", Value{Text: ptr("Maker")})
	for _, transcript := range []string{"", strings.Repeat("x", 16001), string([]byte{0xff})} {
		if _, err := NewProposal(transcript, []Candidate{c}); err == nil {
			t.Fatal("invalid transcript")
		}
	}
	long := strings.Repeat("x", 601)
	c.Evidence = long
	if _, err := NewProposal(long, []Candidate{c}); err == nil {
		t.Fatal("unbounded evidence")
	}
	c.Evidence = "spoken evidence"
	c.Value.Text = ptr(strings.Repeat("x", 161))
	if _, err := NewProposal("spoken evidence", []Candidate{c}); err == nil {
		t.Fatal("field bounds")
	}
	c.Value.Text = ptr("Maker")
	p, err := NewProposal("spoken evidence", []Candidate{c})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Apply(inventory.Attributes{}, []string{"make"}); err == nil {
		t.Fatal("invalid current attributes")
	}
	if _, err := (Proposal{}).Apply(inventory.Attributes{StockNumber: "PT-1"}, nil); err == nil {
		t.Fatal("zero proposal")
	}
	if _, _, err := (ChangeSet{}).Undo(inventory.Attributes{StockNumber: "PT-1"}); err == nil {
		t.Fatal("zero change set")
	}
	before := inventory.Attributes{StockNumber: "PT-1"}
	if _, err := p.Apply(before, []string{"make", "not_a_field"}); err == nil || before.Make != "" {
		t.Fatal("partial invalid application")
	}
}
