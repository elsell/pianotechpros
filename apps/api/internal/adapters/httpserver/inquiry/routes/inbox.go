package routes

import (
	"context"
	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/mapper"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"net/http"
)

type InboxListInput struct {
	Authorization string `header:"Authorization"`
	DealerID      string `path:"dealerID" maxLength:"128"`
	Cursor        string `query:"cursor" maxLength:"4096"`
	Limit         int    `query:"limit" default:"30" minimum:"1" maximum:"100"`
}
type InboxGetInput struct {
	Authorization string `header:"Authorization"`
	DealerID      string `path:"dealerID" maxLength:"128"`
	ID            string `path:"id" maxLength:"128"`
}
type InboxReadInput struct {
	InboxGetInput
	Body dto.AcknowledgeInquiry
}
type InboxOutput struct {
	Body struct {
		Data dto.InboxInquiry `json:"data"`
	}
}
type InboxListOutput struct {
	Body struct {
		Data []dto.InboxInquiry `json:"data" nullable:"false"`
		Meta struct {
			NextCursor string `json:"nextCursor,omitempty"`
		} `json:"meta"`
	}
}

func inboxOutput(entry domain.Inquiry, err error) (*InboxOutput, error) {
	if err != nil {
		return nil, shared.MapError(err, true)
	}
	out := &InboxOutput{}
	out.Body.Data = mapper.Inbox(entry)
	return out, nil
}
func RegisterInbox(api huma.API, service *app.Inbox) {
	operation := func(id, method, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, MaxBodyBytes: 1024, Security: []map[string][]string{{"oidc": {}}}, Metadata: map[string]any{"sensitive-input": true}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
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
	base := "/v1/dealers/{dealerID}/inquiries"
	huma.Register(api, operation("list-inbox-inquiries", http.MethodGet, base), func(ctx context.Context, in *InboxListInput) (*InboxListOutput, error) {
		entries, next, err := service.List(ctx, in.Authorization, in.DealerID, in.Cursor, in.Limit)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &InboxListOutput{}
		out.Body.Data = make([]dto.InboxInquiry, 0, len(entries))
		out.Body.Meta.NextCursor = next
		for _, entry := range entries {
			out.Body.Data = append(out.Body.Data, mapper.Inbox(entry))
		}
		return out, nil
	})
	huma.Register(api, operation("get-inbox-inquiry", http.MethodGet, base+"/{id}"), func(ctx context.Context, in *InboxGetInput) (*InboxOutput, error) {
		return inboxOutput(service.Get(ctx, in.Authorization, in.DealerID, in.ID))
	})
	huma.Register(api, operation("acknowledge-inbox-inquiry", http.MethodPost, base+"/{id}/read"), func(ctx context.Context, in *InboxReadInput) (*InboxOutput, error) {
		return inboxOutput(service.MarkRead(ctx, in.Authorization, in.DealerID, in.ID, in.Body.Revision))
	})
}
