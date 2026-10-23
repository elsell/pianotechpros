package dto

import "time"

type StaffInvitationCreate struct {
	Role           string `json:"role" enum:"editor,viewer" required:"true"`
	ExpiresInHours int    `json:"expiresInHours,omitempty" minimum:"1" maximum:"168" default:"72"`
}
type StaffInvitationToken struct {
	// Canonical encoding is validated by the application, avoiding validation
	// errors that echo a secret as an invalid field value.
	Token string `json:"token"`
}
type StaffInvitationPreview struct {
	ID         string    `json:"id"`
	DealerID   string    `json:"dealerID"`
	DealerName string    `json:"dealerName"`
	Role       string    `json:"role" enum:"editor,viewer"`
	ExpiresAt  time.Time `json:"expiresAt"`
}
type StaffInvitationIssued struct {
	StaffInvitationPreview
	Token string `json:"token"`
}

type StaffInvitationSummary struct {
	ID         string     `json:"id"`
	DealerID   string     `json:"dealerID"`
	Role       string     `json:"role" enum:"editor,viewer"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	ConsumedBy string     `json:"consumedBy,omitempty"`
	ConsumedAt *time.Time `json:"consumedAt,omitempty"`
	RevokedAt  *time.Time `json:"revokedAt,omitempty"`
}
