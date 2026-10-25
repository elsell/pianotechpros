package inquiry

import (
	"context"
	"time"

	"github.com/danielgtaylor/huma/v2"
	dealerstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/ratelimit"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/turnstile"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/config"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

type sourceBudget struct{ limiter *ratelimit.Limiter }

func (b sourceBudget) Allow(ctx context.Context, source string, at time.Time) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	return b.limiter.AllowContext(ctx, "inquiry:"+source, at)
}

func Registration(db *gorm.DB, cfg config.Config, clock ports.Clock, newID func() string, probe ports.Probe) (func(huma.API), error) {
	var service *app.Service
	if cfg.InquiryChallengePolicy != "" {
		policy := app.ChallengePolicy(cfg.InquiryChallengePolicy)
		if policy != app.ChallengeEnabled && policy != app.ChallengeDisabled {
			return nil, ports.ErrInvalidArgument
		}
		var verifier app.ChallengeVerifier
		if policy == app.ChallengeEnabled {
			configured, err := turnstile.New(cfg.TurnstileSecret, cfg.TurnstileHostname, clock)
			if err != nil {
				return nil, err
			}
			verifier = configured
		} else if cfg.TurnstileSecret != "" || cfg.TurnstileHostname != "" {
			return nil, ports.ErrInvalidArgument
		}
		if db == nil || clock == nil || newID == nil {
			return nil, ports.ErrAuthorizationPolicyNotConfigured
		}
		limiter, err := ratelimit.New(db, "request", 5, time.Minute, cfg.RequestLimiterSources)
		if err != nil {
			return nil, err
		}
		service = app.New(app.Dependencies{Repository: dealerstore.New(db), Limiter: sourceBudget{limiter}, Challenge: verifier, ChallengePolicy: policy, Clock: clock, NewID: newID, Probe: probe})
	} else if cfg.TurnstileSecret != "" || cfg.TurnstileHostname != "" {
		return nil, ports.ErrInvalidArgument
	}
	return func(api huma.API) { routes.Register(api, service) }, nil
}
