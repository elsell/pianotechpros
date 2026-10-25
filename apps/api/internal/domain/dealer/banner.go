package dealer

import "time"

// Banner is current, ready media evidence supplied by an authorized repository.
// It deliberately contains no storage location, original media or presentation URL.
type Banner struct {
	ID            string
	DealerID      ID
	Width, Height int
	SHA256        string
	CreatedAt     time.Time
}

// PublicBanner is the only banner evidence suitable for a published showroom.
type PublicBanner struct {
	ID            string
	Width, Height int
}

func NewBanner(dealerID ID, id string, width, height int, digest string, at time.Time) (Banner, error) {
	b := Banner{ID: id, DealerID: dealerID, Width: width, Height: height, SHA256: digest, CreatedAt: at.UTC()}
	if !b.ValidFor(dealerID) {
		return Banner{}, ErrInvalidFields
	}
	return b, nil
}

func (b Banner) ValidFor(dealerID ID) bool {
	if !validStaffID(string(dealerID)) || b.DealerID != dealerID || !validStaffID(b.ID) ||
		b.Width < 1 || b.Height < 1 || b.Width > 10000 || b.Height > 10000 ||
		int64(b.Width)*int64(b.Height) > 25000000 || b.CreatedAt.IsZero() || len(b.SHA256) != 64 {
		return false
	}
	for _, c := range b.SHA256 {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
func (b Banner) Public() PublicBanner {
	return PublicBanner{ID: b.ID, Width: b.Width, Height: b.Height}
}

// BannerState binds a current optional banner to the same authorized profile.
type BannerState struct {
	Dealer Entity
	Banner *Banner
}

func (s BannerState) ValidFor(id ID) bool {
	normalized, err := New(s.Dealer.ID, s.Dealer.OwnerUserID, s.Dealer.Attributes)
	return err == nil && s.Dealer.ID == id && normalized.Attributes == s.Dealer.Attributes &&
		s.Dealer.Revision >= 1 && s.Dealer.Revision <= 9007199254740991 &&
		(s.Banner == nil || s.Banner.ValidFor(id))
}

// BannerUploadResult distinguishes a replay acknowledgement from current media.
type BannerUploadResult struct {
	State    BannerState
	BannerID string
	Replay   bool
}
