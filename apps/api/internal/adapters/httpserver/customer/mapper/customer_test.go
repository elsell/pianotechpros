package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"reflect"
	"testing"
	"time"
)

func TestItemMapsPublicFields(t *testing.T) {
	now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	_ = now
	attributes := domain.Attributes{Name: "value", IsBusiness: true, BusinessName: "value", Email: "value", Phone: "value"}
	got := Item(domain.Entity{ID: "id", OwnerUserID: "private-owner", Attributes: attributes})
	if got.ID != "id" || !reflect.DeepEqual(Attributes(dto.CustomerCreate{Name: "value", IsBusiness: true, BusinessName: "value", Email: "value", Phone: "value"}), attributes) || !reflect.DeepEqual(UpdateAttributes(dto.CustomerUpdate{Name: "value", IsBusiness: true, BusinessName: "value", Email: "value", Phone: "value"}), attributes) {
		t.Fatalf("unexpected DTO: %+v", got)
	}
}
