package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"reflect"
	"testing"
	"time"
)

func TestItemMapsPublicFields(t *testing.T) {
	now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	_ = now
	attributes := domain.Attributes{Name: "value", BusinessName: "value", Email: "value", Phone: "value", Biography: "value", Searchable: true, AcceptsRequestsWithoutAvailability: true}
	got := Item(domain.Entity{ID: "id", OwnerUserID: "private-owner", Attributes: attributes})
	if got.ID != "id" || !reflect.DeepEqual(Attributes(dto.TechnicianCreate{Name: "value", BusinessName: "value", Email: "value", Phone: "value", Biography: "value", Searchable: true, AcceptsRequestsWithoutAvailability: true}), attributes) || !reflect.DeepEqual(UpdateAttributes(dto.TechnicianUpdate{Name: "value", BusinessName: "value", Email: "value", Phone: "value", Biography: "value", Searchable: true, AcceptsRequestsWithoutAvailability: true}), attributes) {
		t.Fatalf("unexpected DTO: %+v", got)
	}
}
