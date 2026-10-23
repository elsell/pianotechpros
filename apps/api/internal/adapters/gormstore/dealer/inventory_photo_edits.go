package dealerstore

import (
	"context"
	"encoding/json"
	"errors"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func commitPhotoState(tx *gorm.DB, state app.PhotoState, history domain.History, event audit.Event) error {
	next := state.Record
	updated := tx.Model(&inventoryRecordModel{}).Where("id=? AND dealer_id=? AND revision=?", next.ID, next.DealerID, next.Revision-1).Updates(map[string]any{"revision": next.Revision, "updated_at": next.UpdatedAt})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return ports.ErrConflict
	}
	if err := tx.Create(fromAudit(event)).Error; err != nil {
		return err
	}
	snapshot, err := json.Marshal(state)
	if err != nil {
		return err
	}
	row := inventoryHistoryModel{RecordID: next.ID, DealerID: next.DealerID, Revision: next.Revision, ActorUserID: history.ActorID, Source: string(history.Source), Kind: history.Kind, Snapshot: snapshot, AuditID: event.ID, CreatedAt: history.At}
	return tx.Create(&row).Error
}

type photoEdit func(domain.Record, domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error)

func (r *Repository) editPhotos(ctx context.Context, actor, dealerID, id string, event audit.Event, edit photoEdit) (app.PhotoState, error) {
	if dealerID == "" || !inventoryEventValid(event, actor, id, audit.ResourceUpdated) {
		return app.PhotoState{}, ports.ErrInvalidArgument
	}
	var result app.PhotoState
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
		collection, err := photoCollection(tx, current)
		if err != nil {
			return err
		}
		next, photos, history, err := edit(current, collection)
		if errors.Is(err, domain.ErrConflict) {
			return ports.ErrConflict
		}
		if errors.Is(err, domain.ErrNoChange) {
			event.Action = audit.ResourceViewed
			if err := tx.Create(fromAudit(event)).Error; err != nil {
				return err
			}
			result = app.PhotoState{Record: current, Photos: collection.Evidence()}
			return nil
		}
		if err != nil {
			return err
		}
		// Replace only draft references within the locked transaction. Assets remain immutable.
		if err := tx.Where("record_id=? AND dealer_id=?", id, dealerID).Delete(&photoReferenceModel{}).Error; err != nil {
			return err
		}
		evidence := photos.Evidence()
		refs := make([]photoReferenceModel, 0, len(evidence))
		for i, p := range evidence {
			refs = append(refs, photoReferenceModel{RecordID: id, DealerID: dealerID, PhotoID: p.ID, Position: i, AltText: p.AltText})
		}
		if len(refs) > 0 {
			if err := tx.Create(&refs).Error; err != nil {
				return err
			}
		}
		result = app.PhotoState{Record: next, Photos: evidence}
		return commitPhotoState(tx, result, history, event)
	})
	if err != nil {
		return app.PhotoState{}, inventoryError(err)
	}
	return result, nil
}
func (r *Repository) ReorderPhotos(ctx context.Context, actor, dealerID, id string, ids []string, expected int64, event audit.Event) (app.PhotoState, error) {
	return r.editPhotos(ctx, actor, dealerID, id, event, func(record domain.Record, photos domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error) {
		return record.ReorderPhotos(photos, ids, expected, actor, event.OccurredAt)
	})
}
func (r *Repository) DescribePhoto(ctx context.Context, actor, dealerID, id, photoID, alt string, expected int64, event audit.Event) (app.PhotoState, error) {
	return r.editPhotos(ctx, actor, dealerID, id, event, func(record domain.Record, photos domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error) {
		return record.DescribePhoto(photos, photoID, alt, expected, actor, event.OccurredAt)
	})
}
func (r *Repository) RemovePhoto(ctx context.Context, actor, dealerID, id, photoID string, expected int64, event audit.Event) (app.PhotoState, error) {
	return r.editPhotos(ctx, actor, dealerID, id, event, func(record domain.Record, photos domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error) {
		return record.RemovePhoto(photos, photoID, expected, actor, event.OccurredAt)
	})
}
