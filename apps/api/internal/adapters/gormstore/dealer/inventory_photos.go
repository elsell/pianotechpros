package dealerstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image/jpeg"
	"strings"
	"time"
	"unicode/utf8"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var _ app.PhotoRepository = (*Repository)(nil)

type photoAssetModel struct {
	ID, RecordID, DealerID string
	JPEG                   []byte `gorm:"column:jpeg"`
	SHA256                 string `gorm:"column:sha256"`
	Width, Height          int
	CreatedAt              time.Time
}

func (photoAssetModel) TableName() string { return "inventory_photo_assets" }

type photoReferenceModel struct {
	RecordID, DealerID, PhotoID string
	Position                    int
	AltText                     string
}

func (photoReferenceModel) TableName() string { return "inventory_photo_references" }

func validPhotoImage(p ports.ProcessedPhoto) bool {
	if len(p.JPEG) == 0 || len(p.JPEG) > 20<<20 || p.Width < 1 || p.Height < 1 || p.Width > 10000 || p.Height > 10000 || int64(p.Width)*int64(p.Height) > 25000000 {
		return false
	}
	hash := sha256.Sum256(p.JPEG)
	if p.SHA256 != hex.EncodeToString(hash[:]) {
		return false
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(p.JPEG))
	return err == nil && config.Width == p.Width && config.Height == p.Height
}
func validPhotoKey(key string) bool {
	if len(key) < 16 || len(key) > 128 {
		return false
	}
	for _, b := range []byte(key) {
		if b < 33 || b > 126 {
			return false
		}
	}
	return true
}
func photoCollection(tx *gorm.DB, record domain.Record) (domain.PhotoCollection, error) {
	var refs []photoReferenceModel
	if err := tx.Where("record_id=? AND dealer_id=?", record.ID, record.DealerID).Order("position").Limit(51).Find(&refs).Error; err != nil {
		return domain.PhotoCollection{}, err
	}
	photos := make([]domain.PhotoEvidence, 0, len(refs))
	for i, ref := range refs {
		if ref.Position != i {
			return domain.PhotoCollection{}, ports.ErrInvalidArgument
		}
		photos = append(photos, domain.PhotoEvidence{ID: ref.PhotoID, RecordID: ref.RecordID, DealerID: ref.DealerID, Ready: true, AltText: ref.AltText})
	}
	return domain.RestorePhotos(record.ID, record.DealerID, photos)
}
func photoState(tx *gorm.DB, dealerID, id string) (app.PhotoState, error) {
	record, err := inventoryRead(tx, dealerID, id)
	if err != nil {
		return app.PhotoState{}, err
	}
	collection, err := photoCollection(tx, record)
	if err != nil {
		return app.PhotoState{}, err
	}
	return app.PhotoState{Record: record, Photos: collection.Evidence()}, nil
}

func (r *Repository) StorePhoto(ctx context.Context, actor, dealerID, id string, upload app.PhotoUpload, event audit.Event) (app.PhotoUploadResult, error) {
	if dealerID == "" || !inventoryEventValid(event, actor, id, audit.ResourceUpdated) || !validPhotoKey(upload.Key) || !validPhotoImage(upload.Image) || !utf8.ValidString(upload.ID) || upload.ID == "" || strings.TrimSpace(upload.ID) != upload.ID || utf8.RuneCountInString(upload.ID) > 128 || upload.ExpectedRevision < 1 || upload.ExpectedRevision > 9007199254740991 {
		return app.PhotoUploadResult{}, ports.ErrInvalidArgument
	}
	var result app.PhotoUploadResult
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.ManageInventory)
		if err != nil {
			return err
		}
		if owner != event.OwnerUserID {
			return ports.ErrInvalidArgument
		}
		current, err := inventoryRead(tx.Clauses(clause.Locking{Strength: "UPDATE"}), dealerID, id)
		if err != nil {
			return err
		}
		request, _ := json.Marshal(struct {
			Digest   string
			Revision int64
		}{upload.Image.SHA256, upload.ExpectedRevision})
		hash := sha256.Sum256(request)
		reservation := idempotencyModel{PrincipalID: actor, Operation: "inventory.photo:" + id, Key: upload.Key, RequestHash: hash[:], ResourceID: upload.ID, CreatedAt: event.OccurredAt}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reservation)
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 0 {
			var existing idempotencyModel
			if err := tx.Where("principal_id=? AND operation=? AND key=?", actor, reservation.Operation, upload.Key).First(&existing).Error; err != nil {
				return err
			}
			if !bytes.Equal(existing.RequestHash, hash[:]) {
				return ports.ErrIdempotencyConflict
			}
			var asset photoAssetModel
			if err := tx.Select("id").Where("id=? AND record_id=? AND dealer_id=?", existing.ResourceID, id, dealerID).First(&asset).Error; err != nil {
				return err
			}
			state, err := photoState(tx, dealerID, id)
			if err != nil {
				return err
			}
			event.Action = audit.ResourceViewed
			if err := tx.Create(fromAudit(event)).Error; err != nil {
				return err
			}
			result = app.PhotoUploadResult{State: state, PhotoID: asset.ID, Replay: true}
			return nil
		}
		collection, err := photoCollection(tx, current)
		if err != nil {
			return err
		}
		next, photos, history, err := current.AttachPhoto(collection, domain.PhotoEvidence{ID: upload.ID, RecordID: id, DealerID: dealerID, Ready: true}, upload.ExpectedRevision, actor, event.OccurredAt)
		if errors.Is(err, domain.ErrConflict) {
			return ports.ErrConflict
		}
		if err != nil {
			return err
		}
		asset := photoAssetModel{ID: upload.ID, RecordID: id, DealerID: dealerID, JPEG: upload.Image.JPEG, SHA256: upload.Image.SHA256, Width: upload.Image.Width, Height: upload.Image.Height, CreatedAt: event.OccurredAt}
		if err := tx.Create(&asset).Error; err != nil {
			return err
		}
		reference := photoReferenceModel{RecordID: id, DealerID: dealerID, PhotoID: upload.ID, Position: len(photos.Evidence()) - 1}
		if err := tx.Create(&reference).Error; err != nil {
			return err
		}
		updated := tx.Model(&inventoryRecordModel{}).Where("id=? AND dealer_id=? AND revision=?", id, dealerID, upload.ExpectedRevision).Updates(map[string]any{"revision": next.Revision, "updated_at": next.UpdatedAt})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ports.ErrConflict
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		state := app.PhotoState{Record: next, Photos: photos.Evidence()}
		snapshot, err := json.Marshal(state)
		if err != nil {
			return err
		}
		row := inventoryHistoryModel{RecordID: id, DealerID: dealerID, Revision: next.Revision, ActorUserID: actor, Source: string(history.Source), Kind: history.Kind, Snapshot: snapshot, AuditID: event.ID, CreatedAt: history.At}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		result = app.PhotoUploadResult{State: state, PhotoID: upload.ID}
		return nil
	})
	if err != nil {
		return app.PhotoUploadResult{}, inventoryError(err)
	}
	return result, nil
}

func (r *Repository) GetPhotos(ctx context.Context, actor, dealerID, id string, event audit.Event) (app.PhotoState, error) {
	if dealerID == "" || !inventoryEventValid(event, actor, id, audit.ResourceViewed) {
		return app.PhotoState{}, ports.ErrInvalidArgument
	}
	var result app.PhotoState
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.View)
		if err != nil {
			return err
		}
		if owner != event.OwnerUserID {
			return ports.ErrInvalidArgument
		}
		result, err = photoState(tx, dealerID, id)
		if err != nil {
			return err
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return app.PhotoState{}, inventoryError(err)
	}
	return result, nil
}
func (r *Repository) GetPhoto(ctx context.Context, actor, dealerID, id, photoID string, event audit.Event) (ports.ProcessedPhoto, error) {
	if dealerID == "" || photoID == "" || !inventoryEventValid(event, actor, id, audit.ResourceViewed) {
		return ports.ProcessedPhoto{}, ports.ErrInvalidArgument
	}
	var result ports.ProcessedPhoto
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.View)
		if err != nil {
			return err
		}
		if owner != event.OwnerUserID {
			return ports.ErrInvalidArgument
		}
		var asset photoAssetModel
		if err := tx.Table("inventory_photo_assets AS a").Select("a.*").Joins("JOIN inventory_photo_references ref ON ref.photo_id=a.id AND ref.record_id=a.record_id AND ref.dealer_id=a.dealer_id").Where("a.id=? AND a.record_id=? AND a.dealer_id=?", photoID, id, dealerID).Take(&asset).Error; err != nil {
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
