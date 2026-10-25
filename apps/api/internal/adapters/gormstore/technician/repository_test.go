package technicianstore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"reflect"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

var databaseDSN = flag.String("database-dsn", "", "PostgreSQL integration test DSN")

type zoneSet map[string]bool

func (z zoneSet) Contains(s string) bool { return z[s] }

var catalog = zoneSet{"UTC": true}
var now = time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)

func profile(t *testing.T) domain.Entity {
	t.Helper()
	minutes := 60
	e, err := domain.New("profile", "owner", domain.Attributes{Name: "Technician", Email: "technician@example.test", Origin: domain.Origin{Label: "Workshop", Street1: "1 Example Street", City: "Example", Region: "NY", PostalCode: "10001", Timezone: "UTC"}, RadiusMiles: 25, DrivingMinutes: &minutes, Services: []string{"tuning"}, Forms: []string{"grand"}, Availability: []domain.WeeklyRule{{Key: "monday", Kind: "available", Recurrence: "weekly", Weekday: 0, Start: "09:00", End: "17:00", Timezone: "UTC"}}}, catalog, now)
	if err != nil {
		t.Fatal(err)
	}
	return e
}
func TestStoragePreservesCompleteAggregate(t *testing.T) {
	want := profile(t)
	row, err := fromEntity(want, catalog)
	if err != nil {
		t.Fatal(err)
	}
	got, err := toEntity(*row, catalog)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("round trip: %+v %v", got, err)
	}
	want.Services = nil
	want.Forms = nil
	want.Availability = nil
	want.DrivingMinutes = nil
	row, err = fromEntity(want, catalog)
	if err != nil {
		t.Fatal(err)
	}
	got, err = toEntity(*row, catalog)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("empty optional fields drifted: %v", err)
	}
}
func TestStorageRejectsCorruptAggregates(t *testing.T) {
	cases := map[string]func(*model){
		"missing boolean": func(r *model) { r.Attributes = bytes.Replace(r.Attributes, []byte(`"Searchable":false,`), nil, 1) },
		"null boolean": func(r *model) {
			r.Attributes = bytes.Replace(r.Attributes, []byte(`"Searchable":false`), []byte(`"Searchable":null`), 1)
		},
		"null weekday": func(r *model) {
			r.Attributes = bytes.Replace(r.Attributes, []byte(`"Weekday":0`), []byte(`"Weekday":null`), 1)
		},
		"conflicting case": func(r *model) {
			r.Attributes = bytes.Replace(r.Attributes, []byte(`"Searchable":false`), []byte(`"Searchable":true,"searchable":false`), 1)
		},
		"missing optional text": func(r *model) { r.Attributes = bytes.Replace(r.Attributes, []byte(`"BusinessName":"",`), nil, 1) },
		"null optional text": func(r *model) {
			r.Attributes = bytes.Replace(r.Attributes, []byte(`"Street2":""`), []byte(`"Street2":null`), 1)
		},

		"null attributes":  func(r *model) { r.Attributes = json.RawMessage("null") },
		"array attributes": func(r *model) { r.Attributes = json.RawMessage("[]") },
		"unknown field": func(r *model) {
			r.Attributes = bytes.Replace(r.Attributes, []byte(`"Name":`), []byte(`"Private":"unexpected","Name":`), 1)
		},
		"invalid rule":      func(r *model) { r.Attributes = bytes.ReplaceAll(r.Attributes, []byte(`"09:00"`), []byte(`"24:00"`)) },
		"trailing document": func(r *model) { r.Attributes = append(r.Attributes, []byte(` {}`)...) },
		"oversize":          func(r *model) { r.Attributes = bytes.Repeat([]byte(" "), maxStoredAggregateBytes+1) },
		"revision":          func(r *model) { r.Revision = 0 },
		"clock":             func(r *model) { r.UpdatedAt = r.CreatedAt.Add(-time.Second) },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			r, err := fromEntity(profile(t), catalog)
			if err != nil {
				t.Fatal(err)
			}
			change(r)
			if got, err := toEntity(*r, catalog); err == nil || got.ID != "" {
				t.Fatalf("corruption returned data: %+v %v", got, err)
			}
		})
	}
}
func TestRepositoryRejectsUnscopedInputsBeforeDatabaseAccess(t *testing.T) {
	r := New(nil, catalog)
	if _, err := r.Get(context.Background(), "", "profile"); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal(err)
	}
	if _, _, err := r.Save(context.Background(), "", "profile", 1, profile(t).Attributes, now, audit.Event{}); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal(err)
	}
}
