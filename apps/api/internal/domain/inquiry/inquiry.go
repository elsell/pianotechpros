package inquiry

import (
	"errors"
	"net/mail"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
)

var ErrInvalid = errors.New("invalid_inquiry")

type Preference string

const (
	Email  Preference = "email"
	Phone  Preference = "phone"
	Either Preference = "either"
)

type Contact struct {
	Name, Email, Phone, Message string
	Preference                  Preference
}

func text(value string, limit int, multiline bool) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > limit {
		return false
	}
	for _, r := range value {
		if unicode.IsControl(r) && !(multiline && (r == '\n' || r == '\t')) {
			return false
		}
	}
	return true
}
func identifier(value string) bool {
	return value != "" && len(value) <= 128 && text(value, 128, false) && strings.TrimSpace(value) == value
}
func ValidateContact(c Contact) (Contact, error) {
	// Validate before trimming so prohibited controls cannot disappear at edges.
	if !text(c.Name, 120, false) || !text(c.Email, 254, false) || len(c.Email) > 254 || !text(c.Phone, 40, false) || !text(c.Message, 4000, true) {
		return Contact{}, ErrInvalid
	}
	c.Name = strings.TrimSpace(c.Name)
	c.Email = strings.TrimSpace(c.Email)
	c.Phone = strings.TrimSpace(c.Phone)
	c.Message = strings.TrimSpace(c.Message)
	if c.Preference == "" {
		c.Preference = Email
	}
	address, err := mail.ParseAddress(c.Email)
	if c.Name == "" || c.Message == "" || err != nil || address.Name != "" || address.Address != c.Email || !strings.Contains(c.Email, "@") {
		return Contact{}, ErrInvalid
	}
	if c.Preference != Email && c.Preference != Phone && c.Preference != Either || c.Preference == Phone && c.Phone == "" {
		return Contact{}, ErrInvalid
	}
	return c, nil
}

// State is private persistence/inbox data. It must never be a public response.
type State struct {
	ID, DealerName, DealerSlug string
	Piano                      inventory.PublicListing
	Contact                    Contact
	CreatedAt                  time.Time
	Revision                   int64
	ReadAt                     *time.Time
	ReadBy                     string
}
type Inquiry struct{ state State }

func New(id string, s showroom.Showroom, p inventory.Publication, c Contact, at time.Time) (Inquiry, error) {
	profile, err := s.Profile()
	if err != nil {
		return Inquiry{}, err
	}
	listing, err := s.Listing(p)
	if err != nil {
		return Inquiry{}, err
	}
	c, err = ValidateContact(c)
	if err != nil {
		return Inquiry{}, err
	}
	return Restore(State{ID: id, DealerName: profile.Name, DealerSlug: profile.Slug, Piano: listing, Contact: c, CreatedAt: at.UTC(), Revision: 1})
}
func Restore(s State) (Inquiry, error) {
	canonical, err := ValidateContact(s.Contact)
	if err != nil || canonical != s.Contact || !identifier(s.ID) || !identifier(s.Piano.ID) || !identifier(s.Piano.DealerID) || s.CreatedAt.IsZero() || s.CreatedAt.Year() < 1 || s.CreatedAt.Year() > 9999 || s.DealerName == "" || (!utf8.ValidString(s.DealerName) || utf8.RuneCountInString(s.DealerName) > 200) || strings.TrimSpace(s.DealerName) != s.DealerName || !identifier(s.DealerSlug) {
		return Inquiry{}, ErrInvalid
	}
	p, err := inventory.RestorePublication(inventory.PublicationState{Snapshot: s.Piano, Visible: true, AppliedRevision: s.Piano.PublicationRevision})
	if err != nil {
		return Inquiry{}, ErrInvalid
	}
	if s.ReadAt == nil {
		if s.ReadBy != "" || s.Revision != 1 {
			return Inquiry{}, ErrInvalid
		}
	} else {
		if !identifier(s.ReadBy) || s.ReadAt.Before(s.CreatedAt) || s.ReadAt.Year() > 9999 || s.Revision != 2 {
			return Inquiry{}, ErrInvalid
		}
		at := s.ReadAt.UTC()
		s.ReadAt = &at
	}
	s.Piano, _ = p.View()
	s.CreatedAt = s.CreatedAt.UTC()
	return Inquiry{state: s}, nil
}
func (i Inquiry) State() State {
	s := i.state
	if s.ReadAt != nil {
		at := *s.ReadAt
		s.ReadAt = &at
	}
	if s.Piano.Price != nil {
		v := *s.Piano.Price
		s.Piano.Price = &v
	}
	if s.Piano.Manufactured != nil {
		v := *s.Piano.Manufactured
		s.Piano.Manufactured = &v
	}
	s.Piano.Photos = append([]inventory.PublicPhoto(nil), s.Piano.Photos...)
	return s
}
func (i Inquiry) MarkRead(actor string, at time.Time) (Inquiry, error) {
	if !identifier(actor) || at.Before(i.state.CreatedAt) || at.IsZero() {
		return Inquiry{}, ErrInvalid
	}
	s := i.State()
	if s.ReadAt == nil {
		s.ReadAt = &at
		s.ReadBy = actor
		s.Revision = 2
	}
	return Restore(s)
}
