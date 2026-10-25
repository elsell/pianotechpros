package technician

import (
	"reflect"
	"testing"
)

type testZones map[string]bool

func (z testZones) Contains(name string) bool { return z[name] }

var zones = testZones{"UTC": true, "America/New_York": true}

func rule() WeeklyRule {
	return WeeklyRule{Key: "monday", Kind: "available", Recurrence: "weekly", Weekday: 0, Start: "09:00", End: "17:00", Timezone: "America/New_York"}
}

func TestAvailabilityRetainsLocalTimeAndCanonicalizesDaysWithoutAliasing(t *testing.T) {
	monday := rule()
	friday := rule()
	friday.Key = "friday"
	friday.Weekday = 4
	friday.Kind = "unavailable"
	friday.EffectiveStart = "2028-02-29"
	input := []WeeklyRule{friday, monday}
	got, err := NormalizeAvailability(input, zones)
	if err != nil || !reflect.DeepEqual(got, []WeeklyRule{monday, friday}) {
		t.Fatalf("normalized rules=%+v err=%v", got, err)
	}
	input[1].Start = "10:00"
	if got[0].Start != "09:00" {
		t.Fatal("input aliases result")
	}
	got[1].Timezone = "UTC"
	if input[0].Timezone != "America/New_York" {
		t.Fatal("result aliases input")
	}
}
func TestAvailabilityRejectsInvalidRules(t *testing.T) {
	cases := map[string]func(*WeeklyRule){
		"empty key": func(r *WeeklyRule) { r.Key = "" }, "unsafe key": func(r *WeeklyRule) { r.Key = "../x" },
		"unknown kind": func(r *WeeklyRule) { r.Kind = "booked" }, "unknown recurrence": func(r *WeeklyRule) { r.Recurrence = "daily" },
		"negative day": func(r *WeeklyRule) { r.Weekday = -1 }, "eighth day": func(r *WeeklyRule) { r.Weekday = 7 },
		"equal times": func(r *WeeklyRule) { r.End = r.Start }, "overnight": func(r *WeeklyRule) { r.End = "08:00" },
		"midnight end": func(r *WeeklyRule) { r.End = "24:00" }, "seconds": func(r *WeeklyRule) { r.Start = "09:00:00" },
		"short time": func(r *WeeklyRule) { r.Start = "9:00" }, "invalid minute": func(r *WeeklyRule) { r.Start = "09:60" },
		"local zone": func(r *WeeklyRule) { r.Timezone = "Local" }, "unknown zone": func(r *WeeklyRule) { r.Timezone = "Mars/Olympus" },
		"nonleap date": func(r *WeeklyRule) { r.EffectiveStart = "2026-02-29" }, "year zero": func(r *WeeklyRule) { r.EffectiveStart = "0000-01-01" },
		"short date": func(r *WeeklyRule) { r.EffectiveStart = "2026-1-01" }, "reversed dates": func(r *WeeklyRule) { r.EffectiveStart = "2026-02-01"; r.EffectiveEnd = "2026-01-31" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			r := rule()
			mutate(&r)
			if _, err := NormalizeAvailability([]WeeklyRule{r}, zones); err == nil {
				t.Fatal("accepted invalid rule")
			}
		})
	}
}
func TestAvailabilityRejectsDuplicateKeysDaysAndMissingCatalog(t *testing.T) {
	first := rule()
	second := rule()
	second.Key = "second"
	if _, err := NormalizeAvailability([]WeeklyRule{first, second}, zones); err == nil {
		t.Fatal("accepted duplicate weekday")
	}
	second = first
	second.Weekday = 1
	if _, err := NormalizeAvailability([]WeeklyRule{first, second}, zones); err == nil {
		t.Fatal("accepted duplicate key")
	}
	if _, err := NormalizeAvailability([]WeeklyRule{first}, nil); err == nil {
		t.Fatal("accepted missing catalog")
	}
	if _, err := NormalizeAvailability(make([]WeeklyRule, 8), zones); err == nil {
		t.Fatal("accepted excess rules")
	}
}
func TestAvailabilityAllowsInclusiveOrOneSidedDatesAndEmptyRules(t *testing.T) {
	for _, bounds := range [][2]string{{"2028-02-29", "2028-02-29"}, {"2028-02-29", ""}, {"", "2028-02-29"}} {
		r := rule()
		r.EffectiveStart = bounds[0]
		r.EffectiveEnd = bounds[1]
		if _, err := NormalizeAvailability([]WeeklyRule{r}, zones); err != nil {
			t.Fatal(err)
		}
	}
	a, err := NormalizeAvailability(nil, zones)
	if err != nil {
		t.Fatal(err)
	}
	b, err := NormalizeAvailability([]WeeklyRule{}, zones)
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("empty representations differ")
	}
}
