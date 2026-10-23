package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

func StaffInvitation(p domain.InvitationPreview) dto.StaffInvitationPreview {
	return dto.StaffInvitationPreview{ID: p.ID, DealerID: string(p.DealerID), DealerName: p.DealerName, Role: string(p.Role), ExpiresAt: p.ExpiresAt}
}

func StaffInvitationSummary(i domain.InvitationSummary) dto.StaffInvitationSummary {
	out := dto.StaffInvitationSummary{ID: i.ID, DealerID: string(i.DealerID), Role: string(i.Role), CreatedAt: i.CreatedAt, ExpiresAt: i.ExpiresAt, ConsumedBy: i.ConsumedBy}
	if !i.ConsumedAt.IsZero() {
		value := i.ConsumedAt
		out.ConsumedAt = &value
	}
	if !i.RevokedAt.IsZero() {
		value := i.RevokedAt
		out.RevokedAt = &value
	}
	return out
}
