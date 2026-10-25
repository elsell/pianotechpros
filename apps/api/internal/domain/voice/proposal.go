package voice

import (
	"errors"
	"reflect"
	"strings"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

var ErrInvalidProposal = errors.New("invalid_voice_proposal")

type Confidence string

const (
	High      Confidence = "high"
	Uncertain Confidence = "uncertain"
)

type Value struct {
	Text    *string
	Boolean *bool
	Money   *inventory.Money
	Date    *inventory.ManufacturingDate
}
type Candidate struct {
	Field      string
	Value      Value
	Confidence Confidence
	Evidence   string
}
type Proposal struct {
	valid      bool
	transcript string
	candidates []Candidate
}
type ChangeSet struct {
	valid         bool
	before, after inventory.Attributes
	fields        []string
}

func cloneValue(v Value) Value {
	if v.Text != nil {
		x := *v.Text
		v.Text = &x
	}
	if v.Boolean != nil {
		x := *v.Boolean
		v.Boolean = &x
	}
	if v.Money != nil {
		x := *v.Money
		v.Money = &x
	}
	if v.Date != nil {
		x := *v.Date
		v.Date = &x
	}
	return v
}
func cloneAttributes(a inventory.Attributes) inventory.Attributes {
	if a.Manufactured != nil {
		x := *a.Manufactured
		a.Manufactured = &x
	}
	if a.AskingPrice != nil {
		x := *a.AskingPrice
		a.AskingPrice = &x
	}
	if a.AcquisitionCost != nil {
		x := *a.AcquisitionCost
		a.AcquisitionCost = &x
	}
	return a
}
func fieldKind(field string) string {
	switch field {
	case "stock_number", "title", "form", "condition", "make", "model", "serial", "size", "finish", "location", "description", "private_notes":
		return "text"
	case "featured", "player_system", "price_visible":
		return "boolean"
	case "asking_price", "acquisition_cost":
		return "money"
	case "manufactured":
		return "date"
	}
	return ""
}
func valueKind(v Value) (string, int) {
	kind, count := "", 0
	if v.Text != nil {
		kind = "text"
		count++
	}
	if v.Boolean != nil {
		kind = "boolean"
		count++
	}
	if v.Money != nil {
		kind = "money"
		count++
	}
	if v.Date != nil {
		kind = "date"
		count++
	}
	return kind, count
}
func read(a inventory.Attributes, field string) Value {
	switch field {
	case "stock_number":
		return Value{Text: &a.StockNumber}
	case "title":
		return Value{Text: &a.Title}
	case "make":
		return Value{Text: &a.Make}
	case "model":
		return Value{Text: &a.Model}
	case "serial":
		return Value{Text: &a.Serial}
	case "size":
		return Value{Text: &a.Size}
	case "finish":
		return Value{Text: &a.Finish}
	case "location":
		return Value{Text: &a.Location}
	case "description":
		return Value{Text: &a.Description}
	case "private_notes":
		return Value{Text: &a.PrivateNotes}
	case "form":
		x := string(a.Form)
		return Value{Text: &x}
	case "condition":
		x := string(a.Condition)
		return Value{Text: &x}
	case "featured":
		return Value{Boolean: &a.Featured}
	case "player_system":
		return Value{Boolean: &a.PlayerSystem}
	case "price_visible":
		return Value{Boolean: &a.PriceVisible}
	case "asking_price":
		return cloneValue(Value{Money: a.AskingPrice})
	case "acquisition_cost":
		return cloneValue(Value{Money: a.AcquisitionCost})
	case "manufactured":
		return cloneValue(Value{Date: a.Manufactured})
	}
	return Value{}
}
func write(a *inventory.Attributes, field string, v Value) {
	v = cloneValue(v)
	switch field {
	case "stock_number":
		a.StockNumber = *v.Text
	case "title":
		a.Title = *v.Text
	case "make":
		a.Make = *v.Text
	case "model":
		a.Model = *v.Text
	case "serial":
		a.Serial = *v.Text
	case "size":
		a.Size = *v.Text
	case "finish":
		a.Finish = *v.Text
	case "location":
		a.Location = *v.Text
	case "description":
		a.Description = *v.Text
	case "private_notes":
		a.PrivateNotes = *v.Text
	case "form":
		a.Form = inventory.Form(*v.Text)
	case "condition":
		a.Condition = inventory.Condition(*v.Text)
	case "featured":
		a.Featured = *v.Boolean
	case "player_system":
		a.PlayerSystem = *v.Boolean
	case "price_visible":
		a.PriceVisible = *v.Boolean
	case "asking_price":
		a.AskingPrice = v.Money
	case "acquisition_cost":
		a.AcquisitionCost = v.Money
	case "manufactured":
		a.Manufactured = v.Date
	}
}
func NewProposal(transcript string, candidates []Candidate) (Proposal, error) {
	transcript = strings.TrimSpace(transcript)
	if transcript == "" || !utf8.ValidString(transcript) || utf8.RuneCountInString(transcript) > 16000 || len(candidates) > 18 {
		return Proposal{}, ErrInvalidProposal
	}
	p := Proposal{valid: true, transcript: transcript}
	seen := map[string]bool{}
	for _, candidate := range candidates {
		expected := fieldKind(candidate.Field)
		if expected == "" || seen[candidate.Field] {
			return Proposal{}, ErrInvalidProposal
		}
		seen[candidate.Field] = true
		kind, count := valueKind(candidate.Value)
		if count == 0 {
			continue
		}
		if count != 1 || kind != expected {
			return Proposal{}, ErrInvalidProposal
		}
		if candidate.Value.Text != nil && strings.TrimSpace(*candidate.Value.Text) == "" {
			continue
		}
		candidate.Evidence = strings.TrimSpace(candidate.Evidence)
		if candidate.Confidence != High && candidate.Confidence != Uncertain || candidate.Evidence == "" || !utf8.ValidString(candidate.Evidence) || utf8.RuneCountInString(candidate.Evidence) > 600 || !strings.Contains(transcript, candidate.Evidence) {
			return Proposal{}, ErrInvalidProposal
		}
		attributes := inventory.Attributes{}
		write(&attributes, candidate.Field, candidate.Value)
		canonical, err := inventory.ValidateAttributes(attributes)
		if err != nil {
			return Proposal{}, ErrInvalidProposal
		}
		candidate.Value = read(canonical, candidate.Field)
		p.candidates = append(p.candidates, candidate)
	}
	return p, nil
}
func (p Proposal) Transcript() string { return p.transcript }
func (p Proposal) Candidates() []Candidate {
	result := make([]Candidate, len(p.candidates))
	for i, c := range p.candidates {
		c.Value = cloneValue(c.Value)
		result[i] = c
	}
	return result
}
func validAttributes(a inventory.Attributes) bool {
	canonical, err := inventory.ValidateAttributes(a)
	return err == nil && a.StockNumber != "" && reflect.DeepEqual(a, canonical)
}
func (p Proposal) Apply(current inventory.Attributes, selected []string) (ChangeSet, error) {
	if !p.valid || !validAttributes(current) {
		return ChangeSet{}, ErrInvalidProposal
	}
	changes := ChangeSet{valid: true, before: cloneAttributes(current), after: cloneAttributes(current)}
	candidates := map[string]Candidate{}
	for _, c := range p.candidates {
		candidates[c.Field] = c
	}
	seen := map[string]bool{}
	for _, field := range selected {
		c, ok := candidates[field]
		if !ok || seen[field] {
			return ChangeSet{}, ErrInvalidProposal
		}
		seen[field] = true
		if !reflect.DeepEqual(read(current, field), c.Value) {
			write(&changes.after, field, c.Value)
			changes.fields = append(changes.fields, field)
		}
	}
	if !validAttributes(changes.after) {
		return ChangeSet{}, ErrInvalidProposal
	}
	return changes, nil
}
func (c ChangeSet) Before() inventory.Attributes { return cloneAttributes(c.before) }
func (c ChangeSet) After() inventory.Attributes  { return cloneAttributes(c.after) }
func (c ChangeSet) Fields() []string             { return append([]string(nil), c.fields...) }
func (c ChangeSet) Undo(current inventory.Attributes) (inventory.Attributes, []string, error) {
	if !c.valid || !validAttributes(current) {
		return inventory.Attributes{}, nil, ErrInvalidProposal
	}
	result := cloneAttributes(current)
	var conflicts []string
	for _, field := range c.fields {
		if reflect.DeepEqual(read(current, field), read(c.after, field)) {
			write(&result, field, read(c.before, field))
		} else {
			conflicts = append(conflicts, field)
		}
	}
	if !validAttributes(result) {
		return inventory.Attributes{}, nil, ErrInvalidProposal
	}
	return result, conflicts, nil
}
