package inventory

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

// PublicationState is private application state. Public delivery must independently
// check publication and showroom visibility and expose only the public listing.
type PublicationState = domain.PublicationRecord

// PublicationRepository requires request-local session/SpiceDB/rate-limit policy
// first and rechecks local authority inside each audited transaction.
type PublicationRepository interface {
	GetPublication(context.Context, string, string, string, audit.Event) (PublicationState, error)
	PublishRecord(context.Context, string, string, string, int64, audit.Event) (PublicationState, error)
	UnpublishRecord(context.Context, string, string, string, int64, audit.Event) (PublicationState, error)
	TransitionRecord(context.Context, string, string, string, int64, domain.Status, *domain.Money, string, audit.Event) (PublicationState, error)
}
