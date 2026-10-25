package customer

import (
	"net/mail"
	"reflect"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type ID string

const MaxRevision int64 = 1<<53 - 1

type TimezoneCatalog interface{ Contains(string) bool }
type Location struct {
	Key, Label, Street1, Street2, City, Region, PostalCode, Timezone, Notes string
}
type Piano struct {
	Key, LocationKey, Nickname, Form, Make, Model, Serial, Notes string
	ManufacturedYear                                             *int
	Player                                                       bool
}
type Attributes struct {
	Name                       string
	IsBusiness                 bool
	BusinessName, Email, Phone string
	Locations                  []Location
	Pianos                     []Piano
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

// Revise retains aggregate identity and rejects stale writes, including stale no-ops.
func Revise(current Entity, expected int64, attributes Attributes, zones TimezoneCatalog, now time.Time) (Entity, bool, error) {
	if current.Revision < 1 || current.Revision > MaxRevision || current.CreatedAt.IsZero() || current.UpdatedAt.Before(current.CreatedAt) || !key(string(current.ID), 128) || !key(current.OwnerUserID, 128) || now.IsZero() {
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
	if zones == nil || len(a.Locations) < 1 || len(a.Locations) > 50 || len(a.Pianos) > 200 {
		return Attributes{}, ErrInvalidFields
	}
	if !text(&a.Name, 1, 200, false) || !text(&a.BusinessName, 0, 200, false) || (a.IsBusiness && a.BusinessName == "") || !text(&a.Email, 1, 320, false) || !text(&a.Phone, 0, 32, false) {
		return Attributes{}, ErrInvalidFields
	}
	address, err := mail.ParseAddress(a.Email)
	if err != nil || address.Address != a.Email || address.Name != "" {
		return Attributes{}, ErrInvalidFields
	}
	a.Locations = append([]Location(nil), a.Locations...)
	a.Pianos = append([]Piano(nil), a.Pianos...)
	locations := map[string]bool{}
	for i := range a.Locations {
		l := &a.Locations[i]
		if !key(l.Key, 50) || locations[l.Key] || !text(&l.Label, 1, 100, false) || !text(&l.Street1, 1, 200, false) || !text(&l.Street2, 0, 200, false) || !text(&l.City, 1, 100, false) || !text(&l.Region, 1, 64, false) || !text(&l.PostalCode, 3, 20, false) || !text(&l.Timezone, 1, 64, false) || !zoneName(l.Timezone) || !zones.Contains(l.Timezone) || !text(&l.Notes, 0, 2000, true) {
			return Attributes{}, ErrInvalidFields
		}
		locations[l.Key] = true
	}
	pianos := map[string]bool{}
	for i := range a.Pianos {
		p := &a.Pianos[i]
		if !key(p.Key, 50) || pianos[p.Key] || !locations[p.LocationKey] || !text(&p.Nickname, 1, 100, false) || !text(&p.Make, 0, 100, false) || !text(&p.Model, 0, 100, false) || !text(&p.Serial, 0, 100, false) || !text(&p.Notes, 0, 2000, true) {
			return Attributes{}, ErrInvalidFields
		}
		switch p.Form {
		case "grand", "full_size_upright", "studio_upright", "console", "spinet", "other":
		default:
			return Attributes{}, ErrInvalidFields
		}
		if p.ManufacturedYear != nil {
			year := *p.ManufacturedYear
			if year < 1700 || year > 2100 {
				return Attributes{}, ErrInvalidFields
			}
			p.ManufacturedYear = &year
		}
		pianos[p.Key] = true
	}
	return a, nil
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
func zoneName(s string) bool {
	if s == "UTC" {
		return true
	}
	if !strings.Contains(s, "/") {
		return false
	}
	for _, part := range strings.Split(s, "/") {
		if part == "" {
			return false
		}
		for _, c := range part {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-' || c == '+') {
				return false
			}
		}
	}
	return true
}
