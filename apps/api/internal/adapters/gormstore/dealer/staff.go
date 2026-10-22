package dealerstore

import (
	"context"
	"errors"

	application "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var _ application.StaffRepository = (*Repository)(nil)

// RevokeMembership commits local denial before asynchronous relationship cleanup.
// The application separately enforces the fully consistent SpiceDB decision.
func (r *Repository) RevokeMembership(ctx context.Context, actor string, dealerID domain.ID, subject string, expected int64, changeID string, event audit.Event) (domain.Membership, error) {
	if actor == "" || dealerID == "" || subject == "" || expected < 1 || changeID == "" || !event.Valid() || event.ActorUserID != actor || event.OwnerUserID != actor || event.Action != audit.ResourceUpdated || event.Outcome != audit.Succeeded || event.TargetType != "dealer_membership" || event.TargetID != domain.MembershipKey(dealerID, subject) {
		return domain.Membership{}, ports.ErrInvalidArgument
	}
	var result domain.Membership
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Match the worker resource -> membership lock order before any row lock.
		var resourceLock struct{ ResourceType, ResourceID string }
		if err := tx.Table("authorization_resource_lock_models").Where("resource_type='dealer' AND resource_id=?", dealerID).Clauses(clause.Locking{Strength: "UPDATE"}).Take(&resourceLock).Error; err != nil {
			return err
		}
		var dealer model
		if err := tx.Where("id=? AND owner_user_id=?", dealerID, actor).Clauses(clause.Locking{Strength: "UPDATE"}).First(&dealer).Error; err != nil {
			return err
		}
		var owner membershipModel
		if err := tx.Where("dealer_id=? AND user_id=? AND role='owner' AND active AND granted_revision=revision", dealerID, actor).Clauses(clause.Locking{Strength: "UPDATE"}).First(&owner).Error; err != nil {
			return err
		}
		// Lock the account too: concurrent deactivation cannot pass this recheck.
		var account struct{ ID string }
		if err := tx.Table("user_models").Where("id=? AND status='active'", actor).Clauses(clause.Locking{Strength: "SHARE"}).Take(&account).Error; err != nil {
			return err
		}
		var current membershipModel
		if err := tx.Where("dealer_id=? AND user_id=?", dealerID, subject).Clauses(clause.Locking{Strength: "UPDATE"}).First(&current).Error; err != nil {
			return err
		}
		membership := domain.Membership{DealerID: domain.ID(current.DealerID), UserID: current.UserID, Role: domain.Role(current.Role), Active: current.Active, Revision: current.Revision, GrantedRevision: current.GrantedRevision, CreatedAt: current.CreatedAt, UpdatedAt: current.UpdatedAt}
		revoked, err := membership.Revoke(expected, event.OccurredAt)
		if errors.Is(err, domain.ErrRevisionConflict) {
			return ports.ErrConflict
		}
		if err != nil {
			return err
		}
		// The database ordering trigger assigns a strict resource-local successor.
		change := authorizationOutboxModel{ID: changeID, ResourceType: "dealer", ResourceID: string(dealerID), Relation: current.Role, SubjectType: "user", SubjectID: subject, OwnerUserID: actor, ActorUserID: actor, Operation: ports.AuthorizationDelete, CreatedAt: event.OccurredAt}
		if err := tx.Create(&change).Error; err != nil {
			return err
		}
		update := tx.Model(&membershipModel{}).Where("dealer_id=? AND user_id=? AND revision=?", dealerID, subject, expected).Updates(map[string]any{"active": false, "revision": revoked.Revision, "updated_at": revoked.UpdatedAt, "pending_authorization_change_id": nil, "pending_authorization_revision": nil})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected != 1 {
			return ports.ErrConflict
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		result = revoked
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = ports.ErrNotFound
	}
	if err != nil {
		return domain.Membership{}, err
	}
	return result, nil
}
