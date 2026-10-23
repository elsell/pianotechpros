package showroom

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

var ErrInvalidQuery = errors.New("invalid_showroom_query")

// Query filters only published values. Continuation is an internal repository
// tuple; transport adapters must authenticate its binding to the filters.
type Query struct {
	Search             string
	Form               inventory.Form
	Availability       string
	Currency           string
	MinPrice, MaxPrice *int64
	Limit              int
	AfterFeatured      bool
	AfterID            string
}

func ValidateQuery(q Query) (Query, error) {
	invalid := func() (Query, error) { return Query{}, ErrInvalidQuery }
	if q.Limit < 1 || q.Limit > 100 || !utf8.ValidString(q.Search) || strings.IndexFunc(q.Search, unicode.IsControl) >= 0 {
		return invalid()
	}
	q.Search = strings.TrimSpace(q.Search)
	if utf8.RuneCountInString(q.Search) > 120 {
		return invalid()
	}
	switch q.Form {
	case "", inventory.Grand, inventory.FullSizeUpright, inventory.StudioUpright, inventory.Console, inventory.Spinet:
	default:
		return invalid()
	}
	switch q.Availability {
	case "", "all", "available", "reserved", "sold":
	default:
		return invalid()
	}
	if q.Currency != "" {
		if len(q.Currency) != 3 {
			return invalid()
		}
		for _, c := range q.Currency {
			if c < 'A' || c > 'Z' {
				return invalid()
			}
		}
	}
	for _, bound := range []*int64{q.MinPrice, q.MaxPrice} {
		if bound != nil && (q.Currency == "" || *bound < 0 || *bound > 9007199254740991) {
			return invalid()
		}
	}
	if q.MinPrice != nil && q.MaxPrice != nil && *q.MinPrice > *q.MaxPrice {
		return invalid()
	}
	if !utf8.ValidString(q.AfterID) || len(q.AfterID) > 128 || strings.TrimSpace(q.AfterID) != q.AfterID || strings.IndexFunc(q.AfterID, unicode.IsControl) >= 0 || (q.AfterID == "" && q.AfterFeatured) {
		return invalid()
	}
	if q.MinPrice != nil {
		value := *q.MinPrice
		q.MinPrice = &value
	}
	if q.MaxPrice != nil {
		value := *q.MaxPrice
		q.MaxPrice = &value
	}
	return q, nil
}
