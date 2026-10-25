package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
)

func copyMinutes(value *int) *int {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}
func ProfileAttributes(a dto.TechnicianProfileAttributes) domain.Attributes {
	out := domain.Attributes{Name: a.Name, BusinessName: a.BusinessName, Email: a.Email, Phone: a.Phone, Biography: a.Biography, Searchable: a.Searchable, AcceptsRequestsWithoutAvailability: a.AcceptsRequestsWithoutAvailability, RadiusMiles: a.RadiusMiles, DrivingMinutes: copyMinutes(a.DrivingMinutes), Services: append([]string{}, a.Services...), Forms: append([]string{}, a.Forms...)}
	o := a.Origin
	out.Origin = domain.Origin{Label: o.Label, Street1: o.Street1, Street2: o.Street2, City: o.City, Region: o.Region, PostalCode: o.PostalCode, Timezone: o.Timezone}
	out.Availability = make([]domain.WeeklyRule, len(a.Availability))
	for i, v := range a.Availability {
		out.Availability[i] = domain.WeeklyRule{Key: v.Key, Kind: v.Kind, Recurrence: v.Recurrence, Weekday: v.Weekday, Start: v.Start, End: v.End, Timezone: v.Timezone, EffectiveStart: v.EffectiveStart, EffectiveEnd: v.EffectiveEnd}
	}
	return out
}
func profileAttributesDTO(a domain.Attributes) dto.TechnicianProfileAttributes {
	out := dto.TechnicianProfileAttributes{Name: a.Name, BusinessName: a.BusinessName, Email: a.Email, Phone: a.Phone, Biography: a.Biography, Searchable: a.Searchable, AcceptsRequestsWithoutAvailability: a.AcceptsRequestsWithoutAvailability, RadiusMiles: a.RadiusMiles, DrivingMinutes: copyMinutes(a.DrivingMinutes), Services: append([]string{}, a.Services...), Forms: append([]string{}, a.Forms...)}
	o := a.Origin
	out.Origin = dto.TechnicianProfileOrigin{Label: o.Label, Street1: o.Street1, Street2: o.Street2, City: o.City, Region: o.Region, PostalCode: o.PostalCode, Timezone: o.Timezone}
	out.Availability = make([]dto.TechnicianWeeklyRule, len(a.Availability))
	for i, v := range a.Availability {
		out.Availability[i] = dto.TechnicianWeeklyRule{Key: v.Key, Kind: v.Kind, Recurrence: v.Recurrence, Weekday: v.Weekday, Start: v.Start, End: v.End, Timezone: v.Timezone, EffectiveStart: v.EffectiveStart, EffectiveEnd: v.EffectiveEnd}
	}
	return out
}
func ProfileItem(e domain.Entity) dto.TechnicianProfileItem {
	return dto.TechnicianProfileItem{ID: string(e.ID), Revision: e.Revision, CreatedAt: e.CreatedAt, UpdatedAt: e.UpdatedAt, Attributes: profileAttributesDTO(e.Attributes)}
}
