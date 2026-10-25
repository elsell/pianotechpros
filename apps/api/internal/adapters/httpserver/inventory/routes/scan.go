package routes

import (
	"context"
	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"net/http"
)

type ScanService interface {
	EnsureScanLabel(context.Context, string, string, string) (domain.ScanLabel, error)
	ResolveScanLabel(context.Context, string, string, string) (domain.ScanLabel, error)
}
type ScanLabelInput struct {
	Authorization string `header:"Authorization"`
	DealerID      string `path:"dealerID"`
	ID            string `path:"id"`
}
type ScanResolveInput struct {
	Authorization string `header:"Authorization"`
	DealerID      string `path:"dealerID"`
	Body          struct {
		Token string `json:"token" minLength:"43" maxLength:"43"`
	}
}
type ScanLabelOutput struct {
	Body struct {
		Data dto.InventoryScanLabel `json:"data"`
	}
}
type ScanResolveOutput struct {
	Body struct {
		Data dto.InventoryScanResolution `json:"data"`
	}
}

func RegisterScan(api huma.API, service ScanService) {
	operation := func(id, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: http.MethodPost, Path: path, MaxBodyBytes: 1024, Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			next(ctx)
		}}}
	}
	huma.Register(api, operation("ensure-inventory-scan-label", "/v1/dealers/{dealerID}/inventory/{id}/scan-label"), func(ctx context.Context, in *ScanLabelInput) (*ScanLabelOutput, error) {
		label, err := service.EnsureScanLabel(ctx, in.Authorization, in.DealerID, in.ID)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &ScanLabelOutput{}
		out.Body.Data.DealerID = label.DealerID
		out.Body.Data.RecordID = label.RecordID
		out.Body.Data.Token = label.Token.Encoded()
		return out, nil
	})
	huma.Register(api, operation("resolve-inventory-scan-label", "/v1/dealers/{dealerID}/inventory/scan/resolve"), func(ctx context.Context, in *ScanResolveInput) (*ScanResolveOutput, error) {
		label, err := service.ResolveScanLabel(ctx, in.Authorization, in.DealerID, in.Body.Token)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &ScanResolveOutput{}
		out.Body.Data.DealerID = label.DealerID
		out.Body.Data.RecordID = label.RecordID
		return out, nil
	})
}
