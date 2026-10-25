package showroom

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

var ErrUnavailable = errors.New("showroom_not_found")
var ErrInvalidProfile = errors.New("invalid_public_dealer_profile")

// Profile contains only deliberately public business information. It must not
// embed dealer.Entity or dealer.Attributes: additions there are private by default.
type Profile struct {
	Banner                                   *dealer.PublicBanner
	ID, Name, Slug, Email, Phone, WebsiteURL string
	Tagline, Description                     string
	StreetAddress1, StreetAddress2           string
	City, Region, PostalCode                 string
	AppointmentNote, DeliveryNote            string
	WarrantyNote, ServiceNote                string
	BannerAltText, AccentColor               string
}

// Showroom is a projection of a currently published profile. Reconstruct it from
// the current repository read for every request; it is not a durable access grant.
type Showroom struct{ profile Profile }

func New(entity dealer.Entity) (Showroom, error) {
	if !entity.ShowroomPublished {
		return Showroom{}, ErrUnavailable
	}
	canonicalID := func(value string) bool {
		return value != "" && len(value) <= 128 && utf8.ValidString(value) &&
			strings.TrimSpace(value) == value && strings.IndexFunc(value, unicode.IsControl) < 0
	}
	validated, err := dealer.New(entity.ID, entity.OwnerUserID, entity.Attributes)
	if err != nil || validated.Attributes != entity.Attributes || !canonicalID(string(entity.ID)) ||
		!canonicalID(entity.OwnerUserID) || entity.Revision < 1 || entity.Revision > 9007199254740991 {
		return Showroom{}, ErrInvalidProfile
	}
	return Showroom{profile: Profile{
		ID: string(entity.ID), Name: entity.Name, Slug: entity.Slug,
		Email: entity.Email, Phone: entity.Phone, WebsiteURL: entity.WebsiteUrl,
		Tagline: entity.Tagline, Description: entity.Description,
		StreetAddress1: entity.StreetAddress1, StreetAddress2: entity.StreetAddress2,
		City: entity.City, Region: entity.Region, PostalCode: entity.PostalCode,
		AppointmentNote: entity.AppointmentNote, DeliveryNote: entity.DeliveryNote,
		WarrantyNote: entity.WarrantyNote, ServiceNote: entity.ServiceNote,
		BannerAltText: entity.BannerAltText, AccentColor: entity.AccentColor,
	}}, nil
}

func (s Showroom) Profile() (Profile, error) {
	if s.profile.ID == "" {
		return Profile{}, ErrUnavailable
	}
	profile := s.profile
	if profile.Banner != nil {
		banner := *profile.Banner
		profile.Banner = &banner
	}
	return profile, nil
}

func (s Showroom) Listing(publication inventory.Publication) (inventory.PublicListing, error) {
	listing, visible := publication.View()
	if s.profile.ID == "" || !visible || listing.DealerID != s.profile.ID {
		return inventory.PublicListing{}, ErrUnavailable
	}
	return listing, nil
}

// Photo authorizes only a current snapshot reference. The delivery adapter must
// obtain this publication and its bytes in the same scoped repository operation.
func (s Showroom) Photo(publication inventory.Publication, photoID string) (inventory.PublicPhoto, error) {
	listing, err := s.Listing(publication)
	if err != nil {
		return inventory.PublicPhoto{}, err
	}
	for _, photo := range listing.Photos {
		if photo.ID == photoID {
			return photo, nil
		}
	}
	return inventory.PublicPhoto{}, ErrUnavailable
}

// WithBanner attaches only current, scoped evidence from the same repository read.
func (s Showroom) WithBanner(banner dealer.Banner) (Showroom, error) {
	if s.profile.ID == "" {
		return Showroom{}, ErrUnavailable
	}
	if !banner.ValidFor(dealer.ID(s.profile.ID)) {
		return Showroom{}, ErrInvalidProfile
	}
	public := banner.Public()
	s.profile.Banner = &public
	return s, nil
}
