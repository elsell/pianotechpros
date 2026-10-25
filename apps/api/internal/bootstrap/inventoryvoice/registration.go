package inventoryvoice

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/geminivoice"
	inventorystore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/routes"
	inventoryapp "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/config"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
)

func Registration(d generated.Dependencies, cfg config.Config) (func(huma.API), error) {
	if err := cfg.ValidateVoice(); err != nil {
		return nil, err
	}
	dependencies := inventoryapp.Dependencies{Auth: d.Auth, Authorizer: d.Authorizer, Repository: inventorystore.New(d.DB), Audits: d.Audits, AuditRateLimiter: d.AuditRateLimiter, Clock: d.Clock, Probe: d.Probe, NewID: d.NewID}
	if cfg.GeminiAPIKey != "" {
		provider, err := geminivoice.New(cfg.GeminiAPIKey, cfg.VoiceTranscriptionModel, cfg.VoiceExtractionModel)
		if err != nil {
			return nil, err
		}
		dependencies.VoiceExtractor = provider
		dependencies.VoiceTranscriber = provider
	}
	return func(api huma.API) { routes.RegisterVoice(api, inventoryapp.New(dependencies)) }, nil
}
