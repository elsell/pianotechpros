package dto

import (
	inventory "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	"time"
)

type BuyerContact struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	Phone      string `json:"phone"`
	Message    string `json:"message"`
	Preference string `json:"preference" enum:"email,phone,either"`
}
type InboxInquiry struct {
	ID         string                  `json:"id"`
	DealerName string                  `json:"dealerName"`
	DealerSlug string                  `json:"dealerSlug"`
	Piano      inventory.PublicListing `json:"piano"`
	Contact    BuyerContact            `json:"contact"`
	CreatedAt  time.Time               `json:"createdAt"`
	Revision   int64                   `json:"revision"`
	ReadAt     *time.Time              `json:"readAt,omitempty"`
	ReadBy     string                  `json:"readBy,omitempty"`
}
type AcknowledgeInquiry struct {
	Revision int64 `json:"revision" minimum:"1" maximum:"2"`
}
