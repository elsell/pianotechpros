package mapper

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
)

func TestProfileWireRoundTripPreservesChildrenWithoutOwner(t *testing.T) {
	year := 1924
	attrs := domain.Attributes{Name: "Ada", IsBusiness: true, BusinessName: "Studio", Email: "ada@example.test", Phone: "123", Locations: []domain.Location{{Key: "home", Label: "Home", Street1: "1 Main", Street2: "Suite 1", City: "Town", Region: "State", PostalCode: "123", Timezone: "CET", Notes: "Upstairs"}}, Pianos: []domain.Piano{{Key: "piano", LocationKey: "home", Nickname: "Studio piano", Form: "grand", Make: "Maker", Model: "Model", Serial: "Serial", Notes: "Notes", ManufacturedYear: &year, Player: true}}}
	e := domain.Entity{ID: "profile", OwnerUserID: "private-owner", Attributes: attrs, Revision: 7, CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)}
	wire := ProfileItem(e)
	if !reflect.DeepEqual(ProfileAttributes(wire.Attributes), attrs) {
		t.Fatal("profile mapping lost attributes")
	}
	encoded, err := json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "private-owner") || strings.Contains(string(encoded), "owner") {
		t.Fatal("owner leaked")
	}
	if wire.Revision != 7 || wire.ID != "profile" || !wire.UpdatedAt.Equal(e.UpdatedAt) {
		t.Fatal("lost version metadata")
	}
	*wire.Attributes.Pianos[0].ManufacturedYear = 2000
	wire.Attributes.Locations[0].Label = "Changed"
	if *attrs.Pianos[0].ManufacturedYear != 1924 || attrs.Locations[0].Label != "Home" {
		t.Fatal("output aliases domain")
	}
	in := ProfileAttributes(wire.Attributes)
	*in.Pianos[0].ManufacturedYear = 1990
	if *wire.Attributes.Pianos[0].ManufacturedYear != 2000 {
		t.Fatal("input aliases wire DTO")
	}
}
