package inventory

import (
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"time"
)

// Dependencies is the complete platform capability set available to this
// domain service. Keep policy and product behavior in this package; adapters are
// injected through these ports by the generated composition registry.
type Dependencies struct {
	Auth                    ports.Authenticator
	Authorizer              ports.Authorizer
	AuthorizationOutbox     ports.AuthorizationOutbox
	AuthorizationSerializer ports.AuthorizationSerializer
	Repository              Repository
	Audits                  ports.Audits
	AuditRateLimiter        ports.AuditRateLimiter
	Clock                   ports.Clock
	Probe                   ports.Probe
	NewID                   func() string
	AuthorizationWorker     string
	AuthorizationLease      time.Duration
	CursorSigningKey        []byte
}

// Repository combines the generated persistence boundary with scoped membership.
type Repository interface {
	RecordRepository
	MembershipReader
}
type Service struct{ *Commands }

func New(d Dependencies) *Service {
	return &Service{Commands: NewCommands(CommandDependencies{Access: AccessDependencies{Auth: d.Auth, Memberships: d.Repository, Authorizer: d.Authorizer, Audits: d.Audits, Limiter: d.AuditRateLimiter, Clock: d.Clock}, Records: d.Repository, SupportedCurrency: supportedCurrency, NewID: d.NewID, Probe: d.Probe})}

}

// supportedCurrency is the explicit composition policy from record.spec.md.
func supportedCurrency(code string) bool {
	switch code {
	case "USD", "CAD", "EUR", "GBP", "AUD", "NZD", "JPY", "CHF":
		return true
	default:
		return false
	}
}
