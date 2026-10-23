package inventory

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInvalidFields = errors.New("invalid_inventory_fields")

type Form string

const (
	Grand           Form = "grand"
	FullSizeUpright Form = "full_size_upright"
	StudioUpright   Form = "studio_upright"
	Console         Form = "console"
	Spinet          Form = "spinet"
)

type Condition string

const (
	New         Condition = "new"
	Used        Condition = "used"
	Restored    Condition = "restored"
	Rebuilt     Condition = "rebuilt"
	Consignment Condition = "consignment"
	Other       Condition = "other"
)

type Status string

const Draft Status = "draft"

type ManufacturingDate struct{ Year, Month, Day int }
type Money struct {
	MinorUnits int64
	Currency   string
}
type Attributes struct {
	StockNumber, Title    string
	Featured              bool
	Form                  Form
	PlayerSystem          bool
	Condition             Condition
	Make, Model, Serial   string
	Manufactured          *ManufacturingDate
	Size, Finish          string
	AskingPrice           *Money
	PriceVisible          bool
	Location, Description string
	AcquisitionCost       *Money
	PrivateNotes          string
}
type Record struct {
	ID, DealerID string
	Revision     int64
	Status       Status
	Attributes
	CreatedAt, UpdatedAt time.Time
}

func ValidateAttributes(a Attributes) (Attributes, error) {
	fields := []struct {
		value *string
		limit int
	}{
		{&a.StockNumber, 80}, {&a.Title, 240}, {&a.Make, 160}, {&a.Model, 160}, {&a.Serial, 160},
		{&a.Size, 80}, {&a.Finish, 200}, {&a.Location, 200}, {&a.Description, 10000}, {&a.PrivateNotes, 10000},
	}
	for _, field := range fields {
		if !utf8.ValidString(*field.value) {
			return Attributes{}, ErrInvalidFields
		}
		*field.value = strings.TrimSpace(*field.value)
		if utf8.RuneCountInString(*field.value) > field.limit {
			return Attributes{}, ErrInvalidFields
		}
	}
	switch a.Form {
	case "", Grand, FullSizeUpright, StudioUpright, Console, Spinet:
	default:
		return Attributes{}, ErrInvalidFields
	}
	switch a.Condition {
	case "", New, Used, Restored, Rebuilt, Consignment, Other:
	default:
		return Attributes{}, ErrInvalidFields
	}
	if a.Manufactured != nil {
		d := *a.Manufactured
		if d.Year < 1 || d.Year > 9999 || d.Month < 0 || d.Month > 12 || d.Day < 0 || d.Day > 31 || d.Month == 0 && d.Day != 0 {
			return Attributes{}, ErrInvalidFields
		}
		if d.Day != 0 {
			actual := time.Date(d.Year, time.Month(d.Month), d.Day, 0, 0, 0, 0, time.UTC)
			if actual.Year() != d.Year || int(actual.Month()) != d.Month || actual.Day() != d.Day {
				return Attributes{}, ErrInvalidFields
			}
		}
		a.Manufactured = &d
	}
	for _, pointer := range []**Money{&a.AskingPrice, &a.AcquisitionCost} {
		if *pointer == nil {
			continue
		}
		money := **pointer
		if money.MinorUnits < 0 || money.MinorUnits > 9007199254740991 || len(money.Currency) != 3 {
			return Attributes{}, ErrInvalidFields
		}
		for _, character := range money.Currency {
			if character < 'A' || character > 'Z' {
				return Attributes{}, ErrInvalidFields
			}
		}
		*pointer = &money
	}
	return a, nil
}

func (a Attributes) DisplayTitle() string {
	if a.Title != "" {
		return a.Title
	}
	if facts := strings.TrimSpace(strings.Join([]string{a.Make, a.Model}, " ")); facts != "" {
		return facts
	}
	return a.StockNumber
}

func NewDraft(id, dealerID, stockNumber string, now time.Time) (Record, error) {
	if !utf8.ValidString(id) || !utf8.ValidString(dealerID) || strings.TrimSpace(id) == "" || strings.TrimSpace(dealerID) == "" || now.IsZero() {
		return Record{}, ErrInvalidFields
	}
	a, err := ValidateAttributes(Attributes{StockNumber: stockNumber})
	if err != nil || a.StockNumber == "" {
		return Record{}, ErrInvalidFields
	}
	return Record{ID: id, DealerID: dealerID, Revision: 1, Status: Draft, Attributes: a, CreatedAt: now, UpdatedAt: now}, nil
}
