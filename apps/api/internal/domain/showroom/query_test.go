package showroom

import (
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

func TestQueryNormalizesAndCopiesExactPriceBounds(t *testing.T) {
	min, max := int64(0), int64(9007199254740991)
	q, err := ValidateQuery(Query{Search: "  Piano %_\\  ", Form: inventory.Grand, Availability: "all", Currency: "USD", MinPrice: &min, MaxPrice: &max, Limit: 30})
	if err != nil || q.Search != "Piano %_\\" || *q.MinPrice != 0 || *q.MaxPrice != 9007199254740991 {
		t.Fatalf("normalization: %#v %v", q, err)
	}
	min, max = 10, 20
	if *q.MinPrice != 0 || *q.MaxPrice != 9007199254740991 {
		t.Fatal("query aliases mutable input")
	}
}

func TestQueryRejectsUnsafeAndAmbiguousFilters(t *testing.T) {
	negative, tooBig, one, zero := int64(-1), int64(9007199254740992), int64(1), int64(0)
	for name, change := range map[string]func(*Query){
		"zero limit": func(q *Query) { q.Limit = 0 }, "large limit": func(q *Query) { q.Limit = 101 },
		"long search": func(q *Query) { q.Search = strings.Repeat("é", 121) }, "control": func(q *Query) { q.Search = "piano\n" }, "utf8": func(q *Query) { q.Search = string([]byte{0xff}) },
		"form": func(q *Query) { q.Form = "unknown" }, "private status": func(q *Query) { q.Availability = "draft" },
		"mixed currency": func(q *Query) { q.Currency = "usd" }, "missing currency": func(q *Query) { q.MinPrice = &zero },
		"negative": func(q *Query) { q.Currency = "USD"; q.MinPrice = &negative }, "unsafe integer": func(q *Query) { q.Currency = "USD"; q.MaxPrice = &tooBig },
		"inverted":        func(q *Query) { q.Currency = "USD"; q.MinPrice = &one; q.MaxPrice = &zero },
		"orphan ordering": func(q *Query) { q.AfterFeatured = true }, "padded continuation": func(q *Query) { q.AfterID = " id" }, "large continuation": func(q *Query) { q.AfterID = strings.Repeat("a", 129) },
	} {
		t.Run(name, func(t *testing.T) {
			q := Query{Limit: 30}
			change(&q)
			if _, err := ValidateQuery(q); err == nil {
				t.Fatal("invalid query accepted")
			}
		})
	}
	for _, availability := range []string{"", "all", "available", "reserved", "sold"} {
		if _, err := ValidateQuery(Query{Limit: 100, Availability: availability, Search: strings.Repeat("é", 120), AfterID: "piano"}); err != nil {
			t.Fatal(err)
		}
	}
}
