package dealerstore

import (
	"context"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var _ app.Repository = (*Repository)(nil)

func publicLookup(value string, limit int) bool {
	return value != "" && utf8.ValidString(value) && len(value) <= limit &&
		strings.TrimSpace(value) == value && strings.IndexFunc(value, unicode.IsControl) < 0
}

func publicReadError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, domain.ErrUnavailable) {
		return ports.ErrNotFound
	}
	return err
}

func lockPublicShowroom(tx *gorm.DB, slug string) (domain.Showroom, error) {
	var row model
	if err := tx.Where("slug=? AND showroom_published", slug).Clauses(clause.Locking{Strength: "SHARE"}).Take(&row).Error; err != nil {
		return domain.Showroom{}, err
	}
	return domain.New(toEntity(row))
}

func readPublicPublication(tx *gorm.DB, showroom domain.Showroom, id string) (inventory.Publication, error) {
	profile, err := showroom.Profile()
	if err != nil {
		return inventory.Publication{}, err
	}
	// Public delivery must not load private working attributes. These identity
	// fields only verify the scoped pointer and serialize against lifecycle writes.
	var row inventoryRecordModel
	if err := tx.Select("id", "dealer_id", "revision", "status").Where("id=? AND dealer_id=?", id, profile.ID).
		Clauses(clause.Locking{Strength: "SHARE"}).Take(&row).Error; err != nil {
		return inventory.Publication{}, err
	}
	publication, err := readPublication(tx, inventory.Record{ID: row.ID, DealerID: row.DealerID, Revision: row.Revision, Status: row.Status})
	if err != nil {
		return inventory.Publication{}, err
	}
	if publication == nil {
		return inventory.Publication{}, ports.ErrNotFound
	}
	return *publication, nil
}

func (r *Repository) ReadPublicProfile(ctx context.Context, slug string) (domain.Profile, error) {
	if !publicLookup(slug, 80) {
		return domain.Profile{}, ports.ErrNotFound
	}
	var result domain.Profile
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		showroom, err := lockPublicShowroom(tx, slug)
		if err != nil {
			return err
		}
		result, err = showroom.Profile()
		return err
	})
	if err != nil {
		return domain.Profile{}, publicReadError(err)
	}
	return result, nil
}

func (r *Repository) ReadPublicListing(ctx context.Context, slug, id string) (app.Listing, error) {
	if !publicLookup(slug, 80) || !publicLookup(id, 128) {
		return app.Listing{}, ports.ErrNotFound
	}
	var result app.Listing
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		showroom, err := lockPublicShowroom(tx, slug)
		if err != nil {
			return err
		}
		publication, err := readPublicPublication(tx, showroom, id)
		if err != nil {
			return err
		}
		result.Piano, err = showroom.Listing(publication)
		if err != nil {
			return err
		}
		result.Profile, err = showroom.Profile()
		return err
	})
	if err != nil {
		return app.Listing{}, publicReadError(err)
	}
	return result, nil
}

func (r *Repository) ReadPublicPhoto(ctx context.Context, slug, id, photoID string) (ports.ProcessedPhoto, error) {
	if !publicLookup(slug, 80) || !publicLookup(id, 128) || !publicLookup(photoID, 128) {
		return ports.ProcessedPhoto{}, ports.ErrNotFound
	}
	var result ports.ProcessedPhoto
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		showroom, err := lockPublicShowroom(tx, slug)
		if err != nil {
			return err
		}
		publication, err := readPublicPublication(tx, showroom, id)
		if err != nil {
			return err
		}
		if _, err = showroom.Photo(publication, photoID); err != nil {
			return err
		}
		profile, err := showroom.Profile()
		if err != nil {
			return err
		}
		var asset photoAssetModel
		if err := tx.Where("id=? AND record_id=? AND dealer_id=?", photoID, id, profile.ID).Take(&asset).Error; err != nil {
			return err
		}
		result = ports.ProcessedPhoto{JPEG: asset.JPEG, Width: asset.Width, Height: asset.Height, SHA256: asset.SHA256}
		if !validPhotoImage(result) {
			return ports.ErrInvalidArgument
		}
		return nil
	})
	if err != nil {
		return ports.ProcessedPhoto{}, publicReadError(err)
	}
	return result, nil
}
