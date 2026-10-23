package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

func Item(entity domain.Entity) dto.DealerItem {
	return dto.DealerItem{ID: string(entity.ID), Revision: entity.Revision, Name: entity.Name, Slug: entity.Slug, Email: entity.Email, Phone: entity.Phone, WebsiteUrl: entity.WebsiteUrl, Tagline: entity.Tagline, Description: entity.Description, StreetAddress1: entity.StreetAddress1, StreetAddress2: entity.StreetAddress2, City: entity.City, Region: entity.Region, PostalCode: entity.PostalCode, AppointmentNote: entity.AppointmentNote, DeliveryNote: entity.DeliveryNote, WarrantyNote: entity.WarrantyNote, ServiceNote: entity.ServiceNote, BannerAltText: entity.BannerAltText, AccentColor: entity.AccentColor, ShowroomPublished: entity.ShowroomPublished}
}

func Attributes(input dto.DealerCreate) domain.Attributes {
	return domain.Attributes{Name: input.Name, Slug: input.Slug, Email: input.Email, Phone: input.Phone, WebsiteUrl: input.WebsiteUrl, Tagline: input.Tagline, Description: input.Description, StreetAddress1: input.StreetAddress1, StreetAddress2: input.StreetAddress2, City: input.City, Region: input.Region, PostalCode: input.PostalCode, AppointmentNote: input.AppointmentNote, DeliveryNote: input.DeliveryNote, WarrantyNote: input.WarrantyNote, ServiceNote: input.ServiceNote, BannerAltText: input.BannerAltText, AccentColor: input.AccentColor, ShowroomPublished: input.ShowroomPublished}
}

func UpdateAttributes(input dto.DealerUpdate) domain.Attributes {
	return domain.Attributes{Name: input.Name, Slug: input.Slug, Email: input.Email, Phone: input.Phone, WebsiteUrl: input.WebsiteUrl, Tagline: input.Tagline, Description: input.Description, StreetAddress1: input.StreetAddress1, StreetAddress2: input.StreetAddress2, City: input.City, Region: input.Region, PostalCode: input.PostalCode, AppointmentNote: input.AppointmentNote, DeliveryNote: input.DeliveryNote, WarrantyNote: input.WarrantyNote, ServiceNote: input.ServiceNote, BannerAltText: input.BannerAltText, AccentColor: input.AccentColor, ShowroomPublished: input.ShowroomPublished}
}
