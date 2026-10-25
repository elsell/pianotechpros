package dealerstore

import (
	"context"
	"encoding/json"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var _ app.DiscoveryRepository = (*Repository)(nil)

func (r *Repository) ReadPublicDirectory(ctx context.Context) ([]app.DiscoveryShop, error) {
	var result []app.DiscoveryShop
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var rows []model
		if err := tx.Where("showroom_published").Order("id").Limit(app.DiscoveryLimit + 1).Clauses(clause.Locking{Strength: "SHARE"}).Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) > app.DiscoveryLimit {
			return ports.ErrInvalidArgument
		}
		result = make([]app.DiscoveryShop, 0, len(rows))
		for _, row := range rows {
			showroom, err := domain.New(toEntity(row))
			if err != nil {
				return err
			}
			profile, err := showroom.Profile()
			if err != nil {
				return err
			}
			result = append(result, app.DiscoveryShop{ID: profile.ID, Slug: profile.Slug, Name: profile.Name})
		}
		return nil
	})
	if err != nil {
		return nil, publicReadError(err)
	}
	return result, nil
}

type discoveryPublicationRow struct {
	RecordID, DealerID                                   string
	PublicationRevision, AppliedRevision, RecordRevision int64
	Status, RecordStatus                                 inventory.Status
	Snapshot                                             json.RawMessage
}

func (r *Repository) ReadPublicCatalog(ctx context.Context, slug string) (app.DiscoveryCatalog, error) {
	if !publicLookup(slug, 80) {
		return app.DiscoveryCatalog{}, ports.ErrNotFound
	}
	var result app.DiscoveryCatalog
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		showroom, err := lockPublicShowroom(tx, slug)
		if err != nil {
			return err
		}
		profile, err := showroom.Profile()
		if err != nil {
			return err
		}
		result.Shop = app.DiscoveryShop{ID: profile.ID, Slug: profile.Slug, Name: profile.Name}
		// Dealer shared lock serializes all publication/record writes. Validate and
		// decode the same evidence as ordinary public reads, in bounded batches.
		query := func() *gorm.DB {
			return tx.Table("inventory_publications AS p").
				Joins("LEFT JOIN inventory_publication_snapshots AS s ON s.record_id=p.record_id AND s.dealer_id=p.dealer_id AND s.revision=p.publication_revision").
				Joins("LEFT JOIN inventory_records AS r ON r.id=p.record_id AND r.dealer_id=p.dealer_id").
				Where("p.dealer_id=? AND p.visible", profile.ID)
		}
		var budget struct{ Count, Bytes int64 }
		if err := tx.Table("(?) AS bounded", query().Select("s.snapshot").Limit(app.DiscoveryLimit+1)).Select("count(*) AS count, coalesce(sum(octet_length(snapshot::text)),0) AS bytes").Scan(&budget).Error; err != nil {
			return err
		}
		if budget.Count > app.DiscoveryLimit || budget.Bytes > 32*1024*1024 {
			return ports.ErrInvalidArgument
		}
		var rows []discoveryPublicationRow
		if err := query().Select("p.record_id,p.dealer_id,p.publication_revision,p.applied_revision,p.status,r.revision AS record_revision,r.status AS record_status,s.snapshot").Order("p.record_id").Limit(app.DiscoveryLimit + 1).Scan(&rows).Error; err != nil {
			return err
		}
		if len(rows) > app.DiscoveryLimit || int64(len(rows)) != budget.Count {
			return ports.ErrInvalidArgument
		}
		var references []publicationPhotoModel
		if err := tx.Table("inventory_publication_photos AS f").Select("f.*").
			Joins("JOIN inventory_publications AS p ON p.record_id=f.record_id AND p.dealer_id=f.dealer_id AND p.publication_revision=f.publication_revision").
			Where("p.dealer_id=? AND p.visible", profile.ID).Limit(app.DiscoveryLimit*50 + 1).Scan(&references).Error; err != nil {
			return err
		}
		if len(references) > app.DiscoveryLimit*50 {
			return ports.ErrInvalidArgument
		}
		byRecord := map[string][]publicationPhotoModel{}
		for _, ref := range references {
			byRecord[ref.RecordID] = append(byRecord[ref.RecordID], ref)
		}
		result.Pianos = make([]app.DiscoveryPiano, 0, len(rows))
		for _, row := range rows {
			record := inventory.Record{ID: row.RecordID, DealerID: row.DealerID, Revision: row.RecordRevision, Status: row.RecordStatus}
			pointer := publicationPointerModel{RecordID: row.RecordID, DealerID: row.DealerID, PublicationRevision: row.PublicationRevision, AppliedRevision: row.AppliedRevision, Status: row.Status, Visible: true}
			snapshot := publicationSnapshotModel{RecordID: row.RecordID, DealerID: row.DealerID, Revision: row.PublicationRevision, Snapshot: row.Snapshot}
			publication, err := restoreStoredPublication(record, pointer, snapshot, byRecord[row.RecordID])
			if err != nil {
				return err
			}
			listing, err := showroom.Listing(*publication)
			if err != nil {
				return err
			}
			result.Pianos = append(result.Pianos, app.DiscoveryPiano{ID: listing.ID, DealerID: listing.DealerID, Title: listing.Title})
		}
		return nil
	})
	if err != nil {
		return app.DiscoveryCatalog{}, publicReadError(err)
	}
	return result, nil
}
