package dealer

import (
	"errors"
	"time"
)

var ErrInvalidInvitation = errors.New("invalid staff invitation")

type StaffInvitation struct {
	ID                    string
	DealerID              ID
	OwnerUserID           string
	Role                  Role
	TokenDigest           [32]byte
	CreatedAt, ExpiresAt  time.Time
	ConsumedBy            string
	ConsumedAt, RevokedAt time.Time
}

func NewStaffInvitation(id string, dealerID ID, owner string, role Role, digest [32]byte, created, expires time.Time) (StaffInvitation, error) {
	invitation := StaffInvitation{ID: id, DealerID: dealerID, OwnerUserID: owner, Role: role, TokenDigest: digest, CreatedAt: created.UTC(), ExpiresAt: expires.UTC()}
	if !invitation.Valid() {
		return StaffInvitation{}, ErrInvalidInvitation
	}
	return invitation, nil
}
func (i StaffInvitation) Valid() bool {
	lifetime := i.ExpiresAt.Sub(i.CreatedAt)
	if !validStaffID(i.ID) || !validStaffID(string(i.DealerID)) || !validStaffID(i.OwnerUserID) || !staffRole(i.Role) || i.TokenDigest == ([32]byte{}) || i.CreatedAt.IsZero() || lifetime < time.Hour || lifetime > 7*24*time.Hour {
		return false
	}
	if i.ConsumedAt.IsZero() {
		if i.ConsumedBy != "" {
			return false
		}
	} else {
		if !validStaffID(i.ConsumedBy) || i.ConsumedBy == i.OwnerUserID || i.ConsumedAt.Before(i.CreatedAt) || !i.ConsumedAt.Before(i.ExpiresAt) || !i.RevokedAt.IsZero() {
			return false
		}
	}
	return i.RevokedAt.IsZero() || !i.RevokedAt.Before(i.CreatedAt)
}
func (i StaffInvitation) Available(now time.Time) bool {
	return i.Valid() && !now.Before(i.CreatedAt) && now.Before(i.ExpiresAt) && i.ConsumedAt.IsZero() && i.RevokedAt.IsZero()
}
func (i StaffInvitation) Consume(userID string, now time.Time) (StaffInvitation, error) {
	if !i.Available(now) || !validStaffID(userID) || userID == i.OwnerUserID {
		return StaffInvitation{}, ErrInvalidInvitation
	}
	i.ConsumedBy = userID
	i.ConsumedAt = now.UTC()
	return i, nil
}
func (i StaffInvitation) Revoke(now time.Time) (StaffInvitation, error) {
	if !i.Valid() || now.Before(i.CreatedAt) || !i.ConsumedAt.IsZero() || !i.RevokedAt.IsZero() {
		return StaffInvitation{}, ErrInvalidInvitation
	}
	i.RevokedAt = now.UTC()
	return i, nil
}
