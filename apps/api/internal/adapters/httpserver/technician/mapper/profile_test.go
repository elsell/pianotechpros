package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"reflect"
	"testing"
)

func TestProfileMappingPreservesAggregateAndCopiesMutableValues(t *testing.T) {
	minutes := 90
	input := dto.TechnicianProfileAttributes{Name: "Alex", Email: "alex@example.test", BusinessName: "Workshop", Phone: "123", Biography: "Two\nlines", Searchable: true, AcceptsRequestsWithoutAvailability: true, Origin: dto.TechnicianProfileOrigin{Label: "Shop", Street1: "1 Main", Street2: "Unit 2", City: "Town", Region: "State", PostalCode: "123", Timezone: "UTC"}, RadiusMiles: 30, DrivingMinutes: &minutes, Services: []string{"tuning"}, Forms: []string{"grand"}, Availability: []dto.TechnicianWeeklyRule{{Key: "monday", Kind: "available", Recurrence: "weekly", Weekday: 0, Start: "09:00", End: "17:00", Timezone: "UTC", EffectiveStart: "2026-01-01", EffectiveEnd: "2026-12-31"}}}
	mapped := ProfileAttributes(input)
	output := ProfileItem(domain.Entity{ID: "profile", OwnerUserID: "private", Revision: 2, Attributes: mapped})
	if !reflect.DeepEqual(output.Attributes, input) || output.ID != "profile" || output.Revision != 2 {
		t.Fatalf("mapping drift: %+v", output)
	}
	input.Services[0] = "repair"
	input.Forms[0] = "other"
	input.Availability[0].End = "15:00"
	minutes = 20
	if mapped.Services[0] != "tuning" || mapped.Forms[0] != "grand" || mapped.Availability[0].End != "17:00" || *mapped.DrivingMinutes != 90 {
		t.Fatal("request aliases domain")
	}
	output.Attributes.Services[0] = "repair"
	output.Attributes.Forms[0] = "other"
	output.Attributes.Availability[0].End = "16:00"
	*output.Attributes.DrivingMinutes = 25
	if mapped.Services[0] != "tuning" || mapped.Forms[0] != "grand" || mapped.Availability[0].End != "17:00" || *mapped.DrivingMinutes != 90 {
		t.Fatal("response aliases domain")
	}
	empty := ProfileItem(domain.Entity{})
	if empty.Attributes.Services == nil || empty.Attributes.Forms == nil || empty.Attributes.Availability == nil {
		t.Fatal("wire arrays must not be null")
	}
}
