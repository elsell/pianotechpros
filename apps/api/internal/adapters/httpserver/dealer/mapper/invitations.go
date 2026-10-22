package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

func StaffInvitation(p domain.InvitationPreview) dto.StaffInvitationPreview {
	return dto.StaffInvitationPreview{ID: p.ID, DealerID: string(p.DealerID), DealerName: p.DealerName, Role: string(p.Role), ExpiresAt: p.ExpiresAt}
}
