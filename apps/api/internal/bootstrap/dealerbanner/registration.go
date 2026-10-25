// Package dealerbanner composes project-owned banner delivery outside the generated registry.
package dealerbanner

import (
	"github.com/danielgtaylor/huma/v2"
	store "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/routes"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func Registration(d generated.Dependencies, processor ports.PhotoProcessor) func(huma.API) {
	return func(api huma.API) {
		repository := store.New(d.DB)
		service := app.New(app.Dependencies{Auth: d.Auth, Authorizer: d.Authorizer, Repository: repository, Banners: repository, BannerProcessor: processor, Audits: d.Audits, AuditRateLimiter: d.AuditRateLimiter, Clock: d.Clock, Probe: d.Probe, NewID: d.NewID})
		routes.RegisterBanner(api, service)
	}
}
