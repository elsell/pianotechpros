// Package inventoryphotos composes the project-owned media extension without
// editing or replacing the generator-owned domain registry.
package inventoryphotos

import (
	"github.com/danielgtaylor/huma/v2"
	inventorystore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	inventoryapp "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func Registration(d generated.Dependencies, processor ports.PhotoProcessor) func(huma.API) {
	return func(api huma.API) {
		repository := inventorystore.New(d.DB)
		service := inventoryapp.New(inventoryapp.Dependencies{Auth: d.Auth, Authorizer: d.Authorizer, Repository: repository, Audits: d.Audits, AuditRateLimiter: d.AuditRateLimiter, Clock: d.Clock, Probe: d.Probe, NewID: d.NewID, PhotoProcessor: processor})
		routes.RegisterPhotos(api, service)
	}
}
