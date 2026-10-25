package technician

import (
	"net/mail"
	"reflect"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type ID string

const MaxRevision int64 = 1<<53 - 1

type Origin struct{ Label, Street1, Street2, City, Region, PostalCode, Timezone string }
type Attributes struct {
	Name, BusinessName, Email, Phone, Biography    string
	Searchable, AcceptsRequestsWithoutAvailability bool
	Origin                                         Origin
	RadiusMiles                                    int
	DrivingMinutes                                 *int
	Services, Forms                                []string
	Availability                                   []WeeklyRule
}
type Entity struct {
	ID          ID
	OwnerUserID string
	Attributes
	Revision             int64
	CreatedAt, UpdatedAt time.Time
}

func New(id ID, owner string, attributes Attributes, zones TimezoneCatalog, now time.Time) (Entity, error) {
	if !key(string(id), 128) || !key(owner, 128) || now.IsZero() {
		return Entity{}, ErrInvalidFields
	}
	attrs, err := normalize(attributes, zones)
	if err != nil {
		return Entity{}, err
	}
	now = now.UTC().Truncate(time.Microsecond)
	return Entity{ID: id, OwnerUserID: owner, Attributes: attrs, Revision: 1, CreatedAt: now, UpdatedAt: now}, nil
}

// Restore validates stored state without advancing its revision or clock.
func Restore(id ID, owner string, attributes Attributes, revision int64, created, updated time.Time, zones TimezoneCatalog) (Entity, error) {
	if revision < 1 || revision > MaxRevision || created.IsZero() || updated.IsZero() || updated.Before(created) || created.Nanosecond()%1000 != 0 || updated.Nanosecond()%1000 != 0 {
		return Entity{}, ErrInvalidFields
	}
	entity, err := New(id, owner, attributes, zones, created)
	if err != nil {
		return Entity{}, err
	}
	entity.Revision = revision
	entity.UpdatedAt = updated.UTC()
	return entity, nil
}

// Revise retains aggregate identity and rejects stale writes, including stale no-ops.
func Revise(current Entity, expected int64, attributes Attributes, zones TimezoneCatalog, now time.Time) (Entity, bool, error) {
	if _, err := Restore(current.ID, current.OwnerUserID, current.Attributes, current.Revision, current.CreatedAt, current.UpdatedAt, zones); err != nil || now.IsZero() {
		return Entity{}, false, ErrInvalidFields
	}
	if expected != current.Revision {
		return Entity{}, false, ErrRevisionConflict
	}
	now = now.UTC().Truncate(time.Microsecond)
	if now.Before(current.UpdatedAt) {
		return Entity{}, false, ErrInvalidFields
	}
	attrs, err := normalize(attributes, zones)
	if err != nil {
		return Entity{}, false, err
	}
	if reflect.DeepEqual(current.Attributes, attrs) {
		current.Attributes = attrs
		return current, false, nil
	}
	if current.Revision == MaxRevision {
		return Entity{}, false, ErrInvalidFields
	}
	current.Attributes = attrs
	current.Revision++
	current.UpdatedAt = now
	return current, true, nil
}

func normalize(a Attributes, zones TimezoneCatalog) (Attributes, error) {
	if zones == nil || !text(&a.Name, 1, 200, false) || !text(&a.BusinessName, 0, 200, false) || !text(&a.Email, 1, 320, false) || !text(&a.Phone, 0, 32, false) || !text(&a.Biography, 0, 2000, true) {
		return Attributes{}, ErrInvalidFields
	}
	address, err := mail.ParseAddress(a.Email)
	if err != nil || address.Address != a.Email || address.Name != "" {
		return Attributes{}, ErrInvalidFields
	}
	o := &a.Origin
	if !text(&o.Label, 1, 100, false) || !text(&o.Street1, 1, 200, false) || !text(&o.Street2, 0, 200, false) || !text(&o.City, 1, 100, false) || !text(&o.Region, 1, 64, false) || !text(&o.PostalCode, 3, 20, false) || !text(&o.Timezone, 1, 64, false) || !timezoneName(o.Timezone) || !zones.Contains(o.Timezone) || a.RadiusMiles < 1 || a.RadiusMiles > 500 {
		return Attributes{}, ErrInvalidFields
	}
	if a.DrivingMinutes != nil {
		minutes := *a.DrivingMinutes
		if minutes < 1 || minutes > 1440 {
			return Attributes{}, ErrInvalidFields
		}
		a.DrivingMinutes = &minutes
	}
	a.Services, err = selection(a.Services, []string{"tuning", "voicing", "regulation", "repair", "other"})
	if err != nil {
		return Attributes{}, err
	}
	a.Forms, err = selection(a.Forms, []string{"spinet", "console", "studio_upright", "upright", "grand", "other"})
	if err != nil {
		return Attributes{}, err
	}
	a.Availability, err = NormalizeAvailability(a.Availability, zones)
	if err != nil {
		return Attributes{}, err
	}
	if a.Searchable && (len(a.Services) == 0 || len(a.Forms) == 0 || (len(a.Availability) == 0 && !a.AcceptsRequestsWithoutAvailability)) {
		return Attributes{}, ErrInvalidFields
	}
	return a, nil
}
func selection(input, allowed []string) ([]string, error) {
	if len(input) > len(allowed) {
		return nil, ErrInvalidFields
	}
	seen := map[string]bool{}
	for _, value := range input {
		found := false
		for _, candidate := range allowed {
			if candidate == value {
				found = true
				break
			}
		}
		if !found || seen[value] {
			return nil, ErrInvalidFields
		}
		seen[value] = true
	}
	result := append([]string(nil), input...)
	sort.Strings(result)
	return result, nil
}
func key(s string, max int) bool {
	if len(s) < 1 || len(s) > max {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}
func text(s *string, min, max int, multiline bool) bool {
	if !utf8.ValidString(*s) {
		return false
	}
	// Reject controls even at the edges, before whitespace normalization.
	for _, r := range *s {
		if unicode.IsControl(r) && !(multiline && (r == '\n' || r == '\r' || r == '\t')) {
			return false
		}
	}
	*s = strings.TrimSpace(*s)
	n := utf8.RuneCountInString(*s)
	return n >= min && n <= max
}
