package dealer

import (
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type ID string
type Attributes struct {
	Name              string
	Slug              string
	Email             string
	Phone             string
	WebsiteUrl        string
	Tagline           string
	Description       string
	StreetAddress1    string
	StreetAddress2    string
	City              string
	Region            string
	PostalCode        string
	AppointmentNote   string
	DeliveryNote      string
	WarrantyNote      string
	ServiceNote       string
	BannerAltText     string
	AccentColor       string
	ShowroomPublished bool
}
type Entity struct {
	ID          ID
	OwnerUserID string
	Revision    int64
	Attributes
	CreatedAt, UpdatedAt time.Time
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func New(id ID, ownerUserID string, attributes Attributes) (Entity, error) {
	if strings.TrimSpace(string(id)) == "" || strings.TrimSpace(ownerUserID) == "" {
		return Entity{}, ErrInvalidFields
	}
	fields := []struct {
		value *string
		limit int
	}{
		{&attributes.Name, 200}, {&attributes.Slug, 80}, {&attributes.Email, 320},
		{&attributes.Phone, 32}, {&attributes.WebsiteUrl, 2048}, {&attributes.Tagline, 240},
		{&attributes.Description, 4000}, {&attributes.StreetAddress1, 200}, {&attributes.StreetAddress2, 200},
		{&attributes.City, 100}, {&attributes.Region, 64}, {&attributes.PostalCode, 20},
		{&attributes.AppointmentNote, 2000}, {&attributes.DeliveryNote, 2000},
		{&attributes.WarrantyNote, 2000}, {&attributes.ServiceNote, 2000},
		{&attributes.BannerAltText, 240}, {&attributes.AccentColor, 7},
	}
	for _, field := range fields {
		if !utf8.ValidString(*field.value) {
			return Entity{}, ErrInvalidFields
		}
		*field.value = strings.TrimSpace(*field.value)
		if utf8.RuneCountInString(*field.value) > field.limit {
			return Entity{}, ErrInvalidFields
		}
	}
	if attributes.Name == "" || !slugPattern.MatchString(attributes.Slug) || !colorPattern.MatchString(attributes.AccentColor) {
		return Entity{}, ErrInvalidFields
	}
	address, err := mail.ParseAddress(attributes.Email)
	if err != nil || address.Address != attributes.Email || address.Name != "" {
		return Entity{}, ErrInvalidFields
	}
	if attributes.WebsiteUrl != "" {
		website, err := url.Parse(attributes.WebsiteUrl)
		if err != nil || website.Scheme != "https" || website.Hostname() == "" || website.User != nil || website.Opaque != "" {
			return Entity{}, ErrInvalidFields
		}
	}
	return Entity{ID: id, OwnerUserID: ownerUserID, Attributes: attributes, Revision: 1}, nil
}
