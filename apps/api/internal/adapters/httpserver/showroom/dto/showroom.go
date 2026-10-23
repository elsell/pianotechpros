package dto

import inventory "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"

type PublicShowroomProfile struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Slug            string `json:"slug"`
	Email           string `json:"email"`
	Phone           string `json:"phone"`
	WebsiteURL      string `json:"website_url"`
	Tagline         string `json:"tagline"`
	Description     string `json:"description"`
	StreetAddress1  string `json:"street_address_1"`
	StreetAddress2  string `json:"street_address_2"`
	City            string `json:"city"`
	Region          string `json:"region"`
	PostalCode      string `json:"postal_code"`
	AppointmentNote string `json:"appointment_note"`
	DeliveryNote    string `json:"delivery_note"`
	WarrantyNote    string `json:"warranty_note"`
	ServiceNote     string `json:"service_note"`
	BannerAltText   string `json:"banner_alt_text"`
	AccentColor     string `json:"accent_color"`
}

type PublicShowroomListing struct {
	Profile PublicShowroomProfile   `json:"profile"`
	Piano   inventory.PublicListing `json:"piano"`
}
