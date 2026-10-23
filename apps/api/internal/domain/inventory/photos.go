package inventory

import (
	"strings"
	"time"
	"unicode/utf8"
)

// PhotoCollection contains ready, scoped media references, never storage locations.
// Evidence must be supplied by the authorized media repository, not a client DTO.
type PhotoCollection struct {
	recordID, dealerID string
	photos             []PhotoEvidence
}

func photoID(value string) bool {
	return utf8.ValidString(value) && value != "" && strings.TrimSpace(value) == value && utf8.RuneCountInString(value) <= 128
}

func photoAlt(value string) (string, error) {
	if !utf8.ValidString(value) {
		return "", ErrInvalidFields
	}
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > 240 {
		return "", ErrInvalidFields
	}
	return value, nil
}

func RestorePhotos(recordID, dealerID string, photos []PhotoEvidence) (PhotoCollection, error) {
	if !photoID(recordID) || !photoID(dealerID) || len(photos) > 50 {
		return PhotoCollection{}, ErrInvalidFields
	}
	result := PhotoCollection{recordID: recordID, dealerID: dealerID, photos: make([]PhotoEvidence, 0, len(photos))}
	seen := make(map[string]bool, len(photos))
	for _, p := range photos {
		if !photoID(p.ID) || p.RecordID != recordID || p.DealerID != dealerID || !p.Ready || seen[p.ID] {
			return PhotoCollection{}, ErrInvalidFields
		}
		alt, err := photoAlt(p.AltText)
		if err != nil {
			return PhotoCollection{}, err
		}
		p.AltText = alt
		seen[p.ID] = true
		result.photos = append(result.photos, p)
	}
	return result, nil
}

func (c PhotoCollection) Evidence() []PhotoEvidence { return append([]PhotoEvidence(nil), c.photos...) }

func (r Record) photoCommand(c PhotoCollection, expected int64, actor string, at time.Time) (PhotoCollection, error) {
	if err := r.command(expected, actor, Manual, at); err != nil {
		return PhotoCollection{}, err
	}
	if c.recordID != r.ID || c.dealerID != r.DealerID {
		return PhotoCollection{}, ErrInvalidFields
	}
	if a, err := ValidateAttributes(r.Attributes); err != nil || a.StockNumber == "" {
		return PhotoCollection{}, ErrInvalidFields
	}
	return RestorePhotos(c.recordID, c.dealerID, c.photos)
}

func (r Record) changedPhotos(c PhotoCollection, actor string, at time.Time) (Record, PhotoCollection, History, error) {
	attributes, err := ValidateAttributes(r.Attributes)
	if err != nil {
		return Record{}, PhotoCollection{}, History{}, err
	}
	r.Attributes = attributes
	h := r.history(actor, Manual, at, "photos")
	h.Fields = []string{"photos"}
	r.Revision++
	r.UpdatedAt = at
	return r, c, h, nil
}

func (r Record) AttachPhoto(c PhotoCollection, photo PhotoEvidence, expected int64, actor string, at time.Time) (Record, PhotoCollection, History, error) {
	c, err := r.photoCommand(c, expected, actor, at)
	if err != nil {
		return Record{}, PhotoCollection{}, History{}, err
	}
	checked, err := RestorePhotos(r.ID, r.DealerID, []PhotoEvidence{photo})
	if err != nil {
		return Record{}, PhotoCollection{}, History{}, err
	}
	for _, p := range c.photos {
		if p.ID == photo.ID {
			return Record{}, PhotoCollection{}, History{}, ErrNoChange
		}
	}
	if len(c.photos) >= 50 {
		return Record{}, PhotoCollection{}, History{}, ErrInvalidFields
	}
	c.photos = append(c.photos, checked.photos[0])
	return r.changedPhotos(c, actor, at)
}

func (r Record) RemovePhoto(c PhotoCollection, id string, expected int64, actor string, at time.Time) (Record, PhotoCollection, History, error) {
	c, err := r.photoCommand(c, expected, actor, at)
	if err != nil {
		return Record{}, PhotoCollection{}, History{}, err
	}
	for i, p := range c.photos {
		if p.ID == id {
			c.photos = append(c.photos[:i], c.photos[i+1:]...)
			return r.changedPhotos(c, actor, at)
		}
	}
	return Record{}, PhotoCollection{}, History{}, ErrInvalidFields
}

func (r Record) DescribePhoto(c PhotoCollection, id, alt string, expected int64, actor string, at time.Time) (Record, PhotoCollection, History, error) {
	c, err := r.photoCommand(c, expected, actor, at)
	if err != nil {
		return Record{}, PhotoCollection{}, History{}, err
	}
	alt, err = photoAlt(alt)
	if err != nil {
		return Record{}, PhotoCollection{}, History{}, err
	}
	for i, p := range c.photos {
		if p.ID == id {
			if p.AltText == alt {
				return Record{}, PhotoCollection{}, History{}, ErrNoChange
			}
			c.photos[i].AltText = alt
			return r.changedPhotos(c, actor, at)
		}
	}
	return Record{}, PhotoCollection{}, History{}, ErrInvalidFields
}

func (r Record) ReorderPhotos(c PhotoCollection, ids []string, expected int64, actor string, at time.Time) (Record, PhotoCollection, History, error) {
	c, err := r.photoCommand(c, expected, actor, at)
	if err != nil {
		return Record{}, PhotoCollection{}, History{}, err
	}
	if len(ids) != len(c.photos) {
		return Record{}, PhotoCollection{}, History{}, ErrInvalidFields
	}
	available := make(map[string]PhotoEvidence, len(c.photos))
	for _, p := range c.photos {
		available[p.ID] = p
	}
	ordered := make([]PhotoEvidence, 0, len(ids))
	changed := false
	for i, id := range ids {
		p, ok := available[id]
		if !ok {
			return Record{}, PhotoCollection{}, History{}, ErrInvalidFields
		}
		delete(available, id)
		ordered = append(ordered, p)
		changed = changed || c.photos[i].ID != id
	}
	if !changed {
		return Record{}, PhotoCollection{}, History{}, ErrNoChange
	}
	c.photos = ordered
	return r.changedPhotos(c, actor, at)
}
