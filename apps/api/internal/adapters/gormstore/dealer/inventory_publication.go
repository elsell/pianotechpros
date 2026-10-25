package dealerstore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var _ app.PublicationRepository = (*Repository)(nil)

type publicationSnapshotModel struct {
	RecordID, DealerID string
	Revision           int64
	Snapshot           json.RawMessage `gorm:"type:jsonb"`
}

func (publicationSnapshotModel) TableName() string { return "inventory_publication_snapshots" }

type publicationPhotoModel struct {
	RecordID, DealerID  string
	PublicationRevision int64
	PhotoID             string
}

func (publicationPhotoModel) TableName() string { return "inventory_publication_photos" }

type publicationPointerModel struct {
	RecordID                             string `gorm:"primaryKey"`
	DealerID                             string
	PublicationRevision, AppliedRevision int64
	Visible                              bool
	Status                               domain.Status
}

func (publicationPointerModel) TableName() string { return "inventory_publications" }

func readPublication(tx *gorm.DB, record domain.Record) (*domain.Publication, error) {
	var pointer publicationPointerModel
	err := tx.Where("record_id=? AND dealer_id=?", record.ID, record.DealerID).Take(&pointer).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if pointer.AppliedRevision > record.Revision || pointer.Status != record.Status {
		return nil, ports.ErrInvalidArgument
	}
	var snapshot publicationSnapshotModel
	if err := tx.Where("record_id=? AND dealer_id=? AND revision=?", record.ID, record.DealerID, pointer.PublicationRevision).Take(&snapshot).Error; err != nil {
		return nil, err
	}
	var references []publicationPhotoModel
	if err := tx.Where("record_id=? AND dealer_id=? AND publication_revision=?", record.ID, record.DealerID, snapshot.Revision).Find(&references).Error; err != nil {
		return nil, err
	}
	return restoreStoredPublication(record, pointer, snapshot, references)
}

// restoreStoredPublication validates identical evidence for individual and batched public reads.
func restoreStoredPublication(record domain.Record, pointer publicationPointerModel, snapshot publicationSnapshotModel, references []publicationPhotoModel) (*domain.Publication, error) {
	if pointer.RecordID != record.ID || pointer.DealerID != record.DealerID || pointer.AppliedRevision > record.Revision || pointer.Status != record.Status || snapshot.RecordID != record.ID || snapshot.DealerID != record.DealerID || snapshot.Revision != pointer.PublicationRevision {
		return nil, ports.ErrInvalidArgument
	}
	var listing domain.PublicListing
	// SQL collection ordering and the decoded continuation flag must agree.
	// A missing/null bool otherwise decodes to false but sorts as SQL NULL.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(snapshot.Snapshot, &fields); err != nil {
		return nil, ports.ErrInvalidArgument
	}
	var featured *bool
	if err := json.Unmarshal(fields["Featured"], &featured); err != nil || featured == nil {
		return nil, ports.ErrInvalidArgument
	}
	for key := range fields {
		if key != "Featured" && strings.EqualFold(key, "Featured") {
			return nil, ports.ErrInvalidArgument
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(snapshot.Snapshot))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&listing); err != nil {
		return nil, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, ports.ErrInvalidArgument
	}
	if listing.Featured != *featured || listing.ID != record.ID || listing.DealerID != record.DealerID || listing.PublicationRevision != snapshot.Revision {
		return nil, ports.ErrInvalidArgument
	}
	// The immutable snapshot itself must describe a legitimate visible publication.
	if _, err := domain.RestorePublication(domain.PublicationState{Snapshot: listing, Visible: true, AppliedRevision: snapshot.Revision}); err != nil {
		return nil, err
	}
	ids := make(map[string]bool, len(references))
	for _, ref := range references {
		ids[ref.PhotoID] = true
	}
	if len(ids) != len(listing.Photos) {
		return nil, ports.ErrInvalidArgument
	}
	for _, photo := range listing.Photos {
		if !ids[photo.ID] {
			return nil, ports.ErrInvalidArgument
		}
	}
	listing.Status = pointer.Status
	publication, err := domain.RestorePublication(domain.PublicationState{Snapshot: listing, Visible: pointer.Visible, AppliedRevision: pointer.AppliedRevision})
	if err != nil {
		return nil, err
	}
	return &publication, nil
}

func (r *Repository) GetPublication(ctx context.Context, actor, dealerID, id string, event audit.Event) (app.PublicationState, error) {
	if dealerID == "" || !inventoryEventValid(event, actor, id, audit.ResourceViewed) {
		return app.PublicationState{}, ports.ErrInvalidArgument
	}
	var result app.PublicationState
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.View)
		if err != nil {
			return err
		}
		if owner != event.OwnerUserID {
			return ports.ErrInvalidArgument
		}
		result.Record, err = inventoryRead(tx, dealerID, id)
		if err != nil {
			return err
		}
		result.Publication, err = readPublication(tx, result.Record)
		if err != nil {
			return err
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return app.PublicationState{}, inventoryError(err)
	}
	return result, nil
}

type publicationCommand func(*gorm.DB, domain.Record, *domain.Publication) (domain.Record, *domain.Publication, domain.History, error)

func (r *Repository) changePublication(ctx context.Context, actor, dealerID, id string, event audit.Event, capability dealer.Capability, command publicationCommand) (app.PublicationState, error) {
	if dealerID == "" || !inventoryEventValid(event, actor, id, audit.ResourceUpdated) {
		return app.PublicationState{}, ports.ErrInvalidArgument
	}
	var result app.PublicationState
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, capability)
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
		prior, err := readPublication(tx, current)
		if err != nil {
			return err
		}
		next, publication, history, err := command(tx, current, prior)
		if err != nil {
			return err
		}
		changed := tx.Model(&inventoryRecordModel{}).Where("id=? AND dealer_id=? AND revision=?", id, dealerID, current.Revision).Updates(map[string]any{"revision": next.Revision, "status": next.Status, "updated_at": next.UpdatedAt})
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			return ports.ErrConflict
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		var state *domain.PublicationState
		if publication != nil {
			copy := publication.State()
			state = &copy
		}
		payload, err := json.Marshal(struct {
			Record      domain.Record
			Event       domain.History
			Publication *domain.PublicationState
		}{next, history, state})
		if err != nil {
			return err
		}
		row := inventoryHistoryModel{RecordID: id, DealerID: dealerID, Revision: next.Revision, ActorUserID: actor, Source: string(history.Source), Kind: history.Kind, Snapshot: payload, AuditID: event.ID, CreatedAt: history.At}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		if state != nil {
			if history.Kind == "publish" {
				encoded, err := json.Marshal(state.Snapshot)
				if err != nil {
					return err
				}
				if err := tx.Create(&publicationSnapshotModel{RecordID: id, DealerID: dealerID, Revision: next.Revision, Snapshot: encoded}).Error; err != nil {
					return err
				}
				refs := make([]publicationPhotoModel, 0, len(state.Snapshot.Photos))
				for _, photo := range state.Snapshot.Photos {
					refs = append(refs, publicationPhotoModel{RecordID: id, DealerID: dealerID, PublicationRevision: next.Revision, PhotoID: photo.ID})
				}
				if err := tx.Create(&refs).Error; err != nil {
					return err
				}
			}
			pointer := publicationPointerModel{RecordID: id, DealerID: dealerID, PublicationRevision: state.Snapshot.PublicationRevision, AppliedRevision: state.AppliedRevision, Visible: state.Visible, Status: state.Snapshot.Status}
			if prior == nil {
				if err := tx.Create(&pointer).Error; err != nil {
					return err
				}
			} else {
				changed := tx.Model(&publicationPointerModel{}).Where("record_id=? AND dealer_id=? AND applied_revision=?", id, dealerID, prior.State().AppliedRevision).Updates(map[string]any{"publication_revision": pointer.PublicationRevision, "applied_revision": pointer.AppliedRevision, "visible": pointer.Visible, "status": pointer.Status})
				if changed.Error != nil {
					return changed.Error
				}
				if changed.RowsAffected != 1 {
					return ports.ErrConflict
				}
			}
		}
		result = app.PublicationState{Record: next, Publication: publication}
		return nil
	})
	if errors.Is(err, domain.ErrConflict) {
		err = ports.ErrConflict
	}
	if err != nil {
		return app.PublicationState{}, inventoryError(err)
	}
	return result, nil
}
func (r *Repository) PublishRecord(ctx context.Context, actor, dealerID, id string, expected int64, event audit.Event) (app.PublicationState, error) {
	return r.changePublication(ctx, actor, dealerID, id, event, dealer.PublishInventory, func(tx *gorm.DB, record domain.Record, _ *domain.Publication) (domain.Record, *domain.Publication, domain.History, error) {
		photos, err := photoCollection(tx, record)
		if err != nil {
			return domain.Record{}, nil, domain.History{}, err
		}
		next, pub, history, err := record.Publish(photos.Evidence(), expected, actor, event.OccurredAt)
		return next, &pub, history, err
	})
}
func (r *Repository) UnpublishRecord(ctx context.Context, actor, dealerID, id string, expected int64, event audit.Event) (app.PublicationState, error) {
	return r.changePublication(ctx, actor, dealerID, id, event, dealer.PublishInventory, func(_ *gorm.DB, record domain.Record, prior *domain.Publication) (domain.Record, *domain.Publication, domain.History, error) {
		if expected != record.Revision {
			return domain.Record{}, nil, domain.History{}, domain.ErrConflict
		}
		if prior == nil {
			return domain.Record{}, nil, domain.History{}, domain.ErrNoChange
		}
		next, pub, history, err := record.Unpublish(*prior, expected, actor, event.OccurredAt)
		return next, &pub, history, err
	})
}
func (r *Repository) TransitionRecord(ctx context.Context, actor, dealerID, id string, expected int64, status domain.Status, price *domain.Money, reason string, event audit.Event) (app.PublicationState, error) {
	return r.changePublication(ctx, actor, dealerID, id, event, dealer.ManageInventory, func(_ *gorm.DB, record domain.Record, prior *domain.Publication) (domain.Record, *domain.Publication, domain.History, error) {
		next, history, err := record.Transition(status, price, reason, expected, actor, domain.Manual, event.OccurredAt)
		if err != nil {
			return domain.Record{}, nil, domain.History{}, err
		}
		if prior == nil {
			return next, nil, history, nil
		}
		pub, err := prior.ApplyLifecycle(next)
		return next, &pub, history, err
	})
}
