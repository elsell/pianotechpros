package routes

import (
	"context"
	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"net/http"
)

type Service interface {
	Create(context.Context, string, string, domain.Attributes) (domain.Entity, error)
	List(context.Context, string, string, int) ([]domain.Entity, string, error)
	Get(context.Context, string, domain.ID) (domain.Entity, error)
	Update(context.Context, string, domain.ID, domain.Attributes) (domain.Entity, error)
	Delete(context.Context, string, domain.ID) error
}

type TechnicianAuthorizationInput struct {
	Authorization string `header:"Authorization"`
}
type TechnicianListInput struct {
	Authorization string `header:"Authorization"`
	Cursor        string `query:"cursor"`
	Limit         int    `query:"limit" default:"50" minimum:"1" maximum:"100"`
}
type TechnicianPathInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id"`
}
type TechnicianCreateInput struct {
	Authorization  string `header:"Authorization"`
	IdempotencyKey string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
	Body           dto.TechnicianCreate
}
type TechnicianUpdateInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id"`
	Body          dto.TechnicianUpdate
}
type TechnicianItemOutput struct {
	Body struct {
		Data dto.TechnicianItem `json:"data"`
	}
}
type TechnicianListOutput struct {
	Body struct {
		Data []dto.TechnicianItem `json:"data" nullable:"false"`
		Meta struct {
			NextCursor string `json:"nextCursor,omitempty"`
		} `json:"meta"`
	}
}
type TechnicianNoContentOutput struct{ Status int }

func Register(api huma.API, service Service) {
	path := "/v1/technicians"
	security := []map[string][]string{{"oidc": {}}}
	huma.Register(api, huma.Operation{OperationID: "create-technician", Method: http.MethodPost, Path: path, DefaultStatus: http.StatusCreated, Security: security}, func(ctx context.Context, input *TechnicianCreateInput) (*TechnicianItemOutput, error) {
		entity, err := service.Create(ctx, input.Authorization, input.IdempotencyKey, mapper.Attributes(input.Body))
		if err != nil {
			return nil, shared.MapError(err, false)
		}
		out := &TechnicianItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "list-technicians", Method: http.MethodGet, Path: path, Security: security}, func(ctx context.Context, input *TechnicianListInput) (*TechnicianListOutput, error) {
		entities, cursor, err := service.List(ctx, input.Authorization, input.Cursor, input.Limit)
		if err != nil {
			return nil, shared.MapError(err, false)
		}
		out := &TechnicianListOutput{}
		out.Body.Data = make([]dto.TechnicianItem, 0, len(entities))
		for _, entity := range entities {
			out.Body.Data = append(out.Body.Data, mapper.Item(entity))
		}
		out.Body.Meta.NextCursor = cursor
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "get-technician", Method: http.MethodGet, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *TechnicianPathInput) (*TechnicianItemOutput, error) {
		entity, err := service.Get(ctx, input.Authorization, domain.ID(input.ID))
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &TechnicianItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "update-technician", Method: http.MethodPut, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *TechnicianUpdateInput) (*TechnicianItemOutput, error) {
		entity, err := service.Update(ctx, input.Authorization, domain.ID(input.ID), mapper.UpdateAttributes(input.Body))
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &TechnicianItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "delete-technician", Method: http.MethodDelete, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *TechnicianPathInput) (*TechnicianNoContentOutput, error) {
		if err := service.Delete(ctx, input.Authorization, domain.ID(input.ID)); err != nil {
			return nil, shared.MapError(err, true)
		}
		return &TechnicianNoContentOutput{Status: http.StatusNoContent}, nil
	})
}
