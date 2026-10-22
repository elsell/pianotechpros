package dealer

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"time"
)

type PageRequest struct {
	AfterID      domain.ID
	AfterCreated time.Time
	Snapshot     time.Time
	Limit        int
}

type Page struct {
	Items   []domain.Entity
	HasMore bool
}

type Repository interface {
	StaffRepository
	StaffInvitations
	Create(context.Context, domain.Entity, ports.AuthorizationChange, ports.Idempotency, audit.Event) (domain.Entity, bool, error)
	List(context.Context, string, PageRequest) (Page, error)
	Get(context.Context, string, domain.ID) (domain.Entity, error)
	GetCreationOwner(context.Context, string, domain.ID) (domain.Entity, error)
	Update(context.Context, string, domain.Entity, audit.Event) error
	Delete(context.Context, string, domain.ID, ports.AuthorizationChange, audit.Event) error
}

// StaffRepository is separate from profile persistence so membership mutation
// cannot accidentally become a generic profile CRUD operation.
type StaffRepository interface {
	ChangeMembershipRole(context.Context, string, domain.ID, string, domain.Role, int64, string, string, audit.Event) (domain.Membership, error)
	RevokeMembership(context.Context, string, domain.ID, string, int64, string, audit.Event) (domain.Membership, error)
}

// StaffInvitations is the capability for invitation transactions. Account
// provisioning remains a separate platform capability and cannot be bypassed.
type InvitationCandidate struct {
	Invitation domain.StaffInvitation
	DealerName string
}

type StaffInvitations interface {
	StaffInvitationCandidate(context.Context, string, domain.ID, string, [32]byte) (InvitationCandidate, error)
	CreateStaffInvitation(context.Context, string, domain.StaffInvitation, audit.Event) error
	RevokeStaffInvitation(context.Context, string, domain.ID, string, audit.Event) error
	AcceptStaffInvitation(context.Context, string, domain.ID, string, [32]byte, string, audit.Event, ports.Clock) (domain.Membership, error)
}
