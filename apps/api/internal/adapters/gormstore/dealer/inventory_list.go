package dealerstore

import (
	"context"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"strings"
)

var _ application.ListingRepository = (*Repository)(nil)

func (r *Repository) ListRecords(ctx context.Context, actor, dealerID string, query domain.ListQuery, event audit.Event) (domain.Page, error) {
	q, err := domain.ValidateListQuery(query)
	if err != nil || dealerID == "" || !inventoryEventValid(event, actor, dealerID, audit.ResourceListed) {
		return domain.Page{}, ports.ErrInvalidArgument
	}
	page := domain.Page{Records: []domain.Record{}}
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.View)
		if err != nil {
			return err
		}
		if event.OwnerUserID != owner {
			return ports.ErrInvalidArgument
		}
		selected := tx.Model(&inventoryRecordModel{}).Where("dealer_id=? AND created_at<=?", dealerID, q.Snapshot)
		if q.Status != "" {
			selected = selected.Where("status=?", q.Status)
		} else if !q.IncludeInactive {
			selected = selected.Where("status NOT IN ?", []domain.Status{domain.Sold, domain.Archived})
		}
		if q.Search != "" {
			term := "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(q.Search) + "%"
			selected = selected.Where("(stock_number ILIKE ? OR attributes->>'Title' ILIKE ? OR attributes->>'Make' ILIKE ? OR attributes->>'Model' ILIKE ?)", term, term, term, term)
		}
		if q.AfterID != "" {
			selected = selected.Where("((attributes->>'Featured')::boolean < ? OR ((attributes->>'Featured')::boolean = ? AND (created_at < ? OR (created_at = ? AND id > ?))))", q.AfterFeatured, q.AfterFeatured, q.AfterCreated, q.AfterCreated, q.AfterID)
		}
		var rows []inventoryRecordModel
		if err := selected.Order("(attributes->>'Featured')::boolean DESC").Order("created_at DESC").Order("id ASC").Limit(q.Limit + 1).Find(&rows).Error; err != nil {
			return err
		}
		page.HasMore = len(rows) > q.Limit
		if page.HasMore {
			rows = rows[:q.Limit]
		}
		for _, row := range rows {
			record, err := inventoryFromRow(row)
			if err != nil {
				return err
			}
			page.Records = append(page.Records, record)
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return domain.Page{}, inventoryError(err)
	}
	return page, nil
}
