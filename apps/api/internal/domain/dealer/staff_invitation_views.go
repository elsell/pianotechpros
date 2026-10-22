package dealer

import "time"

type InvitationPreview struct {
	ID         string
	DealerID   ID
	DealerName string
	Role       Role
	ExpiresAt  time.Time
}
type IssuedInvitation struct {
	Invitation InvitationPreview
	Token      string
}

// InvitationSummary deliberately has no token or digest representation.
type InvitationSummary struct {
	ID                    string
	DealerID              ID
	Role                  Role
	CreatedAt, ExpiresAt  time.Time
	ConsumedBy            string
	ConsumedAt, RevokedAt time.Time
}
