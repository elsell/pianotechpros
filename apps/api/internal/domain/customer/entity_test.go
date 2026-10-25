package customer

import (
	"errors"
	"strings"
	"testing"
	"time"
)

type zoneSet map[string]bool

func (z zoneSet) Contains(s string) bool { return z[s] }

var zones = zoneSet{"UTC": true, "America/New_York": true}
var instant = time.Date(2026, 10, 25, 12, 0, 0, 123456789, time.FixedZone("test", 3600))

func validAttributes() Attributes {
	year := 1990
	return Attributes{Name: " Customer ", Email: "customer@example.com", Locations: []Location{{Key: "home", Label: "Home", Street1: "1 Example Street", City: "Example", Region: "NY", PostalCode: "10001", Timezone: "America/New_York"}}, Pianos: []Piano{{Key: "piano", LocationKey: "home", Nickname: "Family piano", Form: "grand", ManufacturedYear: &year}}}
}
func TestProfileCopiesAndNormalizesOwnedRecords(t *testing.T) {
	input := validAttributes()
	got, err := New("profile", "owner", input, zones, instant)
	if err != nil {
		t.Fatal(err)
	}
	input.Locations[0].City = "changed"
	*input.Pianos[0].ManufacturedYear = 2000
	if got.Name != "Customer" || got.Locations[0].City != "Example" || *got.Pianos[0].ManufacturedYear != 1990 || got.Revision != 1 || got.CreatedAt.Location() != time.UTC || got.CreatedAt.Nanosecond() != 123456000 {
		t.Fatalf("invalid aggregate: %+v", got)
	}
}
func TestProfileRejectsInvalidFields(t *testing.T) {
	cases := map[string]func(*Attributes){
		"business":           func(a *Attributes) { a.IsBusiness = true },
		"display name email": func(a *Attributes) { a.Email = "User <user@example.com>" },
		"oversized unicode":  func(a *Attributes) { a.Name = strings.Repeat("é", 201) },
		"control":            func(a *Attributes) { a.Name = "bad\x00name" },
		"invalid utf8":       func(a *Attributes) { a.Name = string([]byte{255}) },
		"no locations":       func(a *Attributes) { a.Locations = nil },
		"many locations":     func(a *Attributes) { a.Locations = make([]Location, 51) },
		"duplicate location": func(a *Attributes) { a.Locations = append(a.Locations, a.Locations[0]) },
		"trimmed key":        func(a *Attributes) { a.Locations[0].Key = " home" },
		"local zone":         func(a *Attributes) { a.Locations[0].Timezone = "Local" },
		"unknown zone":       func(a *Attributes) { a.Locations[0].Timezone = "America/Unknown" },
		"traversal":          func(a *Attributes) { a.Locations[0].Timezone = "../UTC" },
		"short postal":       func(a *Attributes) { a.Locations[0].PostalCode = "1" },
		"foreign location":   func(a *Attributes) { a.Pianos[0].LocationKey = "elsewhere" },
		"duplicate piano":    func(a *Attributes) { a.Pianos = append(a.Pianos, a.Pianos[0]) },
		"many pianos":        func(a *Attributes) { a.Pianos = make([]Piano, 201) },
		"unknown form":       func(a *Attributes) { a.Pianos[0].Form = "electric" },
		"year":               func(a *Attributes) { *a.Pianos[0].ManufacturedYear = 1699 },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			a := validAttributes()
			change(&a)
			if _, err := New("profile", "owner", a, zones, instant); !errors.Is(err, ErrInvalidFields) {
				t.Fatalf("got %v", err)
			}
		})
	}
}
func TestProfileRevisionConflictsAndNoOps(t *testing.T) {
	original, err := New("profile", "owner", validAttributes(), zones, instant)
	if err != nil {
		t.Fatal(err)
	}
	same, changed, err := Revise(original, 1, validAttributes(), zones, instant.Add(time.Hour))
	if err != nil || changed || same.Revision != 1 || !same.UpdatedAt.Equal(original.UpdatedAt) {
		t.Fatalf("no-op changed state: %+v %v", same, err)
	}
	a := validAttributes()
	a.Name = "Updated"
	next, changed, err := Revise(original, 1, a, zones, instant.Add(time.Hour))
	if err != nil || !changed || next.Revision != 2 || next.ID != original.ID || next.OwnerUserID != original.OwnerUserID || !next.CreatedAt.Equal(original.CreatedAt) {
		t.Fatalf("revision: %+v %v", next, err)
	}
	if _, _, err = Revise(next, 1, a, zones, instant.Add(2*time.Hour)); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("stale: %v", err)
	}
	if _, _, err = Revise(original, 1, a, zones, instant.Add(-time.Hour)); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("backwards time: %v", err)
	}
	same.Locations[0].City = "mutated"
	*same.Pianos[0].ManufacturedYear = 2001
	if original.Locations[0].City != "Example" || *original.Pianos[0].ManufacturedYear != 1990 {
		t.Fatal("revision aliases previous aggregate")
	}
}

func TestProfileAcceptsBoundariesAndOptionalFields(t *testing.T) {
	a := validAttributes()
	a.Name = strings.Repeat("é", 200)
	a.Pianos[0].ManufacturedYear = nil
	a.Locations[0].Notes = "First line\nSecond\tline"
	a.Pianos[0].Form = "full_size_upright"
	a.IsBusiness = true
	a.BusinessName = " Studio "
	got, err := New("profile", "owner", a, zones, instant)
	if err != nil || got.BusinessName != "Studio" || got.Pianos[0].ManufacturedYear != nil {
		t.Fatalf("optional fields: %+v %v", got, err)
	}
	for _, year := range []int{1700, 2100} {
		a.Pianos[0].ManufacturedYear = &year
		if _, err := New("profile", "owner", a, zones, instant); err != nil {
			t.Fatal(err)
		}
	}
	a.Pianos = nil
	if _, err := New("profile", "owner", a, zones, instant); err != nil {
		t.Fatal(err)
	}
}
func TestProfileRequiresTrustedIdentityClockAndCatalog(t *testing.T) {
	for _, id := range []string{"", " x", "other/profile"} {
		if _, err := New(ID(id), "owner", validAttributes(), zones, instant); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("id %q: %v", id, err)
		}
	}
	if _, err := New("profile", "", validAttributes(), zones, instant); !errors.Is(err, ErrInvalidFields) {
		t.Fatal(err)
	}
	if _, err := New("profile", "owner", validAttributes(), zones, time.Time{}); !errors.Is(err, ErrInvalidFields) {
		t.Fatal(err)
	}
	if _, err := New("profile", "owner", validAttributes(), nil, instant); !errors.Is(err, ErrInvalidFields) {
		t.Fatal(err)
	}
	for _, zone := range []string{"Local", "../UTC", "America/../UTC", "/UTC", "UTC/", "+01:00", "America//New_York"} {
		a := validAttributes()
		a.Locations[0].Timezone = zone
		if _, err := New("profile", "owner", a, zoneSet{zone: true}, instant); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("unsafe zone %q: %v", zone, err)
		}
	}
}
func TestProfileRevisionCannotOverflow(t *testing.T) {
	e, err := New("profile", "owner", validAttributes(), zones, instant)
	if err != nil {
		t.Fatal(err)
	}
	e.Revision = MaxRevision
	if _, changed, err := Revise(e, MaxRevision, validAttributes(), zones, instant); err != nil || changed {
		t.Fatalf("max no-op: %v", err)
	}
	a := validAttributes()
	a.Name = "changed"
	if _, _, err := Revise(e, MaxRevision, a, zones, instant); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("overflow: %v", err)
	}
}

func TestRestoreRejectsCorruptMetadataAndPreservesAcceptedState(t *testing.T) {
	created := instant.UTC().Truncate(time.Microsecond)
	updated := created.Add(time.Hour)
	input := validAttributes()
	got, err := Restore("profile", "owner", input, 7, created, updated, zones)
	if err != nil || got.Revision != 7 || !got.CreatedAt.Equal(created) || !got.UpdatedAt.Equal(updated) {
		t.Fatalf("restore: %+v %v", got, err)
	}
	input.Locations[0].City = "changed"
	*input.Pianos[0].ManufacturedYear = 2000
	if got.Locations[0].City != "Example" || *got.Pianos[0].ManufacturedYear != 1990 {
		t.Fatal("restore aliases input")
	}
	for _, revision := range []int64{0, -1, MaxRevision + 1} {
		if _, err := Restore("profile", "owner", validAttributes(), revision, created, updated, zones); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("revision %d: %v", revision, err)
		}
	}
	for _, times := range [][2]time.Time{{{}, updated}, {created, {}}, {updated, created}, {created.Add(time.Nanosecond), updated}, {created, updated.Add(time.Nanosecond)}} {
		if _, err := Restore("profile", "owner", validAttributes(), 1, times[0], times[1], zones); !errors.Is(err, ErrInvalidFields) {
			t.Fatalf("corrupt timestamps: %v", err)
		}
	}
	input = validAttributes()
	input.Pianos[0].LocationKey = "foreign"
	if _, err := Restore("profile", "owner", input, 1, created, updated, zones); !errors.Is(err, ErrInvalidFields) {
		t.Fatalf("corrupt references: %v", err)
	}
}
