// Package technicianprofile composes the private account-owned profile surface.
package technicianprofile

import (
	"github.com/danielgtaylor/huma/v2"
	technicianstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/technician"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/timezones"
	technicianapp "github.com/elsell/pianotechpros/apps/api/internal/app/technician"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
)

func Registration(d generated.Dependencies) (func(huma.API), error) {
	zones, err := timezones.New()
	if err != nil {
		return nil, err
	}
	return func(api huma.API) {
		service := technicianapp.NewProfiles(technicianapp.Dependencies{Auth: d.Auth, Authorizer: d.Authorizer, AuthorizationOutbox: d.AuthorizationOutbox, AuthorizationSerializer: d.AuthorizationSerializer, Repository: technicianstore.New(d.DB, zones), Audits: d.Audits, AuditRateLimiter: d.AuditRateLimiter, Clock: d.Clock, Probe: d.Probe, NewID: d.NewID, AuthorizationWorker: d.AuthorizationWorker, AuthorizationLease: d.AuthorizationLease}, zones)
		routes.RegisterProfiles(api, service)
	}, nil
}
