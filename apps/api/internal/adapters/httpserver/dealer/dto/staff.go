package dto

import "time"

type StaffRoleChange struct {
	ExpectedRevision int64  `json:"expectedRevision" minimum:"1" required:"true"`
	Role             string `json:"role" enum:"editor,viewer" required:"true"`
}
type StaffRevocation struct {
	ExpectedRevision int64 `json:"expectedRevision" minimum:"1" required:"true"`
}
type StaffMember struct {
	DealerID     string    `json:"dealerID"`
	UserID       string    `json:"userID"`
	Role         string    `json:"role" enum:"owner,editor,viewer"`
	Active       bool      `json:"active"`
	Revision     int64     `json:"revision" minimum:"1"`
	GrantPending bool      `json:"grantPending"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
