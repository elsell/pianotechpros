package dealerstore

import (
	"context"
	"errors"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

var _ application.MembershipReader = (*Repository)(nil)

// DealerAccess is a scoped preflight snapshot, never a mutation authority lease.
func (r *Repository) DealerAccess(ctx context.Context, actor, dealerID string) (application.DealerAccess, error) {
	if actor == "" || dealerID == "" {
		return application.DealerAccess{}, ports.ErrInvalidArgument
	}
	var row struct {
		Membership  membershipModel `gorm:"embedded"`
		OwnerUserID string
		UserActive  bool
	}
	err := r.DB.WithContext(ctx).Table("dealer_memberships AS m").
		Select("m.dealer_id,m.user_id,m.role,m.active,m.revision,m.granted_revision,m.created_at,m.updated_at,d.owner_user_id,(u.status='active') AS user_active").
		Joins("JOIN dealer_models d ON d.id=m.dealer_id").
		Joins("JOIN user_models u ON u.id=m.user_id").
		Where("m.dealer_id=? AND m.user_id=?", dealerID, actor).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return application.DealerAccess{}, ports.ErrNotFound
	}
	if err != nil {
		return application.DealerAccess{}, err
	}
	return application.DealerAccess{OwnerUserID: row.OwnerUserID, UserActive: row.UserActive, Membership: domain.Membership{DealerID: domain.ID(row.Membership.DealerID), UserID: row.Membership.UserID, Role: domain.Role(row.Membership.Role), Active: row.Membership.Active, Revision: row.Membership.Revision, GrantedRevision: row.Membership.GrantedRevision, CreatedAt: row.Membership.CreatedAt, UpdatedAt: row.Membership.UpdatedAt}}, nil
}
