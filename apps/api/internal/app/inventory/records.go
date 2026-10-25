package inventory

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

// RecordRepository rechecks local authority and commits operation audit in its transaction.
// Callers must first enforce the request-local policy, including SpiceDB and rate limits.
type RecordRepository interface {
	ReviseAttributedRecord(context.Context, string, string, string, int64, domain.Attributes, []string, audit.Event) (domain.Record, error)
	CreateDraft(context.Context, string, domain.Record, string, audit.Event) (domain.Record, bool, error)
	GetRecord(context.Context, string, string, string, audit.Event) (domain.Record, error)
}

// ListingRepository returns only an actor-authorized, audited dealer page.
type ListingRepository interface {
	ListRecords(context.Context, string, string, domain.ListQuery, audit.Event) (domain.Page, error)
}
