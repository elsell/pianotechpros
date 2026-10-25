package technician

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

var instant = time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)

func profile() Attributes {
	return Attributes{Name: "Alex", Email: "alex@example.test", Origin: Origin{Label: "Workshop", Street1: "123 Test Street", City: "Boston", Region: "MA", PostalCode: "02110", Timezone: "UTC"}, RadiusMiles: 25}
}
func TestProfileNormalizesCopiesAndRetainsOptionalBusinessFields(t *testing.T) {
	a := profile()
	a.Name = " Alex "
	a.Biography = "First line\nSecond line"
	a.Services = []string{"repair", "tuning"}
	a.Forms = []string{"upright", "grand"}
	a.Availability = []WeeklyRule{rule()}
	limit := 60
	a.DrivingMinutes = &limit
	got, err := New("profile", "owner", a, zones, instant)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Alex" || got.BusinessName != "" || got.Phone != "" || got.Revision != 1 || !got.CreatedAt.Equal(instant) || !got.UpdatedAt.Equal(instant) || !reflect.DeepEqual(got.Services, []string{"repair", "tuning"}) || !reflect.DeepEqual(got.Forms, []string{"grand", "upright"}) {
		t.Fatalf("unexpected profile: %+v", got)
	}
	a.Services[0] = "other"
	a.Forms[0] = "other"
	a.Availability[0].Start = "10:00"
	limit = 90
	if got.Services[0] != "repair" || got.Forms[1] != "upright" || got.Availability[0].Start != "09:00" || *got.DrivingMinutes != 60 {
		t.Fatal("caller aliases aggregate")
	}
}
func TestProfileRejectsInvalidAttributes(t *testing.T) {
	cases := map[string]func(*Attributes){
		"empty name": func(a *Attributes) { a.Name = " " }, "long name": func(a *Attributes) { a.Name = strings.Repeat("é", 201) }, "bad UTF8": func(a *Attributes) { a.Name = string([]byte{255}) }, "control": func(a *Attributes) { a.Name = "Alex\n" },
		"display mailbox": func(a *Attributes) { a.Email = "Alex <alex@example.test>" }, "invalid email": func(a *Attributes) { a.Email = "alex" }, "long phone": func(a *Attributes) { a.Phone = strings.Repeat("1", 33) }, "long business": func(a *Attributes) { a.BusinessName = strings.Repeat("x", 201) }, "long bio": func(a *Attributes) { a.Biography = strings.Repeat("x", 2001) }, "bio control": func(a *Attributes) { a.Biography = "x\x00" },
		"missing label": func(a *Attributes) { a.Origin.Label = "" }, "missing street": func(a *Attributes) { a.Origin.Street1 = "" }, "missing city": func(a *Attributes) { a.Origin.City = "" }, "missing region": func(a *Attributes) { a.Origin.Region = "" }, "short postal": func(a *Attributes) { a.Origin.PostalCode = "12" }, "unknown zone": func(a *Attributes) { a.Origin.Timezone = "Local" },
		"zero radius": func(a *Attributes) { a.RadiusMiles = 0 }, "large radius": func(a *Attributes) { a.RadiusMiles = 501 }, "zero driving": func(a *Attributes) { v := 0; a.DrivingMinutes = &v }, "large driving": func(a *Attributes) { v := 1441; a.DrivingMinutes = &v },
		"unknown service": func(a *Attributes) { a.Services = []string{"moving"} }, "duplicate service": func(a *Attributes) { a.Services = []string{"tuning", "tuning"} }, "unknown form": func(a *Attributes) { a.Forms = []string{"full_size_upright"} }, "duplicate form": func(a *Attributes) { a.Forms = []string{"grand", "grand"} }, "bad availability": func(a *Attributes) { r := rule(); r.End = "08:00"; a.Availability = []WeeklyRule{r} },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			a := profile()
			mutate(&a)
			if _, err := New("profile", "owner", a, zones, instant); !errors.Is(err, ErrInvalidFields) {
				t.Fatalf("expected invalid fields: %v", err)
			}
		})
	}
}
func TestSearchableRequiresWorkAndAvailabilityOrExplicitRequests(t *testing.T) {
	a := profile()
	a.Searchable = true
	if _, err := New("profile", "owner", a, zones, instant); err == nil {
		t.Fatal("accepted empty work")
	}
	a.Services = []string{"tuning"}
	a.Forms = []string{"grand"}
	if _, err := New("profile", "owner", a, zones, instant); err == nil {
		t.Fatal("accepted absent availability")
	}
	r := rule()
	r.Kind = "unavailable"
	a.Availability = []WeeklyRule{r}
	if _, err := New("profile", "owner", a, zones, instant); err != nil {
		t.Fatalf("legacy accepts any weekly rule: %v", err)
	}
	a.Availability = nil
	a.AcceptsRequestsWithoutAvailability = true
	if _, err := New("profile", "owner", a, zones, instant); err != nil {
		t.Fatal(err)
	}
	a.Services = nil
	if _, err := New("profile", "owner", a, zones, instant); err == nil {
		t.Fatal("request preference bypasses service requirement")
	}
}
func TestProfileRevisionAndRestore(t *testing.T) {
	a := profile()
	a.Services = []string{"tuning", "repair"}
	a.Forms = []string{"grand", "upright"}
	initial, err := New("profile", "owner", a, zones, instant)
	if err != nil {
		t.Fatal(err)
	}
	a.Services = []string{"repair", "tuning"}
	a.Forms = []string{"upright", "grand"}
	unchanged, changed, err := Revise(initial, 1, a, zones, instant.Add(time.Hour))
	if err != nil || changed || !reflect.DeepEqual(initial, unchanged) {
		t.Fatal("set reordering changed revision")
	}
	if _, _, err := Revise(initial, 2, a, zones, instant); !errors.Is(err, ErrRevisionConflict) {
		t.Fatal("accepted stale no-op")
	}
	if _, _, err := Revise(initial, 1, a, zones, instant.Add(-time.Second)); err == nil {
		t.Fatal("accepted clock regression")
	}
	a.Name = "Updated"
	updated, changed, err := Revise(initial, 1, a, zones, instant.Add(time.Hour))
	if err != nil || !changed || updated.Revision != 2 || updated.ID != initial.ID || updated.OwnerUserID != initial.OwnerUserID || updated.CreatedAt != initial.CreatedAt {
		t.Fatalf("invalid update %+v %v", updated, err)
	}
	restored, err := Restore(updated.ID, updated.OwnerUserID, updated.Attributes, updated.Revision, updated.CreatedAt, updated.UpdatedAt, zones)
	if err != nil || !reflect.DeepEqual(restored, updated) {
		t.Fatalf("restore drift: %v", err)
	}
	updated.Revision = MaxRevision
	a.Name = "Exhausted"
	if _, _, err := Revise(updated, MaxRevision, a, zones, instant.Add(2*time.Hour)); err == nil {
		t.Fatal("revision overflow")
	}
	for _, rev := range []int64{0, -1, MaxRevision + 1} {
		if _, err := Restore(initial.ID, initial.OwnerUserID, initial.Attributes, rev, instant, instant, zones); err == nil {
			t.Fatal("invalid restored revision")
		}
	}
	if _, err := Restore(initial.ID, initial.OwnerUserID, initial.Attributes, 1, instant, instant.Add(-time.Second), zones); err == nil {
		t.Fatal("invalid restored times")
	}
}
func TestProfileIdentityClockCatalogAndLimits(t *testing.T) {
	for _, ids := range [][2]string{{"", "owner"}, {"profile", ""}, {"../profile", "owner"}} {
		if _, err := New(ID(ids[0]), ids[1], profile(), zones, instant); err == nil {
			t.Fatal("invalid identity")
		}
	}
	if _, err := New("profile", "owner", profile(), zones, time.Time{}); err == nil {
		t.Fatal("zero clock")
	}
	if _, err := New("profile", "owner", profile(), nil, instant); err == nil {
		t.Fatal("nil catalog")
	}
	a := profile()
	a.Name = strings.Repeat("é", 200)
	a.RadiusMiles = 500
	limit := 1440
	a.DrivingMinutes = &limit
	a.Services = []string{"tuning", "voicing", "regulation", "repair", "other"}
	a.Forms = []string{"spinet", "console", "studio_upright", "upright", "grand", "other"}
	if _, err := New("profile", "owner", a, zones, instant); err != nil {
		t.Fatal(err)
	}
}

func TestRevisionRejectsCorruptCurrentState(t *testing.T) {
	initial, err := New("profile", "owner", profile(), zones, instant)
	if err != nil {
		t.Fatal(err)
	}
	corrupt := initial
	corrupt.Email = "not-mail"
	if _, _, err := Revise(corrupt, 1, profile(), zones, instant); err == nil {
		t.Fatal("accepted corrupt current state")
	}
	corrupt = initial
	corrupt.UpdatedAt = instant.Add(time.Nanosecond)
	if _, _, err := Revise(corrupt, 1, profile(), zones, instant.Add(time.Hour)); err == nil {
		t.Fatal("accepted unpersistable precision")
	}
}
func TestProfileNoopAndRestoreOwnTheirCopies(t *testing.T) {
	a := profile()
	a.Services = []string{"tuning"}
	a.Forms = []string{"grand"}
	a.Availability = []WeeklyRule{rule()}
	v := 30
	a.DrivingMinutes = &v
	first, err := New("profile", "owner", a, zones, instant)
	if err != nil {
		t.Fatal(err)
	}
	noOp, changed, err := Revise(first, 1, first.Attributes, zones, instant)
	if err != nil || changed {
		t.Fatal(err)
	}
	noOp.Services[0] = "repair"
	noOp.Forms[0] = "other"
	noOp.Availability[0].End = "15:00"
	*noOp.DrivingMinutes = 90
	if first.Services[0] != "tuning" || first.Forms[0] != "grand" || first.Availability[0].End != "17:00" || *first.DrivingMinutes != 30 {
		t.Fatal("no-op aliases current state")
	}
	restored, err := Restore(first.ID, first.OwnerUserID, first.Attributes, 1, first.CreatedAt, first.UpdatedAt, zones)
	if err != nil {
		t.Fatal(err)
	}
	restored.Services[0] = "repair"
	restored.Forms[0] = "other"
	restored.Availability[0].End = "15:00"
	*restored.DrivingMinutes = 90
	if first.Services[0] != "tuning" || first.Forms[0] != "grand" || first.Availability[0].End != "17:00" || *first.DrivingMinutes != 30 {
		t.Fatal("restore aliases current state")
	}
	a = first.Attributes
	a.Origin.Timezone = "America/New_York"
	a.Availability = []WeeklyRule{rule()}
	a.Availability[0].Timezone = "UTC"
	moved, _, err := Revise(first, 1, a, zones, instant.Add(time.Hour))
	if err != nil || moved.Availability[0].Timezone != "UTC" {
		t.Fatal("origin change rewrote weekly timezone")
	}
}
