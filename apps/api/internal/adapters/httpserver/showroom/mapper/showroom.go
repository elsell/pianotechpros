package mapper

import (
	inventory "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/mapper"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/dto"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
)

func Profile(p domain.Profile) dto.PublicShowroomProfile {
	return dto.PublicShowroomProfile{ID: p.ID, Name: p.Name, Slug: p.Slug, Email: p.Email, Phone: p.Phone, WebsiteURL: p.WebsiteURL, Tagline: p.Tagline, Description: p.Description, StreetAddress1: p.StreetAddress1, StreetAddress2: p.StreetAddress2, City: p.City, Region: p.Region, PostalCode: p.PostalCode, AppointmentNote: p.AppointmentNote, DeliveryNote: p.DeliveryNote, WarrantyNote: p.WarrantyNote, ServiceNote: p.ServiceNote, BannerAltText: p.BannerAltText, AccentColor: p.AccentColor}
}

func Listing(value app.Listing) dto.PublicShowroomListing {
	return dto.PublicShowroomListing{Profile: Profile(value.Profile), Piano: inventory.PublicListing(value.Piano)}
}
