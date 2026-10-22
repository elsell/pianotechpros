package routes

import (
	"context"
	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"net/http"
)

type Service interface {
	CreateDraft(context.Context, string, string, string) (domain.Record, error)
	GetRecord(context.Context, string, string, string) (domain.Record, error)
	EditRecord(context.Context, string, string, string, int64, domain.Attributes) (domain.Record, error)
}
type CreateInput struct {
	Authorization  string `header:"Authorization"`
	DealerID       string `path:"dealerID"`
	IdempotencyKey string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
}
type GetInput struct {
	Authorization string `header:"Authorization"`
	DealerID      string `path:"dealerID"`
	ID            string `path:"id"`
}
type UpdateInput struct {
	Authorization string `header:"Authorization"`
	DealerID      string `path:"dealerID"`
	ID            string `path:"id"`
	Body          dto.Update
}
type ItemOutput struct {
	Body struct {
		Data dto.Item `json:"data"`
	}
}

func output(record domain.Record, err error) (*ItemOutput, error) {
	if err != nil {
		return nil, shared.MapError(err, true)
	}
	out := &ItemOutput{}
	out.Body.Data = mapper.Item(record)
	return out, nil
}
func Register(api huma.API, service Service) {
	path := "/v1/dealers/{dealerID}/inventory"
	operation := func(id, method, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			next(ctx)
		}}}
	}
	create := operation("create-inventory-draft", http.MethodPost, path)
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, func(ctx context.Context, in *CreateInput) (*ItemOutput, error) {
		return output(service.CreateDraft(ctx, in.Authorization, in.DealerID, in.IdempotencyKey))
	})
	huma.Register(api, operation("get-inventory-record", http.MethodGet, path+"/{id}"), func(ctx context.Context, in *GetInput) (*ItemOutput, error) {
		return output(service.GetRecord(ctx, in.Authorization, in.DealerID, in.ID))
	})
	huma.Register(api, operation("edit-inventory-record", http.MethodPut, path+"/{id}"), func(ctx context.Context, in *UpdateInput) (*ItemOutput, error) {
		return output(service.EditRecord(ctx, in.Authorization, in.DealerID, in.ID, in.Body.ExpectedRevision, mapper.Attributes(in.Body.Attributes)))
	})
}
