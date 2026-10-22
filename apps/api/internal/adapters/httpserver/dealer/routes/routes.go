package routes

import (
	"context"
	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"net/http"
)

type Service interface {
	StaffService
	InvitationService
	Create(context.Context, string, string, domain.Attributes) (domain.Entity, error)
	List(context.Context, string, string, int) ([]domain.Entity, string, error)
	Get(context.Context, string, domain.ID) (domain.Entity, error)
	Update(context.Context, string, domain.ID, int64, domain.Attributes) (domain.Entity, error)
	Delete(context.Context, string, domain.ID) error
}

type DealerAuthorizationInput struct {
	Authorization string `header:"Authorization"`
}
type DealerListInput struct {
	Authorization string `header:"Authorization"`
	Cursor        string `query:"cursor"`
	Limit         int    `query:"limit" default:"50" minimum:"1" maximum:"100"`
}
type DealerPathInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id"`
}
type DealerCreateInput struct {
	Authorization  string `header:"Authorization"`
	IdempotencyKey string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
	Body           dto.DealerCreate
}
type DealerUpdateInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id"`
	Body          dto.DealerUpdate
}
type DealerItemOutput struct {
	Body struct {
		Data dto.DealerItem `json:"data"`
	}
}
type DealerListOutput struct {
	Body struct {
		Data []dto.DealerItem `json:"data" nullable:"false"`
		Meta struct {
			NextCursor string `json:"nextCursor,omitempty"`
		} `json:"meta"`
	}
}
type DealerNoContentOutput struct{ Status int }

func Register(api huma.API, service Service) {
	registerStaff(api, service)
	registerInvitations(api, service)
	path := "/v1/dealers"
	security := []map[string][]string{{"oidc": {}}}
	huma.Register(api, huma.Operation{OperationID: "create-dealer", Method: http.MethodPost, Path: path, DefaultStatus: http.StatusCreated, Security: security}, func(ctx context.Context, input *DealerCreateInput) (*DealerItemOutput, error) {
		entity, err := service.Create(ctx, input.Authorization, input.IdempotencyKey, mapper.Attributes(input.Body))
		if err != nil {
			return nil, shared.MapError(err, false)
		}
		out := &DealerItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "list-dealers", Method: http.MethodGet, Path: path, Security: security}, func(ctx context.Context, input *DealerListInput) (*DealerListOutput, error) {
		entities, cursor, err := service.List(ctx, input.Authorization, input.Cursor, input.Limit)
		if err != nil {
			return nil, shared.MapError(err, false)
		}
		out := &DealerListOutput{}
		out.Body.Data = make([]dto.DealerItem, 0, len(entities))
		for _, entity := range entities {
			out.Body.Data = append(out.Body.Data, mapper.Item(entity))
		}
		out.Body.Meta.NextCursor = cursor
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "get-dealer", Method: http.MethodGet, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *DealerPathInput) (*DealerItemOutput, error) {
		entity, err := service.Get(ctx, input.Authorization, domain.ID(input.ID))
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &DealerItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "update-dealer", Method: http.MethodPut, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *DealerUpdateInput) (*DealerItemOutput, error) {
		entity, err := service.Update(ctx, input.Authorization, domain.ID(input.ID), input.Body.ExpectedRevision, mapper.UpdateAttributes(input.Body))
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &DealerItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "delete-dealer", Method: http.MethodDelete, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *DealerPathInput) (*DealerNoContentOutput, error) {
		if err := service.Delete(ctx, input.Authorization, domain.ID(input.ID)); err != nil {
			return nil, shared.MapError(err, true)
		}
		return &DealerNoContentOutput{Status: http.StatusNoContent}, nil
	})
}
