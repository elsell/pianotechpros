package inventory

import (
	"reflect"
	"strings"
	"unicode/utf8"
)

// PublicationState is a persistence boundary, not a public response or an
// authorization result. Hidden snapshots retain their content and media references.
type PublicationState struct {
	Snapshot        PublicListing
	Visible         bool
	AppliedRevision int64
}

func (p Publication) State() PublicationState {
	return PublicationState{Snapshot: cloneListing(p.snapshot), Visible: p.visible, AppliedRevision: p.appliedRevision}
}

// RestorePublication rejects noncanonical storage. The repository must also
// check identity and revision against its scoped record, and authorize every read.
func RestorePublication(state PublicationState) (Publication, error) {
	s := state.Snapshot
	canonical := func(value string) bool {
		return utf8.ValidString(value) && strings.TrimSpace(value) == value && value != ""
	}
	if !canonical(s.ID) || !canonical(s.DealerID) || s.PublicationRevision < 2 || state.AppliedRevision < s.PublicationRevision || state.AppliedRevision > 9007199254740991 || !validStatus(s.Status) {
		return Publication{}, ErrInvalidFields
	}
	if state.Visible && s.Status != Available && s.Status != Reserved && s.Status != Sold {
		return Publication{}, ErrInvalidFields
	}
	// DisplayTitle may join two individually bounded 160-code-point fields. It
	// must not be validated as a manually entered (240-code-point) draft title.
	if !canonical(s.Title) || utf8.RuneCountInString(s.Title) > 321 || s.StockNumber == "" || s.Form == "" || s.Condition == "" {
		return Publication{}, ErrInvalidFields
	}
	attributes := Attributes{StockNumber: s.StockNumber, Featured: s.Featured, Form: s.Form, PlayerSystem: s.PlayerSystem, Condition: s.Condition, Make: s.Make, Model: s.Model, Manufactured: s.Manufactured, Size: s.Size, Finish: s.Finish, Description: s.Description, AskingPrice: s.Price}
	if utf8.RuneCountInString(s.Title) > 240 && (s.Make == "" || s.Title != attributes.DisplayTitle()) {
		return Publication{}, ErrInvalidFields
	}
	validated, err := ValidateAttributes(attributes)
	if err != nil || !reflect.DeepEqual(attributes, validated) {
		return Publication{}, ErrInvalidFields
	}
	if len(s.Photos) < 1 || len(s.Photos) > 50 {
		return Publication{}, ErrInvalidFields
	}
	seen := make(map[string]bool, len(s.Photos))
	for _, photo := range s.Photos {
		if !canonical(photo.ID) || seen[photo.ID] || !utf8.ValidString(photo.AltText) || strings.TrimSpace(photo.AltText) != photo.AltText || utf8.RuneCountInString(photo.AltText) > 240 {
			return Publication{}, ErrInvalidFields
		}
		seen[photo.ID] = true
	}
	return Publication{snapshot: cloneListing(s), visible: state.Visible, appliedRevision: state.AppliedRevision}, nil
}
