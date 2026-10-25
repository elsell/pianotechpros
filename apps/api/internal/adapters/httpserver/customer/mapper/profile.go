package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
)

func ProfileAttributes(a dto.ProfileAttributes) domain.Attributes {
	out := domain.Attributes{Name: a.Name, IsBusiness: a.IsBusiness, BusinessName: a.BusinessName, Email: a.Email, Phone: a.Phone}
	out.Locations = make([]domain.Location, len(a.Locations))
	for i, v := range a.Locations {
		out.Locations[i] = domain.Location{Key: v.Key, Label: v.Label, Street1: v.Street1, Street2: v.Street2, City: v.City, Region: v.Region, PostalCode: v.PostalCode, Timezone: v.Timezone, Notes: v.Notes}
	}
	out.Pianos = make([]domain.Piano, len(a.Pianos))
	for i, v := range a.Pianos {
		out.Pianos[i] = domain.Piano{Key: v.Key, LocationKey: v.LocationKey, Nickname: v.Nickname, Form: v.Form, Make: v.Make, Model: v.Model, Serial: v.Serial, Notes: v.Notes, ManufacturedYear: v.ManufacturedYear, Player: v.Player}
		if v.ManufacturedYear != nil {
			year := *v.ManufacturedYear
			out.Pianos[i].ManufacturedYear = &year
		}
	}
	return out
}
func profileAttributesDTO(a domain.Attributes) dto.ProfileAttributes {
	out := dto.ProfileAttributes{Name: a.Name, IsBusiness: a.IsBusiness, BusinessName: a.BusinessName, Email: a.Email, Phone: a.Phone}
	out.Locations = make([]dto.ProfileLocation, len(a.Locations))
	for i, v := range a.Locations {
		out.Locations[i] = dto.ProfileLocation{Key: v.Key, Label: v.Label, Street1: v.Street1, Street2: v.Street2, City: v.City, Region: v.Region, PostalCode: v.PostalCode, Timezone: v.Timezone, Notes: v.Notes}
	}
	out.Pianos = make([]dto.ProfilePiano, len(a.Pianos))
	for i, v := range a.Pianos {
		out.Pianos[i] = dto.ProfilePiano{Key: v.Key, LocationKey: v.LocationKey, Nickname: v.Nickname, Form: v.Form, Make: v.Make, Model: v.Model, Serial: v.Serial, Notes: v.Notes, ManufacturedYear: v.ManufacturedYear, Player: v.Player}
		if v.ManufacturedYear != nil {
			year := *v.ManufacturedYear
			out.Pianos[i].ManufacturedYear = &year
		}
	}
	return out
}
func ProfileItem(e domain.Entity) dto.ProfileItem {
	return dto.ProfileItem{ID: string(e.ID), Revision: e.Revision, CreatedAt: e.CreatedAt, UpdatedAt: e.UpdatedAt, Attributes: profileAttributesDTO(e.Attributes)}
}
