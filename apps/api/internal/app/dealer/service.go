package dealer

import (
	"context"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
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

type Service struct{ Dependencies }

func New(dependencies Dependencies) *Service {
	return &Service{Dependencies: dependencies}
}

// requireConfiguredPolicy authenticates before returning the fail-closed
// scaffold result. Replace calls to this helper with the domain's specified
// authorization policy and use cases; never remove authentication or permit a
// request merely because its persistence row exists.
func (s *Service) requireConfiguredPolicy(ctx context.Context, authorization string) error {
	if s.Auth == nil {
		return ports.ErrAuthorizationPolicyNotConfigured
	}
	if _, err := s.Auth.Authenticate(ctx, authorization); err != nil {
		return err
	}
	return ports.ErrAuthorizationPolicyNotConfigured
}

func (s *Service) Delete(ctx context.Context, authorization string, _ domain.ID) error {
	return s.requireConfiguredPolicy(ctx, authorization)
}
