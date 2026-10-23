package routes

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

type PublicationService interface {
	GetPublication(context.Context, string, string, string) (domain.PublicationRecord, error)
	PublishRecord(context.Context, string, string, string, int64) (domain.PublicationRecord, error)
	UnpublishRecord(context.Context, string, string, string, int64) (domain.PublicationRecord, error)
	TransitionRecord(context.Context, string, string, string, int64, domain.Status, *domain.Money, string) (domain.PublicationRecord, error)
}
type PublicationCommandInput struct {
	GetInput
	Body dto.RevisionCommand
}
type LifecycleCommandInput struct {
	GetInput
	Body dto.LifecycleCommand
}
type PublicationOutput struct {
	Body struct {
		Data dto.PublicationState `json:"data"`
	}
}

func publicationOutput(state domain.PublicationRecord, err error) (*PublicationOutput, error) {
	if err != nil {
		var readiness *domain.ReadinessError
		if errors.As(err, &readiness) {
			// Only these stable identifiers may leave the application boundary.
			missing := make([]string, 0, 4)
			for _, key := range []string{"form", "condition", "title", "photo"} {
				for _, value := range readiness.Missing {
					if value == key {
						missing = append(missing, key)
						break
					}
				}
			}
			return nil, &shared.APIError{Type: "about:blank", Title: http.StatusText(422), Status: 422, Code: "inventory_not_ready", Missing: missing}
		}
		return nil, shared.MapError(err, true)
	}
	out := &PublicationOutput{}
	out.Body.Data = mapper.PublicationState(state)
	return out, nil
}
func RegisterPublication(api huma.API, service PublicationService) {
	path := "/v1/dealers/{dealerID}/inventory/{id}"
	operation := func(id, method, suffix string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path + suffix, Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Errors: []int{400, 401, 404, 409, 422, 429, 500, 503}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			next(ctx)
		}}}
	}
	huma.Register(api, operation("get-inventory-publication", http.MethodGet, "/publication"), func(ctx context.Context, in *GetInput) (*PublicationOutput, error) {
		return publicationOutput(service.GetPublication(ctx, in.Authorization, in.DealerID, in.ID))
	})
	huma.Register(api, operation("publish-inventory-record", http.MethodPost, "/publish"), func(ctx context.Context, in *PublicationCommandInput) (*PublicationOutput, error) {
		return publicationOutput(service.PublishRecord(ctx, in.Authorization, in.DealerID, in.ID, in.Body.ExpectedRevision))
	})
	huma.Register(api, operation("unpublish-inventory-record", http.MethodPost, "/unpublish"), func(ctx context.Context, in *PublicationCommandInput) (*PublicationOutput, error) {
		return publicationOutput(service.UnpublishRecord(ctx, in.Authorization, in.DealerID, in.ID, in.Body.ExpectedRevision))
	})
	huma.Register(api, operation("transition-inventory-record", http.MethodPost, "/lifecycle"), func(ctx context.Context, in *LifecycleCommandInput) (*PublicationOutput, error) {
		return publicationOutput(service.TransitionRecord(ctx, in.Authorization, in.DealerID, in.ID, in.Body.ExpectedRevision, domain.Status(in.Body.Status), (*domain.Money)(in.Body.SalePrice), in.Body.Reason))
	})
}
