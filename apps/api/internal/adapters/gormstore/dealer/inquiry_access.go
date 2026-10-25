package dealerstore

import (
	"context"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
)

var _ app.InboxMembershipReader = (*Repository)(nil)

// InquiryAccess reads actor-scoped membership. Inbox transactions must lock and
// recheck it before returning contact details or recording acknowledgment.
func (r *Repository) InquiryAccess(ctx context.Context, actor, dealerID string) (app.DealerAccess, error) {
	access, err := r.DealerAccess(ctx, actor, dealerID)
	if err != nil {
		return app.DealerAccess{}, err
	}
	return app.DealerAccess{OwnerUserID: access.OwnerUserID, UserActive: access.UserActive, Membership: access.Membership}, nil
}
