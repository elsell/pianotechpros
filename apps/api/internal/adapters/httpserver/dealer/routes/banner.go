package routes

import (
	"context"
	"errors"
	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"io"
	"net/http"
)

type BannerService interface {
	GetBannerState(context.Context, string, domain.ID) (domain.BannerState, error)
	ReadBannerImage(context.Context, string, domain.ID, string) (ports.ProcessedPhoto, error)
	UploadBanner(context.Context, string, domain.ID, string, int64, io.Reader) (domain.BannerUploadResult, error)
	RemoveBanner(context.Context, string, domain.ID, int64) (domain.BannerState, error)
}
type BannerUploadInput struct {
	DealerPathInput
	IdempotencyKey   string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
	ExpectedRevision int64  `query:"expectedRevision" required:"true" minimum:"1" maximum:"9007199254740990"`
}
type BannerRemoveInput struct {
	DealerPathInput
	ExpectedRevision int64 `query:"expectedRevision" required:"true" minimum:"1" maximum:"9007199254740990"`
}
type BannerImageInput struct {
	DealerPathInput
	BannerID string `path:"bannerID" maxLength:"128"`
}
type BannerOutput struct {
	Body struct {
		Data dto.DealerBannerState `json:"data"`
	}
}
type BannerUploadMeta struct {
	BannerID string `json:"bannerID"`
	Replay   bool   `json:"replay"`
}
type BannerUploadOutput struct {
	Body struct {
		Data dto.DealerBannerState `json:"data"`
		Meta BannerUploadMeta      `json:"meta"`
	}
}
type BannerImageOutput struct {
	ContentType string `header:"Content-Type"`
	Body        []byte
}
type bannerBodyKey struct{}
type bannerBody struct {
	source    io.Reader
	remaining int64
}

func (b *bannerBody) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if b.remaining == 0 {
		var probe [1]byte
		n, err := b.source.Read(probe[:])
		if n > 0 {
			return 0, ports.ErrPhotoLimit
		}
		return 0, bannerReadError(err)
	}
	if int64(len(p)) > b.remaining {
		p = p[:b.remaining]
	}
	n, err := b.source.Read(p)
	b.remaining -= int64(n)
	return n, bannerReadError(err)
}
func bannerReadError(err error) error {
	var limit *http.MaxBytesError
	if errors.As(err, &limit) {
		return ports.ErrPhotoLimit
	}
	return err
}
func bannerOutput(state domain.BannerState, err error) (*BannerOutput, error) {
	if err != nil {
		return nil, shared.MapError(err, true)
	}
	out := &BannerOutput{}
	out.Body.Data = mapper.BannerState(state)
	return out, nil
}
func RegisterBanner(api huma.API, service BannerService) {
	base := "/v1/dealers/{id}/banner"
	operation := func(id, method, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			ctx.SetHeader("X-Content-Type-Options", "nosniff")
			if service == nil {
				_ = huma.WriteErr(api, ctx, 503, "service unavailable")
				return
			}
			next(ctx)
		}}}
	}
	huma.Register(api, operation("get-dealer-banner", http.MethodGet, base), func(ctx context.Context, in *DealerPathInput) (*BannerOutput, error) {
		return bannerOutput(service.GetBannerState(ctx, in.Authorization, domain.ID(in.ID)))
	})
	upload := operation("upload-dealer-banner", http.MethodPost, base)
	upload.DefaultStatus = http.StatusCreated
	upload.RequestBody = &huma.RequestBody{Required: true, Content: map[string]*huma.MediaType{"application/octet-stream": {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}
	upload.Middlewares = append(upload.Middlewares, func(ctx huma.Context, next func(huma.Context)) {
		body := &bannerBody{source: ctx.BodyReader(), remaining: 20 << 20}
		next(huma.WithContext(ctx, context.WithValue(ctx.Context(), bannerBodyKey{}, body)))
	})
	huma.Register(api, upload, func(ctx context.Context, in *BannerUploadInput) (*BannerUploadOutput, error) {
		body, _ := ctx.Value(bannerBodyKey{}).(io.Reader)
		result, err := service.UploadBanner(ctx, in.Authorization, domain.ID(in.ID), in.IdempotencyKey, in.ExpectedRevision, body)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &BannerUploadOutput{}
		out.Body.Data = mapper.BannerState(result.State)
		out.Body.Meta.BannerID = result.BannerID
		out.Body.Meta.Replay = result.Replay
		return out, nil
	})
	huma.Register(api, operation("remove-dealer-banner", http.MethodDelete, base), func(ctx context.Context, in *BannerRemoveInput) (*BannerOutput, error) {
		return bannerOutput(service.RemoveBanner(ctx, in.Authorization, domain.ID(in.ID), in.ExpectedRevision))
	})
	image := operation("read-dealer-banner", http.MethodGet, base+"/{bannerID}/image")
	image.Responses = map[string]*huma.Response{"200": {Description: "Authorized normalized JPEG", Content: map[string]*huma.MediaType{"image/jpeg": {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}}
	huma.Register(api, image, func(ctx context.Context, in *BannerImageInput) (*BannerImageOutput, error) {
		image, err := service.ReadBannerImage(ctx, in.Authorization, domain.ID(in.ID), in.BannerID)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		return &BannerImageOutput{ContentType: "image/jpeg", Body: image.JPEG}, nil
	})
}
