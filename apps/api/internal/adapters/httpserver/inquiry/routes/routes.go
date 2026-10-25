package routes

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type SubmissionInput struct {
	Slug string `path:"slug" maxLength:"80"`
	ID   string `path:"id" maxLength:"128"`
	Body struct {
		Name       string `json:"name,omitempty" maxLength:"120"`
		Email      string `json:"email,omitempty" maxLength:"254"`
		Phone      string `json:"phone,omitempty" maxLength:"40"`
		Message    string `json:"message,omitempty" maxLength:"4000"`
		Preference string `json:"preference,omitempty"`
		Honeypot   string `json:"honeypot,omitempty" maxLength:"256"`
		Challenge  string `json:"challenge,omitempty" maxLength:"4096"`
	}
}

func submissionError(err error) error {
	switch {
	case errors.Is(err, app.ErrChallenge):
		return &shared.APIError{Status: 400, Code: "inquiry_challenge_rejected", Title: "Bad Request", Detail: "challenge rejected"}
	case errors.Is(err, ports.ErrInvalidArgument), errors.Is(err, domain.ErrInvalid):
		return huma.Error400BadRequest("invalid request")
	case errors.Is(err, ports.ErrNotFound):
		return huma.Error404NotFound("not found")
	case errors.Is(err, ports.ErrRateLimited):
		return huma.Error429TooManyRequests("rate limit exceeded")
	default:
		return huma.Error503ServiceUnavailable("service unavailable")
	}
}

func Register(api huma.API, service *app.Service) {
	operation := huma.Operation{OperationID: "submit-public-inquiry", Method: http.MethodPost, Path: "/v1/showrooms/{slug}/pianos/{id}/inquiries", DefaultStatus: 204, MaxBodyBytes: 32768, Security: []map[string][]string{}, Metadata: map[string]any{"sensitive-input": true}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
		ctx.SetHeader("Cache-Control", "no-store")
		ctx.SetHeader("Referrer-Policy", "no-referrer")
		ctx.SetHeader("X-Content-Type-Options", "nosniff")
		if service == nil || !shared.RequestLimitApplied(ctx.Context()) {
			_ = huma.WriteErr(api, ctx, http.StatusServiceUnavailable, "service unavailable")
			return
		}
		next(ctx)
	}}}
	huma.Register(api, operation, func(ctx context.Context, in *SubmissionInput) (*shared.NoContentOutput, error) {
		err := service.Submit(ctx, shared.RequestSource(ctx), app.Request{Slug: in.Slug, PianoID: in.ID, Contact: domain.Contact{Name: in.Body.Name, Email: in.Body.Email, Phone: in.Body.Phone, Message: in.Body.Message, Preference: domain.Preference(in.Body.Preference)}, Honeypot: in.Body.Honeypot, Challenge: in.Body.Challenge})
		if err != nil {
			return nil, submissionError(err)
		}
		return &shared.NoContentOutput{Status: http.StatusNoContent}, nil
	})
}
