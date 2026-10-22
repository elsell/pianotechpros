package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

func StaffMember(member domain.Membership) dto.StaffMember {
	return dto.StaffMember{DealerID: string(member.DealerID), UserID: member.UserID, Role: string(member.Role), Active: member.Active, Revision: member.Revision, GrantPending: member.Active && member.GrantedRevision != member.Revision, CreatedAt: member.CreatedAt, UpdatedAt: member.UpdatedAt}
}
