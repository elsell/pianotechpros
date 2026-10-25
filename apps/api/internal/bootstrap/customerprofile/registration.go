// Package customerprofile composes the private account-owned profile surface.
package customerprofile

import (
	"github.com/danielgtaylor/huma/v2"
	customerstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/timezones"
	customerapp "github.com/elsell/pianotechpros/apps/api/internal/app/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
)

func Registration(d generated.Dependencies) (func(huma.API), error) {
	zones, err := timezones.New()
	if err != nil {
		return nil, err
	}
	return func(api huma.API) {
		service := customerapp.NewProfiles(customerapp.Dependencies{Auth: d.Auth, Authorizer: d.Authorizer, AuthorizationOutbox: d.AuthorizationOutbox, AuthorizationSerializer: d.AuthorizationSerializer, Repository: customerstore.New(d.DB, zones), Audits: d.Audits, AuditRateLimiter: d.AuditRateLimiter, Clock: d.Clock, Probe: d.Probe, NewID: d.NewID, AuthorizationWorker: d.AuthorizationWorker, AuthorizationLease: d.AuthorizationLease}, zones)
		routes.RegisterProfiles(api, service)
	}, nil
}
