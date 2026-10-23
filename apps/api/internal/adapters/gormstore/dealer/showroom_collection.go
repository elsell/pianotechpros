package dealerstore

import (
	"context"
	"strings"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

var _ app.CollectionRepository = (*Repository)(nil)

func (r *Repository) ListPublicPianos(ctx context.Context, slug string, query domain.Query) (app.Page, error) {
	q, err := domain.ValidateQuery(query)
	if err != nil {
		return app.Page{}, err
	}
	if !publicLookup(slug, 80) {
		return app.Page{}, ports.ErrNotFound
	}
	var result app.Page
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		showroom, err := lockPublicShowroom(tx, slug)
		if err != nil {
			return err
		}
		result.Profile, err = showroom.Profile()
		if err != nil {
			return err
		}
		// All inventory writes lock the dealer row exclusively. Hold its shared
		// lock through selection and validation to keep one visibility decision.
		selection := tx.Table("inventory_publications AS p").
			Joins("JOIN inventory_publication_snapshots AS s ON s.record_id=p.record_id AND s.dealer_id=p.dealer_id AND s.revision=p.publication_revision").
			Where("p.dealer_id=? AND p.visible", result.Profile.ID)
		switch q.Availability {
		case "":
			selection = selection.Where("p.status IN ?", []string{"available", "reserved"})
		case "all":
			selection = selection.Where("p.status IN ?", []string{"available", "reserved", "sold"})
		default:
			selection = selection.Where("p.status=?", q.Availability)
		}
		if q.Form != "" {
			selection = selection.Where("s.snapshot->>'Form'=?", string(q.Form))
		}
		if q.Search != "" {
			literal := "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(q.Search) + "%"
			selection = selection.Where("(s.snapshot->>'StockNumber' ILIKE ? OR s.snapshot->>'Title' ILIKE ? OR s.snapshot->>'Make' ILIKE ? OR s.snapshot->>'Model' ILIKE ?)", literal, literal, literal, literal)
		}
		if q.Currency != "" {
			selection = selection.Where("s.snapshot->'Price'->>'Currency'=?", q.Currency)
		}
		if q.MinPrice != nil {
			selection = selection.Where("(s.snapshot->'Price'->>'MinorUnits')::bigint>=?", *q.MinPrice)
		}
		if q.MaxPrice != nil {
			selection = selection.Where("(s.snapshot->'Price'->>'MinorUnits')::bigint<=?", *q.MaxPrice)
		}
		if q.AfterID != "" {
			selection = selection.Where("((s.snapshot->>'Featured')::boolean < ? OR ((s.snapshot->>'Featured')::boolean = ? AND p.record_id > ?))", q.AfterFeatured, q.AfterFeatured, q.AfterID)
		}
		var ids []string
		if err := selection.Order("(s.snapshot->>'Featured')::boolean DESC, p.record_id ASC").Limit(q.Limit+1).Pluck("p.record_id", &ids).Error; err != nil {
			return err
		}
		result.HasMore = len(ids) > q.Limit
		if result.HasMore {
			ids = ids[:q.Limit]
		}
		result.Pianos = make([]inventory.PublicListing, 0, len(ids))
		for _, id := range ids {
			publication, err := readPublicPublication(tx, showroom, id)
			if err != nil {
				return err
			}
			piano, err := showroom.Listing(publication)
			if err != nil {
				return err
			}
			result.Pianos = append(result.Pianos, piano)
		}
		return nil
	})
	if err != nil {
		return app.Page{}, publicReadError(err)
	}
	return result, nil
}
