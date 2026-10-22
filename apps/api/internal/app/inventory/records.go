package inventory

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

// RecordRepository rechecks local authority and commits operation audit in its transaction.
// Callers must first enforce the request-local policy, including SpiceDB and rate limits.
type RecordRepository interface {
	CreateDraft(context.Context, string, domain.Record, string, audit.Event) (domain.Record, bool, error)
	GetRecord(context.Context, string, string, string, audit.Event) (domain.Record, error)
}
