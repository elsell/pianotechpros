package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/dto"
	inventory "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
)

func Inbox(entry domain.Inquiry) dto.InboxInquiry {
	state := entry.State()
	return dto.InboxInquiry{ID: state.ID, DealerName: state.DealerName, DealerSlug: state.DealerSlug, Piano: inventory.PublicListing(state.Piano), Contact: dto.BuyerContact{Name: state.Contact.Name, Email: state.Contact.Email, Phone: state.Contact.Phone, Message: state.Contact.Message, Preference: string(state.Contact.Preference)}, CreatedAt: state.CreatedAt, Revision: state.Revision, ReadAt: state.ReadAt, ReadBy: state.ReadBy}
}
