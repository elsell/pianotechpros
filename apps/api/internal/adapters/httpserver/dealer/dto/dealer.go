package dto

type DealerItem struct {
	Revision          int64  `json:"revision" minimum:"1"`
	ID                string `json:"id"`
	Name              string `json:"name" required:"true" minLength:"1"`
	Slug              string `json:"slug" required:"true" minLength:"1"`
	Email             string `json:"email" required:"true" minLength:"1"`
	Phone             string `json:"phone,omitempty"`
	WebsiteUrl        string `json:"website_url,omitempty"`
	Tagline           string `json:"tagline,omitempty"`
	Description       string `json:"description,omitempty"`
	StreetAddress1    string `json:"street_address_1,omitempty"`
	StreetAddress2    string `json:"street_address_2,omitempty"`
	City              string `json:"city,omitempty"`
	Region            string `json:"region,omitempty"`
	PostalCode        string `json:"postal_code,omitempty"`
	AppointmentNote   string `json:"appointment_note,omitempty"`
	DeliveryNote      string `json:"delivery_note,omitempty"`
	WarrantyNote      string `json:"warranty_note,omitempty"`
	ServiceNote       string `json:"service_note,omitempty"`
	BannerAltText     string `json:"banner_alt_text,omitempty"`
	AccentColor       string `json:"accent_color" required:"true" minLength:"1"`
	ShowroomPublished bool   `json:"showroom_published" required:"true"`
}

type DealerCreate struct {
	Name              string `json:"name" required:"true" minLength:"1"`
	Slug              string `json:"slug" required:"true" minLength:"1"`
	Email             string `json:"email" required:"true" minLength:"1"`
	Phone             string `json:"phone,omitempty"`
	WebsiteUrl        string `json:"website_url,omitempty"`
	Tagline           string `json:"tagline,omitempty"`
	Description       string `json:"description,omitempty"`
	StreetAddress1    string `json:"street_address_1,omitempty"`
	StreetAddress2    string `json:"street_address_2,omitempty"`
	City              string `json:"city,omitempty"`
	Region            string `json:"region,omitempty"`
	PostalCode        string `json:"postal_code,omitempty"`
	AppointmentNote   string `json:"appointment_note,omitempty"`
	DeliveryNote      string `json:"delivery_note,omitempty"`
	WarrantyNote      string `json:"warranty_note,omitempty"`
	ServiceNote       string `json:"service_note,omitempty"`
	BannerAltText     string `json:"banner_alt_text,omitempty"`
	AccentColor       string `json:"accent_color" required:"true" minLength:"1"`
	ShowroomPublished bool   `json:"showroom_published" required:"true"`
}

type DealerUpdate struct {
	ExpectedRevision  int64  `json:"expectedRevision" required:"true" minimum:"1"`
	Name              string `json:"name" required:"true" minLength:"1"`
	Slug              string `json:"slug" required:"true" minLength:"1"`
	Email             string `json:"email" required:"true" minLength:"1"`
	Phone             string `json:"phone,omitempty"`
	WebsiteUrl        string `json:"website_url,omitempty"`
	Tagline           string `json:"tagline,omitempty"`
	Description       string `json:"description,omitempty"`
	StreetAddress1    string `json:"street_address_1,omitempty"`
	StreetAddress2    string `json:"street_address_2,omitempty"`
	City              string `json:"city,omitempty"`
	Region            string `json:"region,omitempty"`
	PostalCode        string `json:"postal_code,omitempty"`
	AppointmentNote   string `json:"appointment_note,omitempty"`
	DeliveryNote      string `json:"delivery_note,omitempty"`
	WarrantyNote      string `json:"warranty_note,omitempty"`
	ServiceNote       string `json:"service_note,omitempty"`
	BannerAltText     string `json:"banner_alt_text,omitempty"`
	AccentColor       string `json:"accent_color" required:"true" minLength:"1"`
	ShowroomPublished bool   `json:"showroom_published" required:"true"`
}
