package dealerstore

import (
	"context"
	"errors"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
)

type Repository struct{ DB *gorm.DB }

type model struct {
	ID                string `gorm:"primaryKey"`
	OwnerUserID       string
	Revision          int64
	Name              string
	Slug              string
	Email             string
	Phone             string
	WebsiteUrl        string
	Tagline           string
	Description       string
	StreetAddress1    string `gorm:"column:street_address_1"`
	StreetAddress2    string `gorm:"column:street_address_2"`
	City              string
	Region            string
	PostalCode        string
	AppointmentNote   string
	DeliveryNote      string
	WarrantyNote      string
	ServiceNote       string
	BannerAltText     string
	AccentColor       string
	ShowroomPublished bool

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (model) TableName() string { return "dealer_models" }

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

func New(db *gorm.DB) *Repository { return &Repository{DB: db} }

func (r *Repository) Create(ctx context.Context, entity domain.Entity, change ports.AuthorizationChange, idempotency ports.Idempotency, event audit.Event) (domain.Entity, bool, error) {
	if !validProfile(entity) || entity.Revision != 1 || !validEvent(event, audit.ResourceCreated, entity) || event.ActorUserID != entity.OwnerUserID ||
		entity.ID == "" || entity.CreatedAt.IsZero() || entity.UpdatedAt.IsZero() || idempotency.PrincipalID != entity.OwnerUserID || idempotency.Operation != "dealer.create" || idempotency.Key == "" || len(idempotency.RequestHash) != 32 ||
		change.ID == "" || change.Relation != "owner" || change.ResourceType != "dealer" || change.ResourceID != string(entity.ID) || change.SubjectType != "user" || change.SubjectID != entity.OwnerUserID || change.OwnerUserID != entity.OwnerUserID || change.ActorUserID != event.ActorUserID || change.Operation != ports.AuthorizationTouch || change.Lease <= 0 || change.LockedBy == "" {
		return domain.Entity{}, false, ports.ErrInvalidArgument
	}
	result := domain.Entity{}
	replayed := false
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		reservation := idempotencyModel{PrincipalID: idempotency.PrincipalID, Operation: idempotency.Operation, Key: idempotency.Key, RequestHash: append([]byte(nil), idempotency.RequestHash...), ResourceID: string(entity.ID), CreatedAt: entity.CreatedAt}
		created := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reservation)
		if created.Error != nil {
			return created.Error
		}
		if created.RowsAffected == 0 {
			var existing idempotencyModel
			if err := tx.Where("principal_id = ? AND operation = ? AND key = ?", idempotency.PrincipalID, idempotency.Operation, idempotency.Key).First(&existing).Error; err != nil {
				return err
			}
			if string(existing.RequestHash) != string(idempotency.RequestHash) {
				return ports.ErrIdempotencyConflict
			}
			var row model
			if err := tx.Where("owner_user_id = ? AND id = ?", entity.OwnerUserID, existing.ResourceID).First(&row).Error; err != nil {
				return err
			}
			result, replayed = toEntity(row), true
			return nil
		}
		if err := tx.Create(fromEntity(entity)).Error; err != nil {
			return profileWriteError(err)
		}
		outbox := authorizationOutboxModel{ID: change.ID, ResourceType: change.ResourceType, ResourceID: change.ResourceID, Relation: change.Relation, SubjectType: change.SubjectType, SubjectID: change.SubjectID, OwnerUserID: change.OwnerUserID, ActorUserID: change.ActorUserID, Operation: change.Operation, LockedBy: change.LockedBy, CreatedAt: entity.CreatedAt}
		if err := tx.Create(&outbox).Error; err != nil {
			return err
		}
		membership := membershipModel{DealerID: string(entity.ID), UserID: entity.OwnerUserID, Role: "owner", Active: true, Revision: 1, PendingAuthorizationChangeID: &change.ID, PendingAuthorizationRevision: &entity.Revision, CreatedAt: entity.CreatedAt, UpdatedAt: entity.CreatedAt}
		if err := tx.Create(&membership).Error; err != nil {
			return err
		}
		if err := tx.Model(&outbox).Update("locked_until", gorm.Expr("CURRENT_TIMESTAMP + (? * INTERVAL '1 millisecond')", change.Lease.Milliseconds())).Error; err != nil {
			return err
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		result = entity
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = ports.ErrNotFound
	}
	return result, replayed, persistenceError(err)
}

func (r *Repository) List(ctx context.Context, owner string, page application.PageRequest) (application.Page, error) {
	if owner == "" || page.Limit < 1 || page.Limit > 100 || page.Snapshot.IsZero() {
		return application.Page{}, ports.ErrInvalidArgument
	}
	query := memberQuery(r.DB.WithContext(ctx), owner).Where("created_at <= ?", page.Snapshot)
	if page.AfterID != "" {
		query = query.Where("created_at > ? OR (created_at = ? AND id > ?)", page.AfterCreated, page.AfterCreated, page.AfterID)
	}
	var rows []model
	if err := query.Order("created_at ASC, id ASC").Limit(page.Limit + 1).Find(&rows).Error; err != nil {
		return application.Page{}, err
	}
	hasMore := len(rows) > page.Limit
	if hasMore {
		rows = rows[:page.Limit]
	}
	items := make([]domain.Entity, len(rows))
	for i := range rows {
		items[i] = toEntity(rows[i])
	}
	return application.Page{Items: items, HasMore: hasMore}, nil
}

func (r *Repository) Get(ctx context.Context, owner string, id domain.ID) (domain.Entity, error) {
	var row model
	err := memberQuery(r.DB.WithContext(ctx), owner).Where("id = ?", id).First(&row).Error
	if err == gorm.ErrRecordNotFound {
		return domain.Entity{}, ports.ErrNotFound
	}
	if err != nil {
		return domain.Entity{}, err
	}
	return toEntity(row), nil
}

// GetCreationOwner is restricted to the founding owner and deliberately permits
// pending grants. Only creation/retry orchestration may use this capability.
func (r *Repository) GetCreationOwner(ctx context.Context, actor string, id domain.ID) (domain.Entity, error) {
	var row model
	err := r.DB.WithContext(ctx).Where("id = ? AND owner_user_id = ?", id, actor).
		Where("EXISTS (SELECT 1 FROM dealer_memberships m WHERE m.dealer_id = dealer_models.id AND m.user_id = ? AND m.role = 'owner' AND m.active)", actor).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.Entity{}, ports.ErrNotFound
	}
	if err != nil {
		return domain.Entity{}, err
	}
	return toEntity(row), nil
}

func (r *Repository) Update(ctx context.Context, actor string, entity domain.Entity, event audit.Event) error {
	if actor == "" || event.ActorUserID != actor || !validProfile(entity) || entity.Revision < 1 || entity.UpdatedAt.IsZero() || !validEvent(event, audit.ResourceUpdated, entity) {
		return ports.ErrInvalidArgument
	}
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model
		err := memberQuery(tx, actor).Where("id = ? AND owner_user_id = ?", entity.ID, actor).Where("EXISTS (SELECT 1 FROM dealer_memberships m WHERE m.dealer_id = dealer_models.id AND m.user_id = ? AND m.role = 'owner' AND m.active AND m.granted_revision = m.revision)", actor).Clauses(clause.Locking{Strength: "UPDATE"}).First(&current).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ports.ErrNotFound
		}
		if err != nil {
			return err
		}
		if current.OwnerUserID != entity.OwnerUserID {
			return ports.ErrInvalidArgument
		}
		if current.Revision != entity.Revision {
			return ports.ErrConflict
		}
		result := tx.Model(&model{}).Where("id = ? AND revision = ?", entity.ID, entity.Revision).Updates(map[string]any{"name": entity.Name, "slug": entity.Slug, "email": entity.Email, "phone": entity.Phone, "website_url": entity.WebsiteUrl, "tagline": entity.Tagline, "description": entity.Description, "street_address_1": entity.StreetAddress1, "street_address_2": entity.StreetAddress2, "city": entity.City, "region": entity.Region, "postal_code": entity.PostalCode, "appointment_note": entity.AppointmentNote, "delivery_note": entity.DeliveryNote, "warranty_note": entity.WarrantyNote, "service_note": entity.ServiceNote, "banner_alt_text": entity.BannerAltText, "accent_color": entity.AccentColor, "showroom_published": entity.ShowroomPublished, "updated_at": entity.UpdatedAt, "revision": entity.Revision + 1})
		if result.Error != nil {
			return profileWriteError(result.Error)
		}
		if result.RowsAffected != 1 {
			return ports.ErrConflict
		}
		return tx.Create(fromAudit(event)).Error
	})
	return persistenceError(err)
}

// Dealers are retained. No ordinary deletion capability is exposed.
func (r *Repository) Delete(context.Context, string, domain.ID, ports.AuthorizationChange, audit.Event) error {
	return ports.ErrInvalidArgument
}

type membershipModel struct {
	DealerID                     string `gorm:"primaryKey"`
	UserID                       string `gorm:"primaryKey"`
	Role                         string
	Active                       bool
	Revision                     int64
	GrantedRevision              int64
	PendingAuthorizationChangeID *string
	PendingAuthorizationRevision *int64
	CreatedAt, UpdatedAt         time.Time
}

func (membershipModel) TableName() string { return "dealer_memberships" }
func memberQuery(db *gorm.DB, actor string) *gorm.DB {
	return db.Model(&model{}).Where("EXISTS (SELECT 1 FROM dealer_memberships m WHERE m.dealer_id = dealer_models.id AND m.user_id = ? AND m.active AND m.granted_revision = m.revision)", actor)
}
func validProfile(entity domain.Entity) bool {
	normalized, err := domain.New(entity.ID, entity.OwnerUserID, entity.Attributes)
	return err == nil && normalized.Attributes == entity.Attributes
}
func persistenceError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "dealer_models_slug_unique" {
		return ports.ErrConflict
	}
	return err
}

func validEvent(event audit.Event, action audit.Action, entity domain.Entity) bool {
	return event.Valid() && event.Action == action && event.Outcome == audit.Succeeded && event.TargetType == "dealer" && event.TargetID == string(entity.ID) && event.OwnerUserID == entity.OwnerUserID
}

func fromEntity(entity domain.Entity) *model {
	return &model{ID: string(entity.ID), OwnerUserID: entity.OwnerUserID, Revision: entity.Revision, Name: entity.Name, Slug: entity.Slug, Email: entity.Email, Phone: entity.Phone, WebsiteUrl: entity.WebsiteUrl, Tagline: entity.Tagline, Description: entity.Description, StreetAddress1: entity.StreetAddress1, StreetAddress2: entity.StreetAddress2, City: entity.City, Region: entity.Region, PostalCode: entity.PostalCode, AppointmentNote: entity.AppointmentNote, DeliveryNote: entity.DeliveryNote, WarrantyNote: entity.WarrantyNote, ServiceNote: entity.ServiceNote, BannerAltText: entity.BannerAltText, AccentColor: entity.AccentColor, ShowroomPublished: entity.ShowroomPublished, CreatedAt: entity.CreatedAt, UpdatedAt: entity.UpdatedAt}
}

func toEntity(row model) domain.Entity {
	return domain.Entity{ID: domain.ID(row.ID), OwnerUserID: row.OwnerUserID, Revision: row.Revision, Attributes: domain.Attributes{Name: row.Name, Slug: row.Slug, Email: row.Email, Phone: row.Phone, WebsiteUrl: row.WebsiteUrl, Tagline: row.Tagline, Description: row.Description, StreetAddress1: row.StreetAddress1, StreetAddress2: row.StreetAddress2, City: row.City, Region: row.Region, PostalCode: row.PostalCode, AppointmentNote: row.AppointmentNote, DeliveryNote: row.DeliveryNote, WarrantyNote: row.WarrantyNote, ServiceNote: row.ServiceNote, BannerAltText: row.BannerAltText, AccentColor: row.AccentColor, ShowroomPublished: row.ShowroomPublished}, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func fromAudit(event audit.Event) *auditModel {
	return &auditModel{ID: event.ID, OwnerUserID: event.OwnerUserID, ActorUserID: event.ActorUserID, Action: event.Action, TargetType: event.TargetType, TargetID: event.TargetID, Outcome: event.Outcome, CorrelationID: event.CorrelationID, OccurredAt: event.OccurredAt}
}

// Production GORM translates unique violations and removes constraint names.
// Interpret that translation only at the profile write, never at audit/outbox
// writes, whose failures must remain infrastructure errors.
func profileWriteError(err error) error {
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return ports.ErrConflict
	}
	return persistenceError(err)
}
