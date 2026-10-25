package inventory

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

// HistoryRepository rechecks scoped authority and commits each read audit.
// Callers must first enforce fresh session, SpiceDB and principal rate limits.
type HistoryRepository interface {
	ListHistory(context.Context, string, string, string, domain.HistoryQuery, audit.Event) (domain.HistoryPage, error)
}
