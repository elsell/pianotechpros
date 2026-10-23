package routes

import (
	"context"
	"errors"
	"io"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type PhotoService interface {
	UploadPhoto(context.Context, string, string, string, string, int64, io.Reader) (domain.PhotoUploadResult, error)
	ListPhotos(context.Context, string, string, string) (domain.PhotoState, error)
	ReadPhoto(context.Context, string, string, string, string) (ports.ProcessedPhoto, error)
	ReorderPhotos(context.Context, string, string, string, []string, int64) (domain.PhotoState, error)
	DescribePhoto(context.Context, string, string, string, string, string, int64) (domain.PhotoState, error)
	RemovePhoto(context.Context, string, string, string, string, int64) (domain.PhotoState, error)
}
type photoBodyKey struct{}

// Limited independently from the processor so alternative processors cannot
// accidentally accept an oversized chunked request. Never reads ahead of policy.
type photoBody struct {
	source    io.Reader
	remaining int64
}

func (b *photoBody) Read(p []byte) (int, error) {
	if b.remaining == 0 {
		var probe [1]byte
		n, err := b.source.Read(probe[:])
		if n > 0 {
			return 0, ports.ErrPhotoLimit
		}
		return 0, photoReadError(err)
	}
	if int64(len(p)) > b.remaining {
		p = p[:b.remaining]
	}
	n, err := b.source.Read(p)
	b.remaining -= int64(n)
	return n, photoReadError(err)
}

func photoReadError(err error) error {
	var limit *http.MaxBytesError
	if errors.As(err, &limit) {
		return ports.ErrPhotoLimit
	}
	return err
}

type PhotoUploadInput struct {
	GetInput
	IdempotencyKey   string `header:"Idempotency-Key" required:"true" minLength:"16" maxLength:"128"`
	ExpectedRevision int64  `query:"expectedRevision" required:"true" minimum:"1" maximum:"9007199254740991"`
}
type PhotoInput struct {
	GetInput
	PhotoID string `path:"photoID"`
}
type PhotoRemoveInput struct {
	PhotoInput
	ExpectedRevision int64 `query:"expectedRevision" required:"true" minimum:"1" maximum:"9007199254740991"`
}
type PhotoOrderInput struct {
	GetInput
	Body dto.PhotoOrder
}
type PhotoDescriptionInput struct {
	PhotoInput
	Body dto.PhotoDescription
}
type PhotoStateOutput struct {
	Body struct {
		Data dto.PhotoState `json:"data"`
	}
}
type PhotoUploadMeta struct {
	PhotoID string `json:"photoID"`
	Replay  bool   `json:"replay"`
}
type PhotoUploadOutput struct {
	Body struct {
		Data dto.PhotoState  `json:"data"`
		Meta PhotoUploadMeta `json:"meta"`
	}
}
type PhotoImageOutput struct {
	ContentType string `header:"Content-Type"`
	Body        []byte
}

func photoOutput(state domain.PhotoState, err error) (*PhotoStateOutput, error) {
	if err != nil {
		return nil, shared.MapError(err, true)
	}
	out := &PhotoStateOutput{}
	out.Body.Data = mapper.Photos(state)
	return out, nil
}
func RegisterPhotos(api huma.API, service PhotoService) {
	base := "/v1/dealers/{dealerID}/inventory/{id}/photos"
	operation := func(id, method, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			ctx.SetHeader("X-Content-Type-Options", "nosniff")
			next(ctx)
		}}}
	}
	huma.Register(api, operation("list-inventory-photos", http.MethodGet, base), func(ctx context.Context, in *GetInput) (*PhotoStateOutput, error) {
		return photoOutput(service.ListPhotos(ctx, in.Authorization, in.DealerID, in.ID))
	})
	upload := operation("upload-inventory-photo", http.MethodPost, base)
	upload.DefaultStatus = http.StatusCreated
	upload.RequestBody = &huma.RequestBody{Required: true, Content: map[string]*huma.MediaType{"application/octet-stream": {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}
	upload.Middlewares = append(upload.Middlewares, func(ctx huma.Context, next func(huma.Context)) {
		body := &photoBody{source: ctx.BodyReader(), remaining: 20 << 20}
		next(huma.WithContext(ctx, context.WithValue(ctx.Context(), photoBodyKey{}, body)))
	})
	huma.Register(api, upload, func(ctx context.Context, in *PhotoUploadInput) (*PhotoUploadOutput, error) {
		body, _ := ctx.Value(photoBodyKey{}).(io.Reader)
		result, err := service.UploadPhoto(ctx, in.Authorization, in.DealerID, in.ID, in.IdempotencyKey, in.ExpectedRevision, body)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &PhotoUploadOutput{}
		out.Body.Data = mapper.Photos(result.State)
		out.Body.Meta.PhotoID = result.PhotoID
		out.Body.Meta.Replay = result.Replay
		return out, nil
	})
	huma.Register(api, operation("reorder-inventory-photos", http.MethodPut, base+"/order"), func(ctx context.Context, in *PhotoOrderInput) (*PhotoStateOutput, error) {
		return photoOutput(service.ReorderPhotos(ctx, in.Authorization, in.DealerID, in.ID, in.Body.IDs, in.Body.ExpectedRevision))
	})
	huma.Register(api, operation("describe-inventory-photo", http.MethodPatch, base+"/{photoID}"), func(ctx context.Context, in *PhotoDescriptionInput) (*PhotoStateOutput, error) {
		return photoOutput(service.DescribePhoto(ctx, in.Authorization, in.DealerID, in.ID, in.PhotoID, in.Body.AltText, in.Body.ExpectedRevision))
	})
	huma.Register(api, operation("remove-inventory-photo", http.MethodDelete, base+"/{photoID}"), func(ctx context.Context, in *PhotoRemoveInput) (*PhotoStateOutput, error) {
		return photoOutput(service.RemovePhoto(ctx, in.Authorization, in.DealerID, in.ID, in.PhotoID, in.ExpectedRevision))
	})
	image := operation("read-inventory-photo", http.MethodGet, base+"/{photoID}/image")
	image.Responses = map[string]*huma.Response{"200": {Description: "Authorized normalized JPEG", Content: map[string]*huma.MediaType{"image/jpeg": {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}}
	huma.Register(api, image, func(ctx context.Context, in *PhotoInput) (*PhotoImageOutput, error) {
		photo, err := service.ReadPhoto(ctx, in.Authorization, in.DealerID, in.ID, in.PhotoID)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		return &PhotoImageOutput{ContentType: "image/jpeg", Body: photo.JPEG}, nil
	})
}
