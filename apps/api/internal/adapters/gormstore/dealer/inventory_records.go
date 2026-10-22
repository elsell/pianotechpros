package dealerstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"io"
	"reflect"
	"strings"
	"time"
)

var _ application.RecordRepository = (*Repository)(nil)

type inventoryRecordModel struct {
	ID                    string `gorm:"primaryKey"`
	DealerID, StockNumber string
	Revision              int64
	Status                domain.Status
	Attributes            json.RawMessage `gorm:"type:jsonb"`
	CreatedAt, UpdatedAt  time.Time
}

func (inventoryRecordModel) TableName() string { return "inventory_records" }

type inventoryHistoryModel struct {
	RecordID, DealerID        string
	Revision                  int64
	ActorUserID, Source, Kind string
	Snapshot                  json.RawMessage `gorm:"type:jsonb"`
	AuditID                   string
	CreatedAt                 time.Time
}

func (inventoryHistoryModel) TableName() string { return "inventory_history" }
func lockInventoryAuthority(tx *gorm.DB, actor, dealerID string, capability dealer.Capability) (string, error) {
	var lock struct{ ResourceType, ResourceID string }
	if err := tx.Table("authorization_resource_lock_models").Where("resource_type='dealer' AND resource_id=?", dealerID).Clauses(clause.Locking{Strength: "UPDATE"}).Take(&lock).Error; err != nil {
		return "", err
	}
	var shop model
	if err := tx.Where("id=?", dealerID).Clauses(clause.Locking{Strength: "UPDATE"}).First(&shop).Error; err != nil {
		return "", err
	}
	var row membershipModel
	if err := tx.Where("dealer_id=? AND user_id=?", dealerID, actor).Clauses(clause.Locking{Strength: "UPDATE"}).First(&row).Error; err != nil {
		return "", err
	}
	membership := dealer.Membership{DealerID: dealer.ID(row.DealerID), UserID: row.UserID, Role: dealer.Role(row.Role), Active: row.Active, Revision: row.Revision, GrantedRevision: row.GrantedRevision, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
	if !membership.Allows(capability) || (membership.Role == dealer.RoleOwner) != (shop.OwnerUserID == actor) {
		return "", ports.ErrNotFound
	}
	var account struct{ ID string }
	if err := tx.Table("user_models").Where("id=? AND status='active'", actor).Clauses(clause.Locking{Strength: "SHARE"}).Take(&account).Error; err != nil {
		return "", err
	}
	return shop.OwnerUserID, nil
}
func inventoryEventValid(event audit.Event, actor, id string, action audit.Action) bool {
	return actor != "" && id != "" && event.Valid() && event.ActorUserID == actor && event.TargetType == "inventory" && event.TargetID == id && event.Action == action && event.Outcome == audit.Succeeded
}
func inventoryRead(tx *gorm.DB, dealerID, id string) (domain.Record, error) {
	var row inventoryRecordModel
	if err := tx.Where("dealer_id=? AND id=?", dealerID, id).First(&row).Error; err != nil {
		return domain.Record{}, err
	}
	var attributes domain.Attributes
	decoder := json.NewDecoder(bytes.NewReader(row.Attributes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&attributes); err != nil {
		return domain.Record{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	validated, err := domain.ValidateAttributes(attributes)
	if err != nil || !reflect.DeepEqual(validated, attributes) || attributes.StockNumber != row.StockNumber || row.StockNumber == "" || row.Revision < 1 || row.Revision > 9007199254740991 || row.CreatedAt.IsZero() || row.UpdatedAt.Before(row.CreatedAt) {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	switch row.Status {
	case domain.Draft, domain.Available, domain.Reserved, domain.InService, domain.Sold, domain.Archived:
	default:
		return domain.Record{}, ports.ErrInvalidArgument
	}
	return domain.Record{ID: row.ID, DealerID: row.DealerID, Revision: row.Revision, Status: row.Status, Attributes: attributes, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}, nil
}
func inventoryError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ports.ErrNotFound
	}
	return err
}
func (r *Repository) CreateDraft(ctx context.Context, actor string, draft domain.Record, key string, event audit.Event) (domain.Record, bool, error) {
	expected, err := domain.NewDraft(draft.ID, draft.DealerID, draft.StockNumber, draft.CreatedAt)
	if err != nil || !reflect.DeepEqual(expected, draft) || strings.TrimSpace(key) == "" || !inventoryEventValid(event, actor, draft.ID, audit.ResourceCreated) || !event.OccurredAt.Equal(draft.CreatedAt) {
		return domain.Record{}, false, ports.ErrInvalidArgument
	}
	var result domain.Record
	replay := false
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, draft.DealerID, dealer.ManageInventory)
		if err != nil {
			return err
		}
		if event.OwnerUserID != owner {
			return ports.ErrInvalidArgument
		}
		hash := sha256.Sum256([]byte(draft.DealerID))
		reservation := idempotencyModel{PrincipalID: actor, Operation: "inventory.create:" + draft.DealerID, Key: key, RequestHash: hash[:], ResourceID: draft.ID, CreatedAt: draft.CreatedAt}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reservation)
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 0 {
			var existing idempotencyModel
			if err := tx.Where("principal_id=? AND operation=? AND key=?", actor, reservation.Operation, key).First(&existing).Error; err != nil {
				return err
			}
			if !bytes.Equal(existing.RequestHash, hash[:]) {
				return ports.ErrIdempotencyConflict
			}
			result, err = inventoryRead(tx, draft.DealerID, existing.ResourceID)
			if err != nil {
				return err
			}
			replay = true
			event.Action = audit.ResourceViewed
			event.TargetID = result.ID
			return tx.Create(fromAudit(event)).Error
		}
		attributes, err := json.Marshal(draft.Attributes)
		if err != nil {
			return err
		}
		row := inventoryRecordModel{ID: draft.ID, DealerID: draft.DealerID, StockNumber: draft.StockNumber, Revision: draft.Revision, Status: draft.Status, Attributes: attributes, CreatedAt: draft.CreatedAt, UpdatedAt: draft.UpdatedAt}
		if err := tx.Create(&row).Error; err != nil {
			var pg *pgconn.PgError
			if errors.Is(err, gorm.ErrDuplicatedKey) || errors.As(err, &pg) && pg.Code == "23505" && pg.ConstraintName == "inventory_records_dealer_id_stock_number_key" {
				return ports.ErrConflict
			}
			return err
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		snapshot, err := json.Marshal(draft)
		if err != nil {
			return err
		}
		history := inventoryHistoryModel{RecordID: draft.ID, DealerID: draft.DealerID, Revision: 1, ActorUserID: actor, Source: "manual", Kind: "created", Snapshot: snapshot, AuditID: event.ID, CreatedAt: draft.CreatedAt}
		if err := tx.Create(&history).Error; err != nil {
			return err
		}
		result = draft
		return nil
	})
	if err != nil {
		return domain.Record{}, false, inventoryError(err)
	}
	return result, replay, nil
}
func (r *Repository) GetRecord(ctx context.Context, actor, dealerID, id string, event audit.Event) (domain.Record, error) {
	if dealerID == "" || !inventoryEventValid(event, actor, id, audit.ResourceViewed) {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	var result domain.Record
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.View)
		if err != nil {
			return err
		}
		if event.OwnerUserID != owner {
			return ports.ErrInvalidArgument
		}
		result, err = inventoryRead(tx, dealerID, id)
		if err != nil {
			return err
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return domain.Record{}, inventoryError(err)
	}
	return result, nil
}
