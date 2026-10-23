package routes

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/mapper"

	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

type InvitationService interface {
	CreateStaffInvitation(context.Context, string, domain.ID, domain.Role, int) (domain.IssuedInvitation, error)
	PreviewStaffInvitation(context.Context, string, domain.ID, string, string) (domain.InvitationPreview, error)
	AcceptStaffInvitation(context.Context, string, domain.ID, string, string) (domain.Membership, error)
	RevokeStaffInvitation(context.Context, string, domain.ID, string) error
}
type InvitationCreateInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id" maxLength:"128"`
	Body          dto.StaffInvitationCreate
}
type InvitationTokenInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id" maxLength:"128"`
	InvitationID  string `path:"invitationID" maxLength:"128"`
	Body          dto.StaffInvitationToken
}
type InvitationRevokeInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id" maxLength:"128"`
	InvitationID  string `path:"invitationID" maxLength:"128"`
}
type InvitationIssuedOutput struct {
	Body struct {
		Data dto.StaffInvitationIssued `json:"data"`
	}
}
type InvitationPreviewOutput struct {
	Body struct {
		Data dto.StaffInvitationPreview `json:"data"`
	}
}

func invitationError(err error) error {
	if errors.Is(err, domain.ErrInvalidInvitation) {
		return &shared.APIError{Type: "about:blank", Title: "Bad Request", Status: http.StatusBadRequest, Code: "invalid_invitation", Detail: "invitation is invalid or unavailable"}
	}
	return shared.MapError(err, true)
}
func registerInvitations(api huma.API, service InvitationService) {
	path := "/v1/dealers/{id}/staff-invitations"
	operation := func(id, path string) huma.Operation {
		return huma.Operation{OperationID: id, Metadata: map[string]any{"sensitive-input": true}, Method: http.MethodPost, Path: path, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			next(ctx)
		}}}
	}
	create := operation("create-dealer-staff-invitation", path)
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, func(ctx context.Context, input *InvitationCreateInput) (*InvitationIssuedOutput, error) {
		issued, err := service.CreateStaffInvitation(ctx, input.Authorization, domain.ID(input.ID), domain.Role(input.Body.Role), input.Body.ExpiresInHours)
		if err != nil {
			return nil, invitationError(err)
		}
		out := &InvitationIssuedOutput{}
		out.Body.Data = dto.StaffInvitationIssued{StaffInvitationPreview: mapper.StaffInvitation(issued.Invitation), Token: issued.Token}
		return out, nil
	})
	huma.Register(api, operation("preview-dealer-staff-invitation", path+"/{invitationID}/preview"), func(ctx context.Context, input *InvitationTokenInput) (*InvitationPreviewOutput, error) {
		preview, err := service.PreviewStaffInvitation(ctx, input.Authorization, domain.ID(input.ID), input.InvitationID, input.Body.Token)
		if err != nil {
			return nil, invitationError(err)
		}
		out := &InvitationPreviewOutput{}
		out.Body.Data = mapper.StaffInvitation(preview)
		return out, nil
	})
	huma.Register(api, operation("accept-dealer-staff-invitation", path+"/{invitationID}/accept"), func(ctx context.Context, input *InvitationTokenInput) (*StaffOutput, error) {
		member, err := service.AcceptStaffInvitation(ctx, input.Authorization, domain.ID(input.ID), input.InvitationID, input.Body.Token)
		if err != nil {
			return nil, invitationError(err)
		}
		out := &StaffOutput{}
		out.Body.Data = mapper.StaffMember(member)
		return out, nil
	})
	revoke := operation("revoke-dealer-staff-invitation", path+"/{invitationID}/revoke")
	revoke.DefaultStatus = http.StatusNoContent
	huma.Register(api, revoke, func(ctx context.Context, input *InvitationRevokeInput) (*DealerNoContentOutput, error) {
		if err := service.RevokeStaffInvitation(ctx, input.Authorization, domain.ID(input.ID), input.InvitationID); err != nil {
			return nil, invitationError(err)
		}
		return &DealerNoContentOutput{Status: http.StatusNoContent}, nil
	})
}
