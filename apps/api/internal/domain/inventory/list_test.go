package inventory

import (
	"strings"
	"testing"
	"time"
)

func TestListQueryValidation(t *testing.T) {
	now := time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC)
	good := ListQuery{Limit: 30, Snapshot: now, Search: " Yamaha "}
	normalized, err := ValidateListQuery(good)
	if err != nil || normalized.Search != "Yamaha" {
		t.Fatalf("normalize: %+v %v", normalized, err)
	}
	for _, change := range []func(*ListQuery){
		func(q *ListQuery) { q.Limit = 0 }, func(q *ListQuery) { q.Limit = 101 },
		func(q *ListQuery) { q.Snapshot = time.Time{} }, func(q *ListQuery) { q.Status = "invalid" },
		func(q *ListQuery) { q.Search = strings.Repeat("🎹", 121) }, func(q *ListQuery) { q.Search = "bad\x00" },
		func(q *ListQuery) { q.Search = string([]byte{0xff}) }, func(q *ListQuery) { q.AfterID = "id" },
		func(q *ListQuery) { q.AfterCreated = now }, func(q *ListQuery) { q.AfterFeatured = true },
		func(q *ListQuery) { q.AfterID = "id"; q.AfterCreated = now.Add(time.Second) },
	} {
		q := good
		change(&q)
		if _, err := ValidateListQuery(q); err == nil {
			t.Fatalf("accepted invalid query %+v", q)
		}
	}
	for _, status := range []Status{Draft, Available, Reserved, InService, Sold, Archived} {
		q := good
		q.Status = status
		if _, err := ValidateListQuery(q); err != nil {
			t.Fatal(status, err)
		}
	}
	q := good
	q.AfterID = "record"
	q.AfterCreated = now
	q.AfterFeatured = true
	if _, err := ValidateListQuery(q); err != nil {
		t.Fatal(err)
	}
}
