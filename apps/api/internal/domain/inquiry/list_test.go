package inquiry

import (
	"testing"
	"time"
)

func TestInboxQueryBoundsAndCursorTuple(t *testing.T) {
	at := time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name  string
		query ListQuery
		valid bool
	}{
		{"first page", ListQuery{Limit: 30, Snapshot: at}, true},
		{"continuation", ListQuery{Limit: 100, Snapshot: at, AfterCreated: at.Add(-time.Minute), AfterID: "inquiry-id"}, true},
		{"same timestamp", ListQuery{Limit: 1, Snapshot: at, AfterCreated: at, AfterID: "inquiry-id"}, true},
		{"zero limit", ListQuery{Snapshot: at}, false},
		{"large limit", ListQuery{Limit: 101, Snapshot: at}, false},
		{"missing snapshot", ListQuery{Limit: 30}, false},
		{"id alone", ListQuery{Limit: 30, Snapshot: at, AfterID: "id"}, false},
		{"timestamp alone", ListQuery{Limit: 30, Snapshot: at, AfterCreated: at}, false},
		{"invalid id", ListQuery{Limit: 30, Snapshot: at, AfterCreated: at, AfterID: " id"}, false},
		{"future tuple", ListQuery{Limit: 30, Snapshot: at, AfterCreated: at.Add(time.Second), AfterID: "id"}, false},
		{"unrepresentable snapshot", ListQuery{Limit: 30, Snapshot: time.Date(10000, 1, 1, 0, 0, 0, 0, time.UTC)}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := ValidateListQuery(test.query)
			if (err == nil) != test.valid {
				t.Fatal("unexpected validity", err)
			}
		})
	}
}
