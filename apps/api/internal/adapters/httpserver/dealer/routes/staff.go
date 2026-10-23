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

type StaffService interface {
	RevokeMembership(context.Context, string, domain.ID, string, int64) (domain.Membership, error)
	ChangeMembershipRole(context.Context, string, domain.ID, string, domain.Role, int64) (domain.Membership, error)
}
type StaffRoleInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id" maxLength:"128"`
	UserID        string `path:"userID" maxLength:"128"`
	Body          dto.StaffRoleChange
}
type StaffRevokeInput struct {
	Authorization string `header:"Authorization"`
	ID            string `path:"id" maxLength:"128"`
	UserID        string `path:"userID" maxLength:"128"`
	Body          dto.StaffRevocation
}
type StaffOutput struct {
	Body struct {
		Data dto.StaffMember `json:"data"`
	}
}

func registerStaff(api huma.API, service StaffService) {
	security := []map[string][]string{{"oidc": {}}}
	huma.Register(api, huma.Operation{OperationID: "change-dealer-staff-role", Method: http.MethodPut, Path: "/v1/dealers/{id}/staff/{userID}/role", Security: security}, func(ctx context.Context, input *StaffRoleInput) (*StaffOutput, error) {
		member, err := service.ChangeMembershipRole(ctx, input.Authorization, domain.ID(input.ID), input.UserID, domain.Role(input.Body.Role), input.Body.ExpectedRevision)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &StaffOutput{}
		out.Body.Data = mapper.StaffMember(member)
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "revoke-dealer-staff", Method: http.MethodPost, Path: "/v1/dealers/{id}/staff/{userID}/revoke", Security: security}, func(ctx context.Context, input *StaffRevokeInput) (*StaffOutput, error) {
		member, err := service.RevokeMembership(ctx, input.Authorization, domain.ID(input.ID), input.UserID, input.Body.ExpectedRevision)
		if err != nil {
			return nil, shared.MapError(err, true)
		}
		out := &StaffOutput{}
		out.Body.Data = mapper.StaffMember(member)
		return out, nil
	})
}
