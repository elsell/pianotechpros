package dealerstore

import (
	"context"
	"errors"
	"time"

	application "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func validStaffPage(actor string, id domain.ID, p application.StaffPageRequest) bool {
	return actor != "" && id != "" && p.Limit >= 1 && p.Limit <= 100 && !p.Snapshot.IsZero() && (p.AfterID == "") == p.AfterCreated.IsZero() && !p.AfterCreated.After(p.Snapshot)
}
func staffListError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ports.ErrNotFound
	}
	return err
}
func (r *Repository) ListStaff(ctx context.Context, actor string, id domain.ID, p application.StaffPageRequest) (application.StaffPage, error) {
	if !validStaffPage(actor, id, p) {
		return application.StaffPage{}, ports.ErrInvalidArgument
	}
	var rows []membershipModel
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockStaffOwner(tx, actor, id); err != nil {
			return err
		}
		query := tx.Where("dealer_id=? AND created_at<=?", id, p.Snapshot)
		if p.AfterID != "" {
			query = query.Where("created_at>? OR (created_at=? AND user_id>?)", p.AfterCreated, p.AfterCreated, p.AfterID)
		}
		return query.Order("created_at ASC,user_id ASC").Limit(p.Limit + 1).Find(&rows).Error
	})
	if err != nil {
		return application.StaffPage{}, staffListError(err)
	}
	more := len(rows) > p.Limit
	if more {
		rows = rows[:p.Limit]
	}
	items := make([]domain.Membership, len(rows))
	for n, row := range rows {
		items[n] = domain.Membership{DealerID: domain.ID(row.DealerID), UserID: row.UserID, Role: domain.Role(row.Role), Active: row.Active, Revision: row.Revision, GrantedRevision: row.GrantedRevision, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
	}
	return application.StaffPage{Items: items, HasMore: more}, nil
}

// A separate projection makes it impossible for an ordinary list to load tokens
// or digests, even if a future response mapper accidentally serializes the row.
type invitationSummaryModel struct {
	ID, DealerID, Role    string
	CreatedAt, ExpiresAt  time.Time
	ConsumedBy            *string
	ConsumedAt, RevokedAt *time.Time
}

func (r *Repository) ListStaffInvitations(ctx context.Context, actor string, id domain.ID, p application.StaffPageRequest) (application.InvitationPage, error) {
	if !validStaffPage(actor, id, p) {
		return application.InvitationPage{}, ports.ErrInvalidArgument
	}
	var rows []invitationSummaryModel
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockStaffOwner(tx, actor, id); err != nil {
			return err
		}
		query := tx.Table("dealer_staff_invitations").Select("id,dealer_id,role,created_at,expires_at,consumed_by,consumed_at,revoked_at").Where("dealer_id=? AND owner_user_id=? AND created_at<=?", id, actor, p.Snapshot)
		if p.AfterID != "" {
			query = query.Where("created_at>? OR (created_at=? AND id>?)", p.AfterCreated, p.AfterCreated, p.AfterID)
		}
		return query.Order("created_at ASC,id ASC").Limit(p.Limit + 1).Find(&rows).Error
	})
	if err != nil {
		return application.InvitationPage{}, staffListError(err)
	}
	more := len(rows) > p.Limit
	if more {
		rows = rows[:p.Limit]
	}
	items := make([]domain.InvitationSummary, len(rows))
	for n, row := range rows {
		item := domain.InvitationSummary{ID: row.ID, DealerID: domain.ID(row.DealerID), Role: domain.Role(row.Role), CreatedAt: row.CreatedAt, ExpiresAt: row.ExpiresAt}
		if row.ConsumedBy != nil {
			item.ConsumedBy = *row.ConsumedBy
		}
		if row.ConsumedAt != nil {
			item.ConsumedAt = *row.ConsumedAt
		}
		if row.RevokedAt != nil {
			item.RevokedAt = *row.RevokedAt
		}
		items[n] = item
	}
	return application.InvitationPage{Items: items, HasMore: more}, nil
}
