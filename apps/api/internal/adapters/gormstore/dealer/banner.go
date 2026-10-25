package dealerstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var _ app.BannerRepository = (*Repository)(nil)

type bannerAssetModel struct {
	ID, DealerID  string
	JPEG          []byte `gorm:"column:jpeg"`
	SHA256        string `gorm:"column:sha256"`
	Width, Height int
	CreatedAt     time.Time
}

func (bannerAssetModel) TableName() string { return "dealer_banner_assets" }
func bannerEvidence(row bannerAssetModel) (domain.Banner, error) {
	return domain.NewBanner(domain.ID(row.DealerID), row.ID, row.Width, row.Height, row.SHA256, row.CreatedAt)
}
func bannerState(tx *gorm.DB, id domain.ID) (domain.BannerState, error) {
	var row model
	if err := tx.Where("id=?", id).Take(&row).Error; err != nil {
		return domain.BannerState{}, err
	}
	state := domain.BannerState{Dealer: toEntity(row)}
	var asset bannerAssetModel
	err := tx.Select("id", "dealer_id", "sha256", "width", "height", "created_at").Where("dealer_id=?", id).Take(&asset).Error
	if err == nil {
		b, e := bannerEvidence(asset)
		if e != nil {
			return domain.BannerState{}, e
		}
		state.Banner = &b
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.BannerState{}, err
	}
	if !state.ValidFor(id) {
		return domain.BannerState{}, ports.ErrInvalidArgument
	}
	return state, nil
}
func bannerEventValid(e audit.Event, actor string, id domain.ID, action audit.Action) bool {
	return actor != "" && id != "" && e.Valid() && e.ActorUserID == actor && e.TargetType == "dealer" && e.TargetID == string(id) && e.Action == action && e.Outcome == audit.Succeeded
}
func bannerAuthority(tx *gorm.DB, actor string, id domain.ID, e audit.Event, capability domain.Capability) error {
	owner, err := lockInventoryAuthority(tx, actor, string(id), capability)
	if err != nil {
		return err
	}
	if owner != e.OwnerUserID {
		return ports.ErrInvalidArgument
	}
	return nil
}
func (r *Repository) ReadBannerState(ctx context.Context, actor string, id domain.ID, event audit.Event) (domain.BannerState, error) {
	if !bannerEventValid(event, actor, id, audit.ResourceViewed) {
		return domain.BannerState{}, ports.ErrInvalidArgument
	}
	var result domain.BannerState
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := bannerAuthority(tx, actor, id, event, domain.View); err != nil {
			return err
		}
		var err error
		result, err = bannerState(tx, id)
		if err != nil {
			return err
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return domain.BannerState{}, inventoryError(err)
	}
	return result, nil
}
func (r *Repository) ReadBannerImage(ctx context.Context, actor string, id domain.ID, assetID string, event audit.Event) (ports.ProcessedPhoto, error) {
	if !bannerEventValid(event, actor, id, audit.ResourceViewed) {
		return ports.ProcessedPhoto{}, ports.ErrInvalidArgument
	}
	var result ports.ProcessedPhoto
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := bannerAuthority(tx, actor, id, event, domain.View); err != nil {
			return err
		}
		var asset bannerAssetModel
		if err := tx.Where("dealer_id=? AND id=?", id, assetID).Take(&asset).Error; err != nil {
			return err
		}
		if _, err := bannerEvidence(asset); err != nil {
			return err
		}
		result = ports.ProcessedPhoto{JPEG: asset.JPEG, Width: asset.Width, Height: asset.Height, SHA256: asset.SHA256}
		if !validPhotoImage(result) {
			return ports.ErrInvalidArgument
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return ports.ProcessedPhoto{}, inventoryError(err)
	}
	return result, nil
}
func (r *Repository) ReplaceBanner(ctx context.Context, actor string, id domain.ID, upload app.BannerUpload, event audit.Event) (app.BannerUploadResult, error) {
	if !bannerEventValid(event, actor, id, audit.ResourceUpdated) || !validPhotoKey(upload.Key) || !validPhotoImage(upload.Image) || upload.ExpectedRevision < 1 || upload.ExpectedRevision >= 9007199254740991 {
		return app.BannerUploadResult{}, ports.ErrInvalidArgument
	}
	evidence, err := domain.NewBanner(id, upload.ID, upload.Image.Width, upload.Image.Height, upload.Image.SHA256, event.OccurredAt)
	if err != nil {
		return app.BannerUploadResult{}, ports.ErrInvalidArgument
	}
	var result app.BannerUploadResult
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := bannerAuthority(tx, actor, id, event, domain.ManageProfile); err != nil {
			return err
		}
		state, err := bannerState(tx, id)
		if err != nil {
			return err
		}
		request, _ := json.Marshal(struct {
			Digest   string
			Revision int64
		}{upload.Image.SHA256, upload.ExpectedRevision})
		hash := sha256.Sum256(request)
		reservation := idempotencyModel{PrincipalID: actor, Operation: "dealer.banner:" + string(id), Key: upload.Key, RequestHash: hash[:], ResourceID: upload.ID, CreatedAt: event.OccurredAt}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reservation)
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 0 {
			var prior idempotencyModel
			if err := tx.Where("principal_id=? AND operation=? AND key=?", actor, reservation.Operation, upload.Key).Take(&prior).Error; err != nil {
				return err
			}
			if !bytes.Equal(prior.RequestHash, hash[:]) {
				return ports.ErrIdempotencyConflict
			}
			replayEvent := event
			replayEvent.Action = audit.ResourceViewed
			if err := tx.Create(fromAudit(replayEvent)).Error; err != nil {
				return err
			}
			result = app.BannerUploadResult{State: state, BannerID: prior.ResourceID, Replay: true}
			return nil
		}
		if state.Dealer.Revision != upload.ExpectedRevision {
			return ports.ErrConflict
		}
		if event.OccurredAt.Before(state.Dealer.UpdatedAt) {
			return ports.ErrInvalidArgument
		}
		if err := tx.Where("dealer_id=?", id).Delete(&bannerAssetModel{}).Error; err != nil {
			return err
		}
		asset := bannerAssetModel{ID: evidence.ID, DealerID: string(id), JPEG: upload.Image.JPEG, SHA256: evidence.SHA256, Width: evidence.Width, Height: evidence.Height, CreatedAt: evidence.CreatedAt}
		if err := tx.Create(&asset).Error; err != nil {
			return err
		}
		changed := tx.Model(&model{}).Where("id=? AND revision=?", id, upload.ExpectedRevision).Updates(map[string]any{"revision": upload.ExpectedRevision + 1, "updated_at": event.OccurredAt})
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			return ports.ErrConflict
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		state.Dealer.Revision++
		state.Dealer.UpdatedAt = event.OccurredAt
		state.Banner = &evidence
		result = app.BannerUploadResult{State: state, BannerID: upload.ID}
		return nil
	})
	if err != nil {
		return app.BannerUploadResult{}, inventoryError(err)
	}
	return result, nil
}
func (r *Repository) RemoveBanner(ctx context.Context, actor string, id domain.ID, expected int64, event audit.Event) (domain.BannerState, error) {
	if !bannerEventValid(event, actor, id, audit.ResourceUpdated) || expected < 1 || expected >= 9007199254740991 {
		return domain.BannerState{}, ports.ErrInvalidArgument
	}
	var result domain.BannerState
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := bannerAuthority(tx, actor, id, event, domain.ManageProfile); err != nil {
			return err
		}
		state, err := bannerState(tx, id)
		if err != nil {
			return err
		}
		if state.Dealer.Revision != expected {
			return ports.ErrConflict
		}
		if state.Banner == nil {
			return ports.ErrNotFound
		}
		if event.OccurredAt.Before(state.Dealer.UpdatedAt) {
			return ports.ErrInvalidArgument
		}
		removed := tx.Where("dealer_id=? AND id=?", id, state.Banner.ID).Delete(&bannerAssetModel{})
		if removed.Error != nil {
			return removed.Error
		}
		if removed.RowsAffected != 1 {
			return ports.ErrConflict
		}
		changed := tx.Model(&model{}).Where("id=? AND revision=?", id, expected).Updates(map[string]any{"revision": expected + 1, "updated_at": event.OccurredAt})
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			return ports.ErrConflict
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		state.Dealer.Revision++
		state.Dealer.UpdatedAt = event.OccurredAt
		state.Banner = nil
		result = state
		return nil
	})
	if err != nil {
		return domain.BannerState{}, inventoryError(err)
	}
	return result, nil
}
