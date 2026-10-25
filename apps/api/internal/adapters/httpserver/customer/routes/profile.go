package routes

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type ProfileService interface {
	CreateProfile(context.Context, string, string, domain.Attributes) (domain.Entity, error)
	GetProfile(context.Context, string) (domain.Entity, error)
	SaveProfile(context.Context, string, int64, domain.Attributes) (domain.Entity, error)
	Timezones(context.Context, string) ([]string, error)
}
type ProfileCreateInput struct {
	Authorization  string `header:"Authorization"`
	IdempotencyKey string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
	Body           struct {
		Attributes dto.ProfileAttributes `json:"attributes"`
	}
}
type ProfileSaveInput struct {
	Authorization string `header:"Authorization"`
	Body          struct {
		ExpectedRevision int64                 `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
		Attributes       dto.ProfileAttributes `json:"attributes"`
	}
}
type ProfileOutput struct {
	Body struct {
		Data dto.ProfileItem `json:"data"`
	}
}
type ProfileTimezoneChoices struct {
	Names []string `json:"names" nullable:"false"`
}
type ProfileTimezonesOutput struct {
	Body struct {
		Data ProfileTimezoneChoices `json:"data"`
	}
}

func profileResult(e domain.Entity, err error) (*ProfileOutput, error) {
	if err != nil {
		if errors.Is(err, domain.ErrRevisionConflict) {
			err = ports.ErrConflict
		}
		return nil, shared.MapError(err, true)
	}
	out := &ProfileOutput{}
	out.Body.Data = mapper.ProfileItem(e)
	return out, nil
}
func RegisterProfiles(api huma.API, service ProfileService) {
	operation := func(id, method, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, MaxBodyBytes: 1 << 20, Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			next(ctx)
		}}}
	}
	create := operation("create-customer-profile", http.MethodPost, "/v1/customer-profile")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, func(ctx context.Context, in *ProfileCreateInput) (*ProfileOutput, error) {
		return profileResult(service.CreateProfile(ctx, in.Authorization, in.IdempotencyKey, mapper.ProfileAttributes(in.Body.Attributes)))
	})
	huma.Register(api, operation("get-customer-profile", http.MethodGet, "/v1/customer-profile"), func(ctx context.Context, in *CustomerAuthorizationInput) (*ProfileOutput, error) {
		return profileResult(service.GetProfile(ctx, in.Authorization))
	})
	huma.Register(api, operation("save-customer-profile", http.MethodPut, "/v1/customer-profile"), func(ctx context.Context, in *ProfileSaveInput) (*ProfileOutput, error) {
		return profileResult(service.SaveProfile(ctx, in.Authorization, in.Body.ExpectedRevision, mapper.ProfileAttributes(in.Body.Attributes)))
	})
	huma.Register(api, operation("customer-profile-timezones", http.MethodGet, "/v1/customer-profile/timezones"), func(ctx context.Context, in *CustomerAuthorizationInput) (*ProfileTimezonesOutput, error) {
		names, err := service.Timezones(ctx, in.Authorization)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &ProfileTimezonesOutput{}
		out.Body.Data.Names = append([]string{}, names...)
		return out, nil
	})
}
