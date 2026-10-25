package routes

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type ProfileService interface {
	CreateProfile(context.Context, string, string, domain.Attributes) (domain.Entity, error)
	GetProfile(context.Context, string) (domain.Entity, error)
	SaveProfile(context.Context, string, int64, domain.Attributes) (domain.Entity, error)
	Timezones(context.Context, string) ([]string, error)
}
type TechnicianProfileCreateInput struct {
	Authorization  string `header:"Authorization"`
	IdempotencyKey string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
	Body           struct {
		Attributes dto.TechnicianProfileAttributes `json:"attributes"`
	}
}
type TechnicianProfileSaveInput struct {
	Authorization string `header:"Authorization"`
	Body          struct {
		ExpectedRevision int64                           `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
		Attributes       dto.TechnicianProfileAttributes `json:"attributes"`
	}
}
type TechnicianProfileOutput struct {
	Body struct {
		Data dto.TechnicianProfileItem `json:"data"`
	}
}
type TechnicianProfileTimezoneChoices struct {
	Names []string `json:"names" nullable:"false"`
}
type TechnicianProfileTimezonesOutput struct {
	Body struct {
		Data TechnicianProfileTimezoneChoices `json:"data"`
	}
}

func profileResult(e domain.Entity, err error) (*TechnicianProfileOutput, error) {
	if err != nil {
		if errors.Is(err, domain.ErrRevisionConflict) {
			err = ports.ErrConflict
		}
		return nil, shared.MapError(err, true)
	}
	out := &TechnicianProfileOutput{}
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
	create := operation("create-technician-profile", http.MethodPost, "/v1/technician-profile")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, func(ctx context.Context, in *TechnicianProfileCreateInput) (*TechnicianProfileOutput, error) {
		return profileResult(service.CreateProfile(ctx, in.Authorization, in.IdempotencyKey, mapper.ProfileAttributes(in.Body.Attributes)))
	})
	huma.Register(api, operation("get-technician-profile", http.MethodGet, "/v1/technician-profile"), func(ctx context.Context, in *TechnicianAuthorizationInput) (*TechnicianProfileOutput, error) {
		return profileResult(service.GetProfile(ctx, in.Authorization))
	})
	huma.Register(api, operation("save-technician-profile", http.MethodPut, "/v1/technician-profile"), func(ctx context.Context, in *TechnicianProfileSaveInput) (*TechnicianProfileOutput, error) {
		return profileResult(service.SaveProfile(ctx, in.Authorization, in.Body.ExpectedRevision, mapper.ProfileAttributes(in.Body.Attributes)))
	})
	huma.Register(api, operation("technician-profile-timezones", http.MethodGet, "/v1/technician-profile/timezones"), func(ctx context.Context, in *TechnicianAuthorizationInput) (*TechnicianProfileTimezonesOutput, error) {
		names, err := service.Timezones(ctx, in.Authorization)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &TechnicianProfileTimezonesOutput{}
		out.Body.Data.Names = append([]string{}, names...)
		return out, nil
	})
}
