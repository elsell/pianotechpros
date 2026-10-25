package technician

import (
	"testing"
	"time"
)

func TestNewPreservesTypedFields(t *testing.T) {
	now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	_ = now
	attributes := Attributes{Name: "value", BusinessName: "value", Email: "value", Phone: "value", Biography: "value", Searchable: true, AcceptsRequestsWithoutAvailability: true}
	entity, err := New("id", "user", attributes)
	if err != nil || entity.Attributes != attributes {
		t.Fatalf("typed fields were not preserved: entity=%+v err=%v", entity, err)
	}
}
