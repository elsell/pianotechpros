package inquiry

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
)

// InboxRepository rechecks current actor/dealer authority and commits audit with
// every successful operation. Preflight SpiceDB permission is separately required.
type InboxRepository interface {
	GetInboxInquiry(context.Context, string, string, string, audit.Event) (domain.Inquiry, error)
	ListInboxInquiries(context.Context, string, string, domain.ListQuery, audit.Event) (domain.Page, error)
	MarkInboxInquiryRead(context.Context, string, string, string, int64, audit.Event) (domain.Inquiry, error)
}
