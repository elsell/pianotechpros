package inventory

import (
	"errors"
	"reflect"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrConflict          = errors.New("inventory_revision_conflict")
	ErrNoChange          = errors.New("inventory_no_change")
	ErrRevisionExhausted = errors.New("inventory_revision_exhausted")
)

const (
	Available Status = "available"
	Reserved  Status = "reserved"
	InService Status = "in_service"
	Sold      Status = "sold"
	Archived  Status = "archived"
)

type Source string

const (
	Manual Source = "manual"
	Voice  Source = "voice"
)

// History is private append-only domain history, never a public DTO or audit payload.
type History struct {
	RecordID, DealerID, ActorID string
	Revision                    int64
	Source                      Source
	Kind                        string
	Fields                      []string
	From, To                    Status
	SalePrice                   *Money
	Reason                      string
	At                          time.Time
}

func validStatus(status Status) bool {
	switch status {
	case Draft, Available, Reserved, InService, Sold, Archived:
		return true
	}
	return false
}
func (r Record) command(expected int64, actor string, source Source, at time.Time) error {
	if expected != r.Revision {
		return ErrConflict
	}
	if r.Revision < 1 || strings.TrimSpace(r.ID) == "" || strings.TrimSpace(r.DealerID) == "" || !utf8.ValidString(actor) || strings.TrimSpace(actor) == "" || (source != Manual && source != Voice) || at.IsZero() || r.CreatedAt.IsZero() || r.UpdatedAt.Before(r.CreatedAt) || at.Before(r.UpdatedAt) || !validStatus(r.Status) {
		return ErrInvalidFields
	}
	if r.Revision >= 9007199254740991 {
		return ErrRevisionExhausted
	}
	return nil
}
func (r Record) history(actor string, source Source, at time.Time, kind string) History {
	return History{RecordID: r.ID, DealerID: r.DealerID, ActorID: actor, Revision: r.Revision + 1, Source: source, Kind: kind, At: at}
}
func changedFields(a, b Attributes) []string {
	fields := []struct {
		name          string
		before, after any
	}{
		{"stock_number", a.StockNumber, b.StockNumber}, {"title", a.Title, b.Title}, {"featured", a.Featured, b.Featured},
		{"form", a.Form, b.Form}, {"player_system", a.PlayerSystem, b.PlayerSystem}, {"condition", a.Condition, b.Condition},
		{"make", a.Make, b.Make}, {"model", a.Model, b.Model}, {"serial", a.Serial, b.Serial}, {"manufactured", a.Manufactured, b.Manufactured},
		{"size", a.Size, b.Size}, {"finish", a.Finish, b.Finish}, {"asking_price", a.AskingPrice, b.AskingPrice}, {"price_visible", a.PriceVisible, b.PriceVisible},
		{"location", a.Location, b.Location}, {"description", a.Description, b.Description}, {"acquisition_cost", a.AcquisitionCost, b.AcquisitionCost}, {"private_notes", a.PrivateNotes, b.PrivateNotes},
	}
	var changed []string
	for _, field := range fields {
		if !reflect.DeepEqual(field.before, field.after) {
			changed = append(changed, field.name)
		}
	}
	return changed
}
func (r Record) Revise(input Attributes, expected int64, actor string, source Source, at time.Time) (Record, History, error) {
	if err := r.command(expected, actor, source, at); err != nil {
		return Record{}, History{}, err
	}
	attributes, err := ValidateAttributes(input)
	if err != nil || attributes.StockNumber == "" {
		return Record{}, History{}, ErrInvalidFields
	}
	fields := changedFields(r.Attributes, attributes)
	if len(fields) == 0 {
		return Record{}, History{}, ErrNoChange
	}
	event := r.history(actor, source, at, "attributes")
	event.Fields = fields
	r.Attributes = attributes
	r.Revision++
	r.UpdatedAt = at
	return r, event, nil
}
func (r Record) Transition(target Status, price *Money, reason string, expected int64, actor string, source Source, at time.Time) (Record, History, error) {
	if err := r.command(expected, actor, source, at); err != nil {
		return Record{}, History{}, err
	}
	if source != Manual || !validStatus(target) || !utf8.ValidString(reason) {
		return Record{}, History{}, ErrInvalidFields
	}
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) > 1000 || ((r.Status == Sold || r.Status == Archived || target == Draft) && reason == "") {
		return Record{}, History{}, ErrInvalidFields
	}
	if target == r.Status && target != Sold {
		return Record{}, History{}, ErrNoChange
	}
	if (target == Sold && price == nil) || (target != Sold && price != nil) {
		return Record{}, History{}, ErrInvalidFields
	}
	// Copy the current draft without accepting an unrelated attribute payload.
	attributes, err := ValidateAttributes(r.Attributes)
	if err != nil || attributes.StockNumber == "" {
		return Record{}, History{}, ErrInvalidFields
	}
	sale, err := ValidateAttributes(Attributes{AskingPrice: price})
	if err != nil {
		return Record{}, History{}, err
	}
	event := r.history(actor, source, at, "lifecycle")
	event.From = r.Status
	event.To = target
	event.Reason = reason
	event.SalePrice = sale.AskingPrice
	event.Fields = []string{"status"}
	if target == Sold {
		event.Fields = append(event.Fields, "sale_price")
	}
	r.Attributes = attributes
	r.Status = target
	r.Revision++
	r.UpdatedAt = at
	return r, event, nil
}
