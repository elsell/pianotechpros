package routes

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/mapper"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type ProfileInput struct {
	Slug string `path:"slug" maxLength:"80"`
}
type ListingInput struct {
	ProfileInput
	ID string `path:"id" maxLength:"128"`
}
type PhotoInput struct {
	ListingInput
	PhotoID string `path:"photoID" maxLength:"128"`
}
type ProfileOutput struct {
	Body struct {
		Data dto.PublicShowroomProfile `json:"data"`
	}
}
type ListingOutput struct {
	Body struct {
		Data dto.PublicShowroomListing `json:"data"`
	}
}
type PhotoOutput struct {
	ContentType string `header:"Content-Type"`
	Body        []byte
}

func publicError(err error) error {
	if errors.Is(err, domain.ErrInvalidQuery) {
		return huma.Error400BadRequest("invalid request")
	}
	if errors.Is(err, ports.ErrNotFound) {
		return huma.Error404NotFound("not found")
	}
	return huma.Error503ServiceUnavailable("service unavailable")
}

func publicOperation(api huma.API, configured bool, id, path string) huma.Operation {
	return huma.Operation{OperationID: id, Method: http.MethodGet, Path: path, Security: []map[string][]string{}, Metadata: map[string]any{"sensitive-input": true}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
		ctx.SetHeader("Cache-Control", "no-store")
		ctx.SetHeader("Referrer-Policy", "no-referrer")
		ctx.SetHeader("X-Content-Type-Options", "nosniff")
		if !shared.RequestLimitApplied(ctx.Context()) || !configured {
			_ = huma.WriteErr(api, ctx, http.StatusServiceUnavailable, "service unavailable")
			return
		}
		next(ctx)
	}}}
}

func Register(api huma.API, service app.Repository) {
	operation := func(id, path string) huma.Operation { return publicOperation(api, service != nil, id, path) }
	base := "/v1/showrooms/{slug}"
	huma.Register(api, operation("read-public-showroom", base), func(ctx context.Context, in *ProfileInput) (*ProfileOutput, error) {
		profile, err := service.ReadPublicProfile(ctx, in.Slug)
		if err != nil {
			return nil, publicError(err)
		}
		out := &ProfileOutput{}
		out.Body.Data = mapper.Profile(profile)
		return out, nil
	})
	huma.Register(api, operation("read-public-piano", base+"/pianos/{id}"), func(ctx context.Context, in *ListingInput) (*ListingOutput, error) {
		listing, err := service.ReadPublicListing(ctx, in.Slug, in.ID)
		if err != nil {
			return nil, publicError(err)
		}
		out := &ListingOutput{}
		out.Body.Data = mapper.Listing(listing)
		return out, nil
	})
	photo := operation("read-public-piano-photo", base+"/pianos/{id}/photos/{photoID}")
	photo.Responses = map[string]*huma.Response{"200": {Description: "Published normalized JPEG", Content: map[string]*huma.MediaType{"image/jpeg": {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}}
	huma.Register(api, photo, func(ctx context.Context, in *PhotoInput) (*PhotoOutput, error) {
		image, err := service.ReadPublicPhoto(ctx, in.Slug, in.ID, in.PhotoID)
		if err != nil {
			return nil, publicError(err)
		}
		return &PhotoOutput{ContentType: "image/jpeg", Body: image.JPEG}, nil
	})
}
