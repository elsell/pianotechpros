package dealerstore

import (
	"context"
	"errors"
	"time"

	application "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var _ application.StaffInvitations = (*Repository)(nil)

type invitationModel struct {
	ID                          string `gorm:"primaryKey"`
	DealerID, OwnerUserID, Role string
	TokenDigest                 []byte
	CreatedAt, ExpiresAt        time.Time
	ConsumedBy                  *string
	ConsumedAt, RevokedAt       *time.Time
}

func (invitationModel) TableName() string { return "dealer_staff_invitations" }
func invitationEntity(row invitationModel) domain.StaffInvitation {
	i := domain.StaffInvitation{ID: row.ID, DealerID: domain.ID(row.DealerID), OwnerUserID: row.OwnerUserID, Role: domain.Role(row.Role), CreatedAt: row.CreatedAt, ExpiresAt: row.ExpiresAt}
	if len(row.TokenDigest) == 32 {
		copy(i.TokenDigest[:], row.TokenDigest)
	}
	if row.ConsumedBy != nil {
		i.ConsumedBy = *row.ConsumedBy
	}
	if row.ConsumedAt != nil {
		i.ConsumedAt = *row.ConsumedAt
	}
	if row.RevokedAt != nil {
		i.RevokedAt = *row.RevokedAt
	}
	return i
}
func validInvitationAudit(event audit.Event, actor, owner, id string, action audit.Action) bool {
	return event.Valid() && event.ActorUserID == actor && event.OwnerUserID == owner && event.TargetType == "dealer_staff_invitation" && event.TargetID == id && event.Action == action && event.Outcome == audit.Succeeded
}
func (r *Repository) CreateStaffInvitation(ctx context.Context, actor string, invite domain.StaffInvitation, event audit.Event) error {
	if actor == "" || actor != invite.OwnerUserID || !invite.Valid() || invite.ConsumedBy != "" || !invite.ConsumedAt.IsZero() || !invite.RevokedAt.IsZero() || !event.OccurredAt.Equal(invite.CreatedAt) || !validInvitationAudit(event, actor, actor, invite.ID, audit.InvitationCreated) {
		return ports.ErrInvalidArgument
	}
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockStaffOwner(tx, actor, invite.DealerID); err != nil {
			return err
		}
		row := invitationModel{ID: invite.ID, DealerID: string(invite.DealerID), OwnerUserID: actor, Role: string(invite.Role), TokenDigest: append([]byte(nil), invite.TokenDigest[:]...), CreatedAt: invite.CreatedAt, ExpiresAt: invite.ExpiresAt}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		return tx.Create(fromAudit(event)).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ports.ErrNotFound
	}
	return err
}
func (r *Repository) RevokeStaffInvitation(ctx context.Context, actor string, dealerID domain.ID, id string, event audit.Event) error {
	if actor == "" || dealerID == "" || id == "" || !validInvitationAudit(event, actor, actor, id, audit.InvitationRevoked) {
		return ports.ErrInvalidArgument
	}
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockStaffOwner(tx, actor, dealerID); err != nil {
			return err
		}
		var row invitationModel
		if err := tx.Where("id=? AND dealer_id=? AND owner_user_id=?", id, dealerID, actor).Clauses(clause.Locking{Strength: "UPDATE"}).First(&row).Error; err != nil {
			return err
		}
		next, err := invitationEntity(row).Revoke(event.OccurredAt)
		if err != nil {
			return err
		}
		if err := tx.Model(&invitationModel{}).Where("id=?", id).Update("revoked_at", next.RevokedAt).Error; err != nil {
			return err
		}
		return tx.Create(fromAudit(event)).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ports.ErrNotFound
	}
	return err
}
func (r *Repository) AcceptStaffInvitation(ctx context.Context, actor string, dealerID domain.ID, id string, digest [32]byte, changeID string, event audit.Event, clock ports.Clock) (domain.Membership, error) {
	if actor == "" || dealerID == "" || id == "" || digest == ([32]byte{}) || changeID == "" || clock == nil || !validInvitationAudit(event, actor, event.OwnerUserID, id, audit.InvitationConsumed) {
		return domain.Membership{}, ports.ErrInvalidArgument
	}
	var result domain.Membership
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockStaffOwner(tx, event.OwnerUserID, dealerID); err != nil {
			return err
		}
		var row invitationModel
		if err := tx.Where("id=? AND dealer_id=? AND owner_user_id=? AND token_digest=?", id, dealerID, event.OwnerUserID, digest[:]).Clauses(clause.Locking{Strength: "UPDATE"}).First(&row).Error; err != nil {
			return err
		}
		var account struct{ ID string }
		if err := tx.Table("user_models").Where("id=? AND status='active'", actor).Clauses(clause.Locking{Strength: "SHARE"}).Take(&account).Error; err != nil {
			return err
		}
		var current membershipModel
		found := tx.Where("dealer_id=? AND user_id=?", dealerID, actor).Clauses(clause.Locking{Strength: "UPDATE"}).First(&current).Error
		if found != nil && !errors.Is(found, gorm.ErrRecordNotFound) {
			return found
		}
		// Read the injected clock only after locks: request-start time may be stale.
		now := clock.Now().UTC()
		invite, err := invitationEntity(row).Consume(actor, now)
		if err != nil {
			return err
		}
		var member domain.Membership
		if errors.Is(found, gorm.ErrRecordNotFound) {
			member, err = domain.NewStaffMembership(dealerID, actor, invite.Role, now)
		} else {
			member = domain.Membership{DealerID: domain.ID(current.DealerID), UserID: current.UserID, Role: domain.Role(current.Role), Active: current.Active, Revision: current.Revision, GrantedRevision: current.GrantedRevision, CreatedAt: current.CreatedAt, UpdatedAt: current.UpdatedAt}
			member, err = member.Reactivate(invite.Role, now)
		}
		if err != nil {
			return err
		}
		change := authorizationOutboxModel{ID: changeID, ResourceType: "dealer", ResourceID: string(dealerID), Relation: string(member.Role), SubjectType: "user", SubjectID: actor, OwnerUserID: invite.OwnerUserID, ActorUserID: actor, Operation: ports.AuthorizationTouch, CreatedAt: now}
		if err := tx.Create(&change).Error; err != nil {
			return err
		}
		if errors.Is(found, gorm.ErrRecordNotFound) {
			newMember := membershipModel{DealerID: string(dealerID), UserID: actor, Role: string(member.Role), Active: true, Revision: member.Revision, GrantedRevision: member.GrantedRevision, PendingAuthorizationChangeID: &changeID, PendingAuthorizationRevision: &member.Revision, CreatedAt: member.CreatedAt, UpdatedAt: member.UpdatedAt}
			if err := tx.Create(&newMember).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Model(&membershipModel{}).Where("dealer_id=? AND user_id=?", dealerID, actor).Updates(map[string]any{"role": string(member.Role), "active": true, "revision": member.Revision, "updated_at": member.UpdatedAt, "pending_authorization_change_id": changeID, "pending_authorization_revision": member.Revision}).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&invitationModel{}).Where("id=?", id).Updates(map[string]any{"consumed_by": actor, "consumed_at": invite.ConsumedAt}).Error; err != nil {
			return err
		}
		event.OccurredAt = now
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		result = member
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = domain.ErrInvalidInvitation
	}
	if err != nil {
		return domain.Membership{}, err
	}
	return result, nil
}

// StaffInvitationCandidate returns an internal authorization candidate, not a
// preview. The application must validate expiry and issuer SpiceDB permission.
func (r *Repository) StaffInvitationCandidate(ctx context.Context, actor string, dealerID domain.ID, id string, digest [32]byte) (application.InvitationCandidate, error) {
	if actor == "" || dealerID == "" || id == "" || digest == ([32]byte{}) {
		return application.InvitationCandidate{}, domain.ErrInvalidInvitation
	}
	var row struct {
		Invitation invitationModel `gorm:"embedded"`
		DealerName string
	}
	err := r.DB.WithContext(ctx).Table("dealer_staff_invitations AS i").Select("i.*, d.name AS dealer_name").
		Joins("JOIN dealer_models d ON d.id=i.dealer_id AND d.owner_user_id=i.owner_user_id").
		Joins("JOIN dealer_memberships m ON m.dealer_id=d.id AND m.user_id=i.owner_user_id AND m.role='owner' AND m.active AND m.granted_revision=m.revision").
		Joins("JOIN user_models issuer ON issuer.id=i.owner_user_id AND issuer.status='active'").
		Where("i.id=? AND i.dealer_id=? AND i.token_digest=? AND i.consumed_at IS NULL AND i.revoked_at IS NULL", id, dealerID, digest[:]).
		Where("EXISTS (SELECT 1 FROM user_models recipient WHERE recipient.id=? AND recipient.status='active')", actor).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = domain.ErrInvalidInvitation
	}
	if err != nil {
		return application.InvitationCandidate{}, err
	}
	return application.InvitationCandidate{Invitation: invitationEntity(row.Invitation), DealerName: row.DealerName}, nil
}
