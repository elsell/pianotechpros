package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"testing"
	"time"
)

func TestItemMapsPublicFields(t *testing.T) {
	now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	_ = now
	attributes := domain.Attributes{Name: "value", Slug: "value", Email: "value", Phone: "value", WebsiteUrl: "value", Tagline: "value", Description: "value", StreetAddress1: "value", StreetAddress2: "value", City: "value", Region: "value", PostalCode: "value", AppointmentNote: "value", DeliveryNote: "value", WarrantyNote: "value", ServiceNote: "value", BannerAltText: "value", AccentColor: "value", ShowroomPublished: true}
	got := Item(domain.Entity{ID: "id", OwnerUserID: "private-owner", Attributes: attributes})
	if got.ID != "id" || Attributes(dto.DealerCreate{Name: "value", Slug: "value", Email: "value", Phone: "value", WebsiteUrl: "value", Tagline: "value", Description: "value", StreetAddress1: "value", StreetAddress2: "value", City: "value", Region: "value", PostalCode: "value", AppointmentNote: "value", DeliveryNote: "value", WarrantyNote: "value", ServiceNote: "value", BannerAltText: "value", AccentColor: "value", ShowroomPublished: true}) != attributes || UpdateAttributes(dto.DealerUpdate{Name: "value", Slug: "value", Email: "value", Phone: "value", WebsiteUrl: "value", Tagline: "value", Description: "value", StreetAddress1: "value", StreetAddress2: "value", City: "value", Region: "value", PostalCode: "value", AppointmentNote: "value", DeliveryNote: "value", WarrantyNote: "value", ServiceNote: "value", BannerAltText: "value", AccentColor: "value", ShowroomPublished: true}) != attributes {
		t.Fatalf("unexpected DTO: %+v", got)
	}
}
