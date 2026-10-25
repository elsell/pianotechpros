// Package inventoryscan composes the project-owned private scan extension.
package inventoryscan

import (
	"github.com/danielgtaylor/huma/v2"
	inventorystore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	inventoryapp "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func Registration(d generated.Dependencies, tokens ports.ScanTokens) func(huma.API) {
	return func(api huma.API) {
		service := inventoryapp.New(inventoryapp.Dependencies{Auth: d.Auth, Authorizer: d.Authorizer, Repository: inventorystore.New(d.DB), Audits: d.Audits, AuditRateLimiter: d.AuditRateLimiter, Clock: d.Clock, Probe: d.Probe, NewID: d.NewID, ScanTokens: tokens})
		routes.RegisterScan(api, service)
	}
}
