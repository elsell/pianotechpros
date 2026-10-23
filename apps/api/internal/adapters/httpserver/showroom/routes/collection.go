package routes

import (
	"context"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
	inventorydto "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	inventorymapper "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/mapper"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/mapper"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

type CollectionInput struct {
	ProfileInput
	Search       string         `query:"search" maxLength:"120"`
	Form         inventory.Form `query:"form" enum:"grand,full_size_upright,studio_upright,console,spinet"`
	Availability string         `query:"availability" enum:"all,available,reserved,sold"`
	Currency     string         `query:"currency" pattern:"^[A-Z]{3}$"`
	MinPrice     OptionalPrice  `query:"minPrice" minimum:"0" maximum:"9007199254740991"`
	MaxPrice     OptionalPrice  `query:"maxPrice" minimum:"0" maximum:"9007199254740991"`
	Limit        int            `query:"limit" default:"30" minimum:"1" maximum:"100"`
	Cursor       string         `query:"cursor" maxLength:"4096"`
}
type PublicCollectionData struct {
	Profile dto.PublicShowroomProfile    `json:"profile"`
	Pianos  []inventorydto.PublicListing `json:"pianos" nullable:"false"`
}
type CollectionOutput struct {
	Body struct {
		Data PublicCollectionData `json:"data"`
		Meta struct {
			NextCursor string `json:"nextCursor,omitempty"`
		} `json:"meta"`
	}
}

func RegisterCollection(api huma.API, service app.CollectionReader) {
	huma.Register(api, publicOperation(api, service != nil, "list-public-pianos", "/v1/showrooms/{slug}/pianos"), func(ctx context.Context, in *CollectionInput) (*CollectionOutput, error) {
		value, err := service.List(ctx, in.Slug, app.CollectionInput{Search: in.Search, Form: in.Form, Availability: in.Availability, Currency: in.Currency, MinPrice: in.MinPrice.Pointer(), MaxPrice: in.MaxPrice.Pointer(), Limit: in.Limit, Cursor: in.Cursor})
		if err != nil {
			return nil, publicError(err)
		}
		out := &CollectionOutput{}
		out.Body.Data.Profile = mapper.Profile(value.Profile)
		out.Body.Data.Pianos = make([]inventorydto.PublicListing, 0, len(value.Pianos))
		for _, p := range value.Pianos {
			out.Body.Data.Pianos = append(out.Body.Data.Pianos, inventorymapper.PublicListing(p))
		}
		out.Body.Meta.NextCursor = value.NextCursor
		return out, nil
	})
}

// OptionalPrice preserves an explicit zero without using unsupported pointer parameters.
type OptionalPrice struct {
	Value int64
	IsSet bool
}

func (o OptionalPrice) Schema(r huma.Registry) *huma.Schema {
	return huma.SchemaFromType(r, reflect.TypeOf(o.Value))
}
func (o *OptionalPrice) Receiver() reflect.Value    { return reflect.ValueOf(&o.Value).Elem() }
func (o *OptionalPrice) OnParamSet(set bool, _ any) { o.IsSet = set }
func (o OptionalPrice) Pointer() *int64 {
	if !o.IsSet {
		return nil
	}
	value := o.Value
	return &value
}
