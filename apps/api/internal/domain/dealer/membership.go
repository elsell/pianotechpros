package dealer

import (
	"errors"
	"math"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

type Capability string

const (
	View             Capability = "view"
	ManageProfile    Capability = "manage_profile"
	ManageMembers    Capability = "manage_members"
	ManageInventory  Capability = "manage_inventory"
	PublishInventory Capability = "publish_inventory"
	ManageInquiries  Capability = "manage_inquiries"
)

var (
	ErrInvalidMembership  = errors.New("invalid membership")
	ErrInvalidStaffRole   = errors.New("invalid staff role")
	ErrOwnerImmutable     = errors.New("founding owner cannot be changed")
	ErrRevisionConflict   = errors.New("membership revision conflict")
	ErrInactiveMembership = errors.New("membership is inactive")
	ErrActiveMembership   = errors.New("membership is already active")
)

type Membership struct {
	DealerID             ID
	UserID               string
	Role                 Role
	Active               bool
	Revision             int64
	GrantedRevision      int64
	CreatedAt, UpdatedAt time.Time
}

func staffRole(role Role) bool { return role == RoleEditor || role == RoleViewer }
func validStaffID(id string) bool {
	if id == "" || len(id) > 128 || strings.TrimSpace(id) != id || !utf8.ValidString(id) {
		return false
	}
	for _, r := range id {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}
func (m Membership) Valid() bool {
	return validStaffID(string(m.DealerID)) && validStaffID(m.UserID) && (m.Role == RoleOwner || staffRole(m.Role)) && m.Revision > 0 && m.GrantedRevision >= 0 && m.GrantedRevision <= m.Revision && !m.CreatedAt.IsZero() && !m.UpdatedAt.Before(m.CreatedAt)
}
func NewStaffMembership(dealerID ID, userID string, role Role, now time.Time) (Membership, error) {
	if !staffRole(role) {
		return Membership{}, ErrInvalidStaffRole
	}
	m := Membership{DealerID: dealerID, UserID: userID, Role: role, Active: true, Revision: 1, CreatedAt: now.UTC(), UpdatedAt: now.UTC()}
	if !m.Valid() {
		return Membership{}, ErrInvalidMembership
	}
	return m, nil
}

// Allows is the local role gate. A successful SpiceDB decision is separately
// required; old remote relationships cannot override local revocation/downgrade.
func (m Membership) Allows(capability Capability) bool {
	if !m.Valid() || !m.Active || m.GrantedRevision != m.Revision {
		return false
	}
	switch capability {
	case View:
		return true
	case ManageProfile, ManageMembers:
		return m.Role == RoleOwner
	case ManageInventory, PublishInventory, ManageInquiries:
		return m.Role == RoleOwner || m.Role == RoleEditor
	default:
		return false
	}
}
func (m Membership) mutable(expected int64, now time.Time) error {
	if !m.Valid() || now.Before(m.UpdatedAt) || m.Revision == math.MaxInt64 {
		return ErrInvalidMembership
	}
	if m.Role == RoleOwner {
		return ErrOwnerImmutable
	}
	if expected != m.Revision {
		return ErrRevisionConflict
	}
	return nil
}
func (m Membership) ChangeRole(role Role, expected int64, now time.Time) (Membership, error) {
	if err := m.mutable(expected, now); err != nil {
		return Membership{}, err
	}
	if !staffRole(role) {
		return Membership{}, ErrInvalidStaffRole
	}
	if !m.Active {
		return Membership{}, ErrInactiveMembership
	}
	m.Role = role
	m.Revision++
	m.UpdatedAt = now.UTC()
	return m, nil
}
func (m Membership) Revoke(expected int64, now time.Time) (Membership, error) {
	if err := m.mutable(expected, now); err != nil {
		return Membership{}, err
	}
	if !m.Active {
		return Membership{}, ErrInactiveMembership
	}
	m.Active = false
	m.Revision++
	m.UpdatedAt = now.UTC()
	return m, nil
}

// Reactivate is used only by one-time invitation consumption, never role editing.
func (m Membership) Reactivate(role Role, now time.Time) (Membership, error) {
	if err := m.mutable(m.Revision, now); err != nil {
		return Membership{}, err
	}
	if !staffRole(role) {
		return Membership{}, ErrInvalidStaffRole
	}
	if m.Active {
		return Membership{}, ErrActiveMembership
	}
	m.Active = true
	m.Role = role
	m.Revision++
	m.UpdatedAt = now.UTC()
	return m, nil
}

// ConfirmGrant is called only by transactional outbox completion after matching
// the pending relationship change. Stale completion cannot activate a new role.
func (m Membership) ConfirmGrant(expected int64, now time.Time) (Membership, error) {
	if !m.Valid() || now.Before(m.UpdatedAt) {
		return Membership{}, ErrInvalidMembership
	}
	if expected != m.Revision {
		return Membership{}, ErrRevisionConflict
	}
	if !m.Active {
		return Membership{}, ErrInactiveMembership
	}
	if m.GrantedRevision == m.Revision {
		return m, nil
	}
	m.GrantedRevision = m.Revision
	m.UpdatedAt = now.UTC()
	return m, nil
}
