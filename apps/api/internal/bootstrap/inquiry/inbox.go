package inquiry

import (
	"github.com/danielgtaylor/huma/v2"
	dealerstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/routes"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
)

func InboxRegistration(d generated.Dependencies) func(huma.API) {
	return func(api huma.API) {
		var repository app.InboxRepository
		var memberships app.InboxMembershipReader
		if d.DB != nil {
			repository = dealerstore.New(d.DB)
			memberships = dealerstore.New(d.DB)
		}
		service := app.NewInbox(app.InboxDependencies{Access: app.InboxAccessDependencies{Auth: d.Auth, Memberships: memberships, Authorizer: d.Authorizer, Audits: d.Audits, Limiter: d.AuditRateLimiter, Clock: d.Clock}, Repository: repository, CursorSigningKey: d.CursorSigningKey, Probe: d.Probe})
		routes.RegisterInbox(api, service)
	}
}
