package customerstore

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
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

var databaseDSN = flag.String("database-dsn", "", "PostgreSQL integration test DSN")

type zoneSet map[string]bool

func (z zoneSet) Contains(s string) bool { return z[s] }

var catalog = zoneSet{"UTC": true}
var now = time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)

func profile(t *testing.T) domain.Entity {
	t.Helper()
	year := 1990
	e, err := domain.New("profile", "owner", domain.Attributes{Name: "Customer", Email: "customer@example.com", Locations: []domain.Location{{Key: "home", Label: "Home", Street1: "1 Example Street", City: "Example", Region: "NY", PostalCode: "10001", Timezone: "UTC"}}, Pianos: []domain.Piano{{Key: "piano", LocationKey: "home", Nickname: "Family piano", Form: "grand", ManufacturedYear: &year}}}, catalog, now)
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
	want.Pianos = nil
	row, err = fromEntity(want, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if string(row.Pianos) != "[]" {
		t.Fatalf("empty pianos must store an array: %s", row.Pianos)
	}
}
func TestStorageRejectsCorruptAggregates(t *testing.T) {
	cases := map[string]func(*model){
		"null locations": func(r *model) { r.Locations = json.RawMessage("null") },
		"null pianos":    func(r *model) { r.Pianos = json.RawMessage("null") },
		"unknown field": func(r *model) {
			r.Locations = bytes.Replace(r.Locations, []byte(`"Key":`), []byte(`"Private":"unexpected","Key":`), 1)
		},
		"foreign reference": func(r *model) { r.Pianos = bytes.ReplaceAll(r.Pianos, []byte(`"home"`), []byte(`"foreign"`)) },
		"trailing document": func(r *model) { r.Pianos = append(r.Pianos, []byte(` []`)...) },
		"oversize":          func(r *model) { r.Locations = bytes.Repeat([]byte(" "), maxStoredAggregateBytes+1) },
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
