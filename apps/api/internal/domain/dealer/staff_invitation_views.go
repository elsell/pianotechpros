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
