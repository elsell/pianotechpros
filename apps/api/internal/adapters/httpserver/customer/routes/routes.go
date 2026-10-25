package routes

import (
	"context"
	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"net/http"
)

type Service interface {
	Create(context.Context, string, string, domain.Attributes) (domain.Entity, error)
	List(context.Context, string, string, int) ([]domain.Entity, string, error)
	Get(context.Context, string, domain.ID) (domain.Entity, error)
	Update(context.Context, string, domain.ID, domain.Attributes) (domain.Entity, error)
	Delete(context.Context, string, domain.ID) error
}

type CustomerAuthorizationInput struct {
	Authorization string `header:"Authorization"`
}
type CustomerListInput struct {
	Authorization string `header:"Authorization"`
	Cursor        string `query:"cursor"`
	Limit         int    `query:"limit" default:"50" minimum:"1" maximum:"100"`
}
type CustomerPathInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id"`
}
type CustomerCreateInput struct {
	Authorization  string `header:"Authorization"`
	IdempotencyKey string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
	Body           dto.CustomerCreate
}
type CustomerUpdateInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id"`
	Body          dto.CustomerUpdate
}
type CustomerItemOutput struct {
	Body struct {
		Data dto.CustomerItem `json:"data"`
	}
}
type CustomerListOutput struct {
	Body struct {
		Data []dto.CustomerItem `json:"data" nullable:"false"`
		Meta struct {
			NextCursor string `json:"nextCursor,omitempty"`
		} `json:"meta"`
	}
}
type CustomerNoContentOutput struct{ Status int }

func Register(api huma.API, service Service) {
	path := "/v1/customers"
	security := []map[string][]string{{"oidc": {}}}
	huma.Register(api, huma.Operation{OperationID: "create-customer", Method: http.MethodPost, Path: path, DefaultStatus: http.StatusCreated, Security: security}, func(ctx context.Context, input *CustomerCreateInput) (*CustomerItemOutput, error) {
		entity, err := service.Create(ctx, input.Authorization, input.IdempotencyKey, mapper.Attributes(input.Body))
		if err != nil {
			return nil, shared.MapError(err, false)
		}
		out := &CustomerItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "list-customers", Method: http.MethodGet, Path: path, Security: security}, func(ctx context.Context, input *CustomerListInput) (*CustomerListOutput, error) {
		entities, cursor, err := service.List(ctx, input.Authorization, input.Cursor, input.Limit)
		if err != nil {
			return nil, shared.MapError(err, false)
		}
		out := &CustomerListOutput{}
		out.Body.Data = make([]dto.CustomerItem, 0, len(entities))
		for _, entity := range entities {
			out.Body.Data = append(out.Body.Data, mapper.Item(entity))
		}
		out.Body.Meta.NextCursor = cursor
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "get-customer", Method: http.MethodGet, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *CustomerPathInput) (*CustomerItemOutput, error) {
		entity, err := service.Get(ctx, input.Authorization, domain.ID(input.ID))
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &CustomerItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "update-customer", Method: http.MethodPut, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *CustomerUpdateInput) (*CustomerItemOutput, error) {
		entity, err := service.Update(ctx, input.Authorization, domain.ID(input.ID), mapper.UpdateAttributes(input.Body))
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &CustomerItemOutput{}
		out.Body.Data = mapper.Item(entity)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "delete-customer", Method: http.MethodDelete, Path: path + "/{id}", Security: security}, func(ctx context.Context, input *CustomerPathInput) (*CustomerNoContentOutput, error) {
		if err := service.Delete(ctx, input.Authorization, domain.ID(input.ID)); err != nil {
			return nil, shared.MapError(err, true)
		}
		return &CustomerNoContentOutput{Status: http.StatusNoContent}, nil
	})
}
