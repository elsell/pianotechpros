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

type HistoryService interface {
	ListHistory(context.Context, string, string, string, string, int) ([]domain.History, string, error)
}
type HistoryInput struct {
	Authorization string `header:"Authorization"`
	DealerID      string `path:"dealerID"`
	ID            string `path:"id"`
	Cursor        string `query:"cursor" maxLength:"4096"`
	Limit         int    `query:"limit" default:"20" minimum:"1" maximum:"50"`
}
type HistoryOutput struct {
	Body struct {
		Data []dto.InventoryHistoryEntry `json:"data" nullable:"false"`
		Meta InventoryListMeta           `json:"meta"`
	}
}

func RegisterHistory(api huma.API, service HistoryService) {
	operation := huma.Operation{OperationID: "list-inventory-history", Method: http.MethodGet, Path: "/v1/dealers/{dealerID}/inventory/{id}/history", Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
		ctx.SetHeader("Cache-Control", "no-store")
		ctx.SetHeader("Referrer-Policy", "no-referrer")
		next(ctx)
	}}}
	huma.Register(api, operation, func(ctx context.Context, in *HistoryInput) (*HistoryOutput, error) {
		entries, next, err := service.ListHistory(ctx, in.Authorization, in.DealerID, in.ID, in.Cursor, in.Limit)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &HistoryOutput{}
		out.Body.Data = make([]dto.InventoryHistoryEntry, 0, len(entries))
		out.Body.Meta.NextCursor = next
		for _, entry := range entries {
			out.Body.Data = append(out.Body.Data, mapper.History(entry))
		}
		return out, nil
	})
}
