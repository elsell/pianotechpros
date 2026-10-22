package routes

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/mapper"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

type StaffListService interface {
	ListStaff(context.Context, string, domain.ID, string, int) ([]domain.Membership, string, error)
	ListStaffInvitations(context.Context, string, domain.ID, string, int) ([]domain.InvitationSummary, string, error)
}
type StaffListInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id" maxLength:"128"`
	Cursor        string `query:"cursor"`
	Limit         int    `query:"limit" default:"50" minimum:"1" maximum:"100"`
}
type StaffListMeta struct {
	NextCursor string `json:"nextCursor,omitempty"`
}
type StaffListOutput struct {
	Body struct {
		Data []dto.StaffMember `json:"data" nullable:"false"`
		Meta StaffListMeta     `json:"meta"`
	}
}
type StaffInvitationListOutput struct {
	Body struct {
		Data []dto.StaffInvitationSummary `json:"data" nullable:"false"`
		Meta StaffListMeta                `json:"meta"`
	}
}

func registerStaffLists(api huma.API, service StaffListService) {
	operation := func(id, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: http.MethodGet, Path: path, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			next(ctx)
		}}}
	}
	huma.Register(api, operation("list-dealer-staff", "/v1/dealers/{id}/staff"), func(ctx context.Context, input *StaffListInput) (*StaffListOutput, error) {
		items, cursor, err := service.ListStaff(ctx, input.Authorization, domain.ID(input.ID), input.Cursor, input.Limit)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &StaffListOutput{}
		out.Body.Data = make([]dto.StaffMember, 0, len(items))
		for _, item := range items {
			out.Body.Data = append(out.Body.Data, mapper.StaffMember(item))
		}
		out.Body.Meta.NextCursor = cursor
		return out, nil
	})
	huma.Register(api, operation("list-dealer-staff-invitations", "/v1/dealers/{id}/staff-invitations"), func(ctx context.Context, input *StaffListInput) (*StaffInvitationListOutput, error) {
		items, cursor, err := service.ListStaffInvitations(ctx, input.Authorization, domain.ID(input.ID), input.Cursor, input.Limit)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &StaffInvitationListOutput{}
		out.Body.Data = make([]dto.StaffInvitationSummary, 0, len(items))
		for _, item := range items {
			out.Body.Data = append(out.Body.Data, mapper.StaffInvitationSummary(item))
		}
		out.Body.Meta.NextCursor = cursor
		return out, nil
	})
}
