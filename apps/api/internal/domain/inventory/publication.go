package inventory

import (
	"strings"
	"time"
	"unicode/utf8"
)

type ReadinessError struct{ Missing []string }

func (*ReadinessError) Error() string { return "inventory_not_ready" }

// PhotoEvidence must originate from a scoped media repository, not client input.
type PhotoEvidence struct {
	ID, RecordID, DealerID string
	Ready                  bool
	AltText                string
}
type PublicPhoto struct{ ID, AltText string }

// PublicListing deliberately has no private draft, location, cost or sale fields.
type PublicListing struct {
	ID, DealerID              string
	PublicationRevision       int64
	Status                    Status
	StockNumber, Title        string
	Featured                  bool
	Form                      Form
	PlayerSystem              bool
	Condition                 Condition
	Make, Model               string
	Manufactured              *ManufacturingDate
	Size, Finish, Description string
	Price                     *Money
	Photos                    []PublicPhoto
}
type Publication struct {
	snapshot        PublicListing
	visible         bool
	appliedRevision int64
}

func cloneListing(value PublicListing) PublicListing {
	if value.Manufactured != nil {
		copy := *value.Manufactured
		value.Manufactured = &copy
	}
	if value.Price != nil {
		copy := *value.Price
		value.Price = &copy
	}
	value.Photos = append([]PublicPhoto(nil), value.Photos...)
	return value
}
func (p Publication) View() (PublicListing, bool) {
	if !p.visible {
		return PublicListing{}, false
	}
	return cloneListing(p.snapshot), true
}
func (r Record) Publish(photos []PhotoEvidence, expected int64, actor string, at time.Time) (Record, Publication, History, error) {
	if err := r.command(expected, actor, Manual, at); err != nil {
		return Record{}, Publication{}, History{}, err
	}
	if r.Status == Archived || r.Status == InService {
		return Record{}, Publication{}, History{}, ErrInvalidFields
	}
	a, err := ValidateAttributes(r.Attributes)
	if err != nil || a.StockNumber == "" || len(photos) > 50 {
		return Record{}, Publication{}, History{}, ErrInvalidFields
	}
	publicPhotos := make([]PublicPhoto, 0, len(photos))
	seen := make(map[string]bool)
	for _, photo := range photos {
		if photo.RecordID != r.ID || photo.DealerID != r.DealerID || !photo.Ready || !utf8.ValidString(photo.ID) || strings.TrimSpace(photo.ID) == "" || strings.TrimSpace(photo.ID) != photo.ID || seen[photo.ID] || !utf8.ValidString(photo.AltText) {
			return Record{}, Publication{}, History{}, ErrInvalidFields
		}
		alt := strings.TrimSpace(photo.AltText)
		if utf8.RuneCountInString(alt) > 240 {
			return Record{}, Publication{}, History{}, ErrInvalidFields
		}
		seen[photo.ID] = true
		publicPhotos = append(publicPhotos, PublicPhoto{ID: photo.ID, AltText: alt})
	}
	var missing []string
	if a.Form == "" {
		missing = append(missing, "form")
	}
	if a.Condition == "" {
		missing = append(missing, "condition")
	}
	if a.Title == "" && a.Make == "" {
		missing = append(missing, "title")
	}
	if len(photos) == 0 {
		missing = append(missing, "photo")
	}
	if len(missing) > 0 {
		return Record{}, Publication{}, History{}, &ReadinessError{Missing: missing}
	}
	event := r.history(actor, Manual, at, "publish")
	event.Fields = []string{"publication"}
	event.From = r.Status
	if r.Status == Draft {
		r.Status = Available
		event.Fields = append(event.Fields, "status")
	}
	event.To = r.Status
	r.Attributes = a
	r.Revision++
	r.UpdatedAt = at
	snapshot := PublicListing{ID: r.ID, DealerID: r.DealerID, PublicationRevision: r.Revision, Status: r.Status, StockNumber: a.StockNumber, Title: a.DisplayTitle(), Featured: a.Featured, Form: a.Form, PlayerSystem: a.PlayerSystem, Condition: a.Condition, Make: a.Make, Model: a.Model, Manufactured: a.Manufactured, Size: a.Size, Finish: a.Finish, Description: a.Description, Photos: publicPhotos}
	if a.PriceVisible {
		snapshot.Price = a.AskingPrice
	}
	return r, Publication{snapshot: cloneListing(snapshot), visible: true, appliedRevision: r.Revision}, event, nil
}

// ApplyLifecycle changes only availability; it never copies private attributes.
func (p Publication) ApplyLifecycle(next Record) (Publication, error) {
	if p.snapshot.ID == "" || p.snapshot.ID != next.ID || p.snapshot.DealerID != next.DealerID || !validStatus(next.Status) {
		return Publication{}, ErrInvalidFields
	}
	if next.Revision <= p.appliedRevision {
		return Publication{}, ErrConflict
	}
	p.appliedRevision = next.Revision
	p.snapshot.Status = next.Status
	if next.Status != Available && next.Status != Reserved && next.Status != Sold {
		p.visible = false
	}
	return p, nil
}
func (r Record) Unpublish(p Publication, expected int64, actor string, at time.Time) (Record, Publication, History, error) {
	if err := r.command(expected, actor, Manual, at); err != nil {
		return Record{}, Publication{}, History{}, err
	}
	if p.snapshot.ID != r.ID || p.snapshot.DealerID != r.DealerID || p.appliedRevision > r.Revision {
		return Record{}, Publication{}, History{}, ErrInvalidFields
	}
	if !p.visible {
		return Record{}, Publication{}, History{}, ErrNoChange
	}
	a, err := ValidateAttributes(r.Attributes)
	if err != nil || a.StockNumber == "" {
		return Record{}, Publication{}, History{}, ErrInvalidFields
	}
	event := r.history(actor, Manual, at, "unpublish")
	event.Fields = []string{"publication"}
	r.Attributes = a
	r.Revision++
	r.UpdatedAt = at
	p.visible = false
	p.appliedRevision = r.Revision
	return r, p, event, nil
}
