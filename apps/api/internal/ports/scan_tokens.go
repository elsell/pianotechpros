package ports

import "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"

// ScanTokens supplies cryptographically random private record identifiers.
// Failure must not fall back to predictable identifiers.
type ScanTokens interface {
	NewScanToken() (inventory.ScanToken, error)
}
