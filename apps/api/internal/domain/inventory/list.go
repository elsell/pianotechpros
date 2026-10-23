package inventory

import (
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type ListQuery struct {
	Search          string
	Status          Status
	IncludeInactive bool
	Limit           int
	Snapshot        time.Time
	AfterFeatured   bool
	AfterCreated    time.Time
	AfterID         string
}
type Page struct {
	Records []Record
	HasMore bool
}

func ValidateListQuery(q ListQuery) (ListQuery, error) {
	if !utf8.ValidString(q.Search) || strings.IndexFunc(q.Search, unicode.IsControl) >= 0 {
		return ListQuery{}, ErrInvalidFields
	}
	q.Search = strings.TrimSpace(q.Search)
	if utf8.RuneCountInString(q.Search) > 120 || q.Limit < 1 || q.Limit > 100 || q.Snapshot.IsZero() {
		return ListQuery{}, ErrInvalidFields
	}
	switch q.Status {
	case "", Draft, Available, Reserved, InService, Sold, Archived:
	default:
		return ListQuery{}, ErrInvalidFields
	}
	if q.AfterID == "" {
		if !q.AfterCreated.IsZero() || q.AfterFeatured {
			return ListQuery{}, ErrInvalidFields
		}
	} else if strings.TrimSpace(q.AfterID) != q.AfterID || len(q.AfterID) > 128 || !utf8.ValidString(q.AfterID) || strings.IndexFunc(q.AfterID, unicode.IsControl) >= 0 || q.AfterCreated.IsZero() || q.AfterCreated.After(q.Snapshot) {
		return ListQuery{}, ErrInvalidFields
	}
	return q, nil
}
