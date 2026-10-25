package dealerstore

import (
	"context"
	"encoding/json"
	"time"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

var _ app.InboxRepository = (*Repository)(nil)

type inquiryReadModel struct {
	InquiryID                      string `gorm:"primaryKey"`
	DealerID, ActorUserID, AuditID string
	ReadAt                         time.Time
}

func (inquiryReadModel) TableName() string { return "buyer_inquiry_reads" }

type inboxRow struct {
	Inquiry inquiryModel `gorm:"embedded"`
	ReadAt  *time.Time
	ReadBy  string
}

func inboxQuery(tx *gorm.DB, dealerID string) *gorm.DB {
	return tx.Table("buyer_inquiries AS i").Select("i.*,r.read_at,COALESCE(r.actor_user_id,'') AS read_by").Joins("LEFT JOIN buyer_inquiry_reads r ON r.inquiry_id=i.id AND r.dealer_id=i.dealer_id").Where("i.dealer_id=?", dealerID)
}
func inquiryFromRow(row inboxRow) (domain.Inquiry, error) {
	record := row.Inquiry
	var snapshot inventory.PublicListing
	if err := json.Unmarshal(record.Snapshot, &snapshot); err != nil {
		return domain.Inquiry{}, err
	}
	if snapshot.ID != record.RecordID || snapshot.DealerID != record.DealerID || snapshot.PublicationRevision != record.PublicationRevision {
		return domain.Inquiry{}, domain.ErrInvalid
	}
	revision := int64(1)
	if row.ReadAt != nil {
		revision = 2
	}
	return domain.Restore(domain.State{ID: record.ID, DealerName: record.DealerName, DealerSlug: record.DealerSlug, Piano: snapshot, Contact: domain.Contact{Name: record.BuyerName, Email: record.Email, Phone: record.Phone, Preference: domain.Preference(record.Preference), Message: record.Message}, CreatedAt: record.CreatedAt, Revision: revision, ReadAt: row.ReadAt, ReadBy: row.ReadBy})
}
func inboxEventValid(event audit.Event, actor, id string, action audit.Action) bool {
	return publicLookup(actor, 128) && publicLookup(id, 128) && event.Valid() && event.ActorUserID == actor && event.TargetType == "inquiry" && event.TargetID == id && event.Action == action && event.Outcome == audit.Succeeded
}
func inboxAuthority(tx *gorm.DB, actor, dealerID string, event audit.Event) error {
	owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.ManageInquiries)
	if err != nil {
		return err
	}
	if event.OwnerUserID != owner {
		return ports.ErrInvalidArgument
	}
	return nil
}
func inboxRead(tx *gorm.DB, dealerID, id string) (domain.Inquiry, error) {
	var row inboxRow
	if err := inboxQuery(tx, dealerID).Where("i.id=?", id).Take(&row).Error; err != nil {
		return domain.Inquiry{}, err
	}
	return inquiryFromRow(row)
}
func (r *Repository) GetInboxInquiry(ctx context.Context, actor, dealerID, id string, event audit.Event) (domain.Inquiry, error) {
	if !publicLookup(dealerID, 128) || !inboxEventValid(event, actor, id, audit.ResourceViewed) {
		return domain.Inquiry{}, ports.ErrInvalidArgument
	}
	var result domain.Inquiry
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := inboxAuthority(tx, actor, dealerID, event); err != nil {
			return err
		}
		var err error
		result, err = inboxRead(tx, dealerID, id)
		if err != nil {
			return err
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return domain.Inquiry{}, inventoryError(err)
	}
	return result, nil
}
func (r *Repository) ListInboxInquiries(ctx context.Context, actor, dealerID string, query domain.ListQuery, event audit.Event) (domain.Page, error) {
	q, err := domain.ValidateListQuery(query)
	if err != nil || !publicLookup(dealerID, 128) || !inboxEventValid(event, actor, dealerID, audit.ResourceListed) {
		return domain.Page{}, ports.ErrInvalidArgument
	}
	page := domain.Page{Inquiries: []domain.Inquiry{}}
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := inboxAuthority(tx, actor, dealerID, event); err != nil {
			return err
		}
		selected := inboxQuery(tx, dealerID).Where("i.created_at<=?", q.Snapshot)
		if q.AfterID != "" {
			selected = selected.Where("(i.created_at<? OR (i.created_at=? AND i.id<?))", q.AfterCreated, q.AfterCreated, q.AfterID)
		}
		var rows []inboxRow
		if err := selected.Order("i.created_at DESC,i.id DESC").Limit(q.Limit + 1).Find(&rows).Error; err != nil {
			return err
		}
		page.HasMore = len(rows) > q.Limit
		if page.HasMore {
			rows = rows[:q.Limit]
		}
		for _, row := range rows {
			entry, err := inquiryFromRow(row)
			if err != nil {
				return err
			}
			page.Inquiries = append(page.Inquiries, entry)
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return domain.Page{}, inventoryError(err)
	}
	return page, nil
}
func (r *Repository) MarkInboxInquiryRead(ctx context.Context, actor, dealerID, id string, expected int64, event audit.Event) (domain.Inquiry, error) {
	if !publicLookup(dealerID, 128) || !inboxEventValid(event, actor, id, audit.ResourceUpdated) || (expected != 1 && expected != 2) {
		return domain.Inquiry{}, ports.ErrInvalidArgument
	}
	var result domain.Inquiry
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := inboxAuthority(tx, actor, dealerID, event); err != nil {
			return err
		}
		entry, err := inboxRead(tx, dealerID, id)
		if err != nil {
			return err
		}
		if entry.State().Revision != expected {
			return ports.ErrConflict
		}
		if entry.State().ReadAt != nil {
			result = entry
			event.Action = audit.ResourceViewed
			return tx.Create(fromAudit(event)).Error
		}
		_, err = entry.MarkRead(actor, event.OccurredAt)
		if err != nil {
			return err
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		if err := tx.Create(&inquiryReadModel{InquiryID: id, DealerID: dealerID, ActorUserID: actor, ReadAt: event.OccurredAt, AuditID: event.ID}).Error; err != nil {
			return err
		}
		result, err = inboxRead(tx, dealerID, id)
		return err
	})
	if err != nil {
		return domain.Inquiry{}, inventoryError(err)
	}
	return result, nil
}
