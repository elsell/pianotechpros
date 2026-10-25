package inventory

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

var ErrScanUnavailable = errors.New("inventory_scan_unavailable")

// ScanRepository rechecks scoped local authority and commits each operation's audit.
// Callers must enforce fresh session, SpiceDB and principal limiting first.
type ScanRepository interface {
	EnsureScanLabel(context.Context, string, domain.ScanLabel, audit.Event) (domain.ScanLabel, bool, error)
	ResolveScanLabel(context.Context, string, string, domain.ScanToken, audit.Event) (domain.ScanLabel, error)
}
