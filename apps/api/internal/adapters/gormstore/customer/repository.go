package customerstore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"io"
	"strings"
	"time"
)

const maxStoredAggregateBytes = 4 << 20

var _ application.Repository = (*Repository)(nil)

type Repository struct {
	DB    *gorm.DB
	Zones domain.TimezoneCatalog
}
type model struct {
	ID                         string `gorm:"primaryKey"`
	OwnerUserID, Name          string
	IsBusiness                 bool
	BusinessName, Email, Phone string
	Revision                   int64
	Locations, Pianos          json.RawMessage `gorm:"type:jsonb"`
	LastAuditID                string
	CreatedAt, UpdatedAt       time.Time
}

func (model) TableName() string { return "customer_models" }

type auditModel struct {
	ID, OwnerUserID, ActorUserID, TargetType, TargetID, CorrelationID string
	Action                                                            audit.Action
	Outcome                                                           audit.Outcome
	OccurredAt                                                        time.Time
}

type idempotencyModel struct {
	PrincipalID, Operation, Key string
	RequestHash                 []byte
	ResourceID                  string
	CreatedAt                   time.Time
}

func (idempotencyModel) TableName() string { return "idempotency_models" }

type authorizationOutboxModel struct {
	ID, ResourceType, ResourceID, Relation, SubjectType, SubjectID string
	OwnerUserID, ActorUserID                                       string
	Operation                                                      ports.AuthorizationOperation
	LockedBy                                                       string
	CreatedAt                                                      time.Time
}

func (authorizationOutboxModel) TableName() string { return "authorization_outbox_models" }

func (auditModel) TableName() string { return "audit_event_models" }

// New without a catalog remains fail-closed until bootstrap supplies one.
func New(db *gorm.DB, catalogs ...domain.TimezoneCatalog) *Repository {
	r := &Repository{DB: db}
	if len(catalogs) == 1 {
		r.Zones = catalogs[0]
	}
	return r
}
func (r *Repository) ready() error {
	if r.DB == nil || r.Zones == nil {
		return ports.ErrAuthorizationPolicyNotConfigured
	}
	return nil
}

func (r *Repository) Create(ctx context.Context, entity domain.Entity, change ports.AuthorizationChange, idempotency ports.Idempotency, event audit.Event) (domain.Entity, bool, error) {
	if !validEvent(event, audit.ResourceCreated, entity.OwnerUserID, entity.ID) || entity.Revision != 1 || !entity.CreatedAt.Equal(entity.UpdatedAt) || !event.OccurredAt.Equal(entity.CreatedAt) || idempotency.PrincipalID != entity.OwnerUserID || idempotency.Operation != "customer.create" || idempotency.Key == "" || len(idempotency.Key) > 200 || len(idempotency.RequestHash) != 32 || change.ID == "" || change.Relation != "owner" || change.ResourceType != "customer" || change.ResourceID != string(entity.ID) || change.SubjectType != "user" || change.SubjectID != entity.OwnerUserID || change.OwnerUserID != entity.OwnerUserID || change.ActorUserID != entity.OwnerUserID || change.Operation != ports.AuthorizationTouch || change.Lease <= 0 || change.Lease > time.Hour || change.LockedBy == "" {
		return domain.Entity{}, false, ports.ErrInvalidArgument
	}
	if err := r.ready(); err != nil {
		return domain.Entity{}, false, err
	}
	row, err := fromEntity(entity, r.Zones)
	if err != nil {
		return domain.Entity{}, false, ports.ErrInvalidArgument
	}
	row.LastAuditID = event.ID
	var result domain.Entity
	replayed := false
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockActiveOwner(tx, entity.OwnerUserID); err != nil {
			return err
		}
		reservation := idempotencyModel{PrincipalID: idempotency.PrincipalID, Operation: idempotency.Operation, Key: idempotency.Key, RequestHash: append([]byte(nil), idempotency.RequestHash...), ResourceID: string(entity.ID), CreatedAt: entity.CreatedAt}
		created := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reservation)
		if created.Error != nil {
			return created.Error
		}
		if created.RowsAffected == 0 {
			var existing idempotencyModel
			if err := tx.Where("principal_id=? AND operation=? AND key=?", idempotency.PrincipalID, idempotency.Operation, idempotency.Key).First(&existing).Error; err != nil {
				return err
			}
			if !bytes.Equal(existing.RequestHash, idempotency.RequestHash) {
				return ports.ErrIdempotencyConflict
			}
			var stored model
			if err := tx.Where("owner_user_id=? AND id=?", entity.OwnerUserID, existing.ResourceID).First(&stored).Error; err != nil {
				return err
			}
			var err error
			result, err = toEntity(stored, r.Zones)
			replayed = err == nil
			return err
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		if err := tx.Create(row).Error; err != nil {
			var pg *pgconn.PgError
			if errors.Is(err, gorm.ErrDuplicatedKey) || (errors.As(err, &pg) && pg.Code == "23505") {
				return ports.ErrConflict
			}
			return err
		}
		outbox := authorizationOutboxModel{ID: change.ID, ResourceType: change.ResourceType, ResourceID: change.ResourceID, Relation: change.Relation, SubjectType: change.SubjectType, SubjectID: change.SubjectID, OwnerUserID: change.OwnerUserID, ActorUserID: change.ActorUserID, Operation: change.Operation, LockedBy: change.LockedBy, CreatedAt: entity.CreatedAt}
		if err := tx.Create(&outbox).Error; err != nil {
			return err
		}
		if err := tx.Model(&outbox).Update("locked_until", gorm.Expr("CURRENT_TIMESTAMP + (? * INTERVAL '1 millisecond')", change.Lease.Milliseconds())).Error; err != nil {
			return err
		}
		result, err = toEntity(*row, r.Zones)
		return err
	})
	if err != nil {
		return domain.Entity{}, false, translateError(err)
	}
	return result, replayed, nil
}

func (r *Repository) Get(ctx context.Context, owner string, id domain.ID) (domain.Entity, error) {
	if strings.TrimSpace(owner) == "" || id == "" {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	if err := r.ready(); err != nil {
		return domain.Entity{}, err
	}
	var row model
	if err := r.DB.WithContext(ctx).Where("owner_user_id=? AND id=?", owner, id).First(&row).Error; err != nil {
		return domain.Entity{}, translateError(err)
	}
	return toEntity(row, r.Zones)
}

func (r *Repository) GetOwn(ctx context.Context, owner string) (domain.Entity, error) {
	if strings.TrimSpace(owner) == "" {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	if err := r.ready(); err != nil {
		return domain.Entity{}, err
	}
	var row model
	active := r.DB.WithContext(ctx).Table("user_models").Select("1").Where("id=customer_models.owner_user_id AND status='active'")
	if err := r.DB.WithContext(ctx).Where("owner_user_id=? AND EXISTS (?)", owner, active).First(&row).Error; err != nil {
		return domain.Entity{}, translateError(err)
	}
	return toEntity(row, r.Zones)
}

func (r *Repository) AuthorizationReady(ctx context.Context, owner string, id domain.ID) (bool, error) {
	if strings.TrimSpace(owner) == "" || id == "" {
		return false, ports.ErrInvalidArgument
	}
	if err := r.ready(); err != nil {
		return false, err
	}
	pending := r.DB.WithContext(ctx).Model(&authorizationOutboxModel{}).Select("1").Where("resource_type='customer' AND resource_id=? AND completed_at IS NULL", id)
	completed := r.DB.WithContext(ctx).Model(&authorizationOutboxModel{}).Select("1").Where("resource_type='customer' AND resource_id=? AND relation='owner' AND subject_type='user' AND subject_id=? AND owner_user_id=? AND actor_user_id=? AND operation='touch' AND completed_at IS NOT NULL", id, owner, owner, owner)
	var count int64
	err := r.DB.WithContext(ctx).Model(&model{}).Where("owner_user_id=? AND id=?", owner, id).Where("EXISTS (?) AND NOT EXISTS (?)", completed, pending).Count(&count).Error
	return count == 1, err
}

func (r *Repository) Save(ctx context.Context, owner string, id domain.ID, expected int64, attributes domain.Attributes, now time.Time, event audit.Event) (domain.Entity, bool, error) {
	if !validEvent(event, audit.ResourceUpdated, owner, id) || expected < 1 || expected > domain.MaxRevision || now.IsZero() || !event.OccurredAt.Equal(now) || now.Nanosecond()%1000 != 0 {
		return domain.Entity{}, false, ports.ErrInvalidArgument
	}
	if err := r.ready(); err != nil {
		return domain.Entity{}, false, err
	}
	var result domain.Entity
	changed := false
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockActiveOwner(tx, owner); err != nil {
			return err
		}
		var stored model
		if err := tx.Where("owner_user_id=? AND id=?", owner, id).Clauses(clause.Locking{Strength: "UPDATE"}).First(&stored).Error; err != nil {
			return err
		}
		current, err := toEntity(stored, r.Zones)
		if err != nil {
			return err
		}
		ready, err := New(tx, r.Zones).AuthorizationReady(ctx, owner, id)
		if err != nil {
			return err
		}
		if !ready {
			return ports.ErrAuthorizationPending
		}
		result, changed, err = domain.Revise(current, expected, attributes, r.Zones, now)
		if err != nil {
			return err
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		if !changed {
			return nil
		}
		row, err := fromEntity(result, r.Zones)
		if err != nil {
			return err
		}
		update := tx.Model(&model{}).Where("owner_user_id=? AND id=? AND revision=?", owner, id, expected).Updates(map[string]any{"name": row.Name, "is_business": row.IsBusiness, "business_name": row.BusinessName, "email": row.Email, "phone": row.Phone, "locations": row.Locations, "pianos": row.Pianos, "revision": row.Revision, "updated_at": row.UpdatedAt, "last_audit_id": event.ID})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected != 1 {
			return domain.ErrRevisionConflict
		}
		return nil
	})
	if err != nil {
		return domain.Entity{}, false, translateError(err)
	}
	return result, changed, nil
}
func lockActiveOwner(tx *gorm.DB, owner string) error {
	var row struct{ ID string }
	return tx.Table("user_models").Where("id=? AND status='active'", owner).Clauses(clause.Locking{Strength: "SHARE"}).Take(&row).Error
}
func translateError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ports.ErrNotFound
	}
	return err
}
func validEvent(event audit.Event, action audit.Action, owner string, id domain.ID) bool {
	return strings.TrimSpace(owner) != "" && id != "" && event.Valid() && event.Action == action && event.Outcome == audit.Succeeded && event.TargetType == "customer" && event.TargetID == string(id) && event.OwnerUserID == owner && event.ActorUserID == owner
}
func fromEntity(entity domain.Entity, zones domain.TimezoneCatalog) (*model, error) {
	entity, err := domain.Restore(entity.ID, entity.OwnerUserID, entity.Attributes, entity.Revision, entity.CreatedAt, entity.UpdatedAt, zones)
	if err != nil {
		return nil, err
	}
	locations, err := json.Marshal(entity.Locations)
	if err != nil {
		return nil, err
	}
	pianos := json.RawMessage("[]")
	if len(entity.Pianos) > 0 {
		pianos, err = json.Marshal(entity.Pianos)
		if err != nil {
			return nil, err
		}
	}
	if len(locations)+len(pianos) > maxStoredAggregateBytes {
		return nil, ports.ErrInvalidArgument
	}
	return &model{ID: string(entity.ID), OwnerUserID: entity.OwnerUserID, Name: entity.Name, IsBusiness: entity.IsBusiness, BusinessName: entity.BusinessName, Email: entity.Email, Phone: entity.Phone, Revision: entity.Revision, Locations: locations, Pianos: pianos, CreatedAt: entity.CreatedAt, UpdatedAt: entity.UpdatedAt}, nil
}
func toEntity(row model, zones domain.TimezoneCatalog) (domain.Entity, error) {
	if len(row.Locations)+len(row.Pianos) > maxStoredAggregateBytes {
		return domain.Entity{}, ports.ErrInvalidArgument
	}
	attrs := domain.Attributes{Name: row.Name, IsBusiness: row.IsBusiness, BusinessName: row.BusinessName, Email: row.Email, Phone: row.Phone}
	if err := decodeArray(row.Locations, &attrs.Locations); err != nil {
		return domain.Entity{}, err
	}
	if err := decodeArray(row.Pianos, &attrs.Pianos); err != nil {
		return domain.Entity{}, err
	}
	return domain.Restore(domain.ID(row.ID), row.OwnerUserID, attrs, row.Revision, row.CreatedAt, row.UpdatedAt, zones)
}
func decodeArray(raw json.RawMessage, target any) error {
	clean := bytes.TrimSpace(raw)
	if len(clean) == 0 || clean[0] != '[' {
		return ports.ErrInvalidArgument
	}
	decoder := json.NewDecoder(bytes.NewReader(clean))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return ports.ErrInvalidArgument
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return ports.ErrInvalidArgument
	}
	return nil
}
func fromAudit(event audit.Event) *auditModel {
	return &auditModel{ID: event.ID, OwnerUserID: event.OwnerUserID, ActorUserID: event.ActorUserID, Action: event.Action, TargetType: event.TargetType, TargetID: event.TargetID, Outcome: event.Outcome, CorrelationID: event.CorrelationID, OccurredAt: event.OccurredAt}
}
