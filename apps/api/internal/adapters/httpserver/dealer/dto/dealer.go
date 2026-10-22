package dto

type DealerItem struct {
	ID                string `json:"id"`
	Name              string `json:"name" required:"true" minLength:"1"`
	Slug              string `json:"slug" required:"true" minLength:"1"`
	Email             string `json:"email" required:"true" minLength:"1"`
	Phone             string `json:"phone" required:"true" minLength:"1"`
	WebsiteUrl        string `json:"website_url" required:"true" minLength:"1"`
	Tagline           string `json:"tagline" required:"true" minLength:"1"`
	Description       string `json:"description" required:"true" minLength:"1"`
	StreetAddress1    string `json:"street_address_1" required:"true" minLength:"1"`
	StreetAddress2    string `json:"street_address_2" required:"true" minLength:"1"`
	City              string `json:"city" required:"true" minLength:"1"`
	Region            string `json:"region" required:"true" minLength:"1"`
	PostalCode        string `json:"postal_code" required:"true" minLength:"1"`
	AppointmentNote   string `json:"appointment_note" required:"true" minLength:"1"`
	DeliveryNote      string `json:"delivery_note" required:"true" minLength:"1"`
	WarrantyNote      string `json:"warranty_note" required:"true" minLength:"1"`
	ServiceNote       string `json:"service_note" required:"true" minLength:"1"`
	BannerAltText     string `json:"banner_alt_text" required:"true" minLength:"1"`
	AccentColor       string `json:"accent_color" required:"true" minLength:"1"`
	ShowroomPublished bool   `json:"showroom_published" required:"true"`
}

type DealerCreate struct {
	Name              string `json:"name" required:"true" minLength:"1"`
	Slug              string `json:"slug" required:"true" minLength:"1"`
	Email             string `json:"email" required:"true" minLength:"1"`
	Phone             string `json:"phone" required:"true" minLength:"1"`
	WebsiteUrl        string `json:"website_url" required:"true" minLength:"1"`
	Tagline           string `json:"tagline" required:"true" minLength:"1"`
	Description       string `json:"description" required:"true" minLength:"1"`
	StreetAddress1    string `json:"street_address_1" required:"true" minLength:"1"`
	StreetAddress2    string `json:"street_address_2" required:"true" minLength:"1"`
	City              string `json:"city" required:"true" minLength:"1"`
	Region            string `json:"region" required:"true" minLength:"1"`
	PostalCode        string `json:"postal_code" required:"true" minLength:"1"`
	AppointmentNote   string `json:"appointment_note" required:"true" minLength:"1"`
	DeliveryNote      string `json:"delivery_note" required:"true" minLength:"1"`
	WarrantyNote      string `json:"warranty_note" required:"true" minLength:"1"`
	ServiceNote       string `json:"service_note" required:"true" minLength:"1"`
	BannerAltText     string `json:"banner_alt_text" required:"true" minLength:"1"`
	AccentColor       string `json:"accent_color" required:"true" minLength:"1"`
	ShowroomPublished bool   `json:"showroom_published" required:"true"`
}

type DealerUpdate struct {
	Name              string `json:"name" required:"true" minLength:"1"`
	Slug              string `json:"slug" required:"true" minLength:"1"`
	Email             string `json:"email" required:"true" minLength:"1"`
	Phone             string `json:"phone" required:"true" minLength:"1"`
	WebsiteUrl        string `json:"website_url" required:"true" minLength:"1"`
	Tagline           string `json:"tagline" required:"true" minLength:"1"`
	Description       string `json:"description" required:"true" minLength:"1"`
	StreetAddress1    string `json:"street_address_1" required:"true" minLength:"1"`
	StreetAddress2    string `json:"street_address_2" required:"true" minLength:"1"`
	City              string `json:"city" required:"true" minLength:"1"`
	Region            string `json:"region" required:"true" minLength:"1"`
	PostalCode        string `json:"postal_code" required:"true" minLength:"1"`
	AppointmentNote   string `json:"appointment_note" required:"true" minLength:"1"`
	DeliveryNote      string `json:"delivery_note" required:"true" minLength:"1"`
	WarrantyNote      string `json:"warranty_note" required:"true" minLength:"1"`
	ServiceNote       string `json:"service_note" required:"true" minLength:"1"`
	BannerAltText     string `json:"banner_alt_text" required:"true" minLength:"1"`
	AccentColor       string `json:"accent_color" required:"true" minLength:"1"`
	ShowroomPublished bool   `json:"showroom_published" required:"true"`
}
