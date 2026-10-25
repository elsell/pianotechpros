package routes

import (
	"context"
	"github.com/danielgtaylor/huma/v2"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
)

type DiscoveryShop struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type DiscoveryPiano struct {
	ID       string `json:"id"`
	DealerID string `json:"dealer_id"`
	Title    string `json:"title"`
}
type DiscoveryDirectoryData struct {
	Shops []DiscoveryShop `json:"shops" nullable:"false" maxItems:"10000"`
}
type DiscoveryCatalogData struct {
	Shop   DiscoveryShop    `json:"shop"`
	Pianos []DiscoveryPiano `json:"pianos" nullable:"false" maxItems:"10000"`
}
type DiscoveryDirectoryOutput struct {
	Body struct {
		Data DiscoveryDirectoryData `json:"data"`
	}
}
type DiscoveryCatalogOutput struct {
	Body struct {
		Data DiscoveryCatalogData `json:"data"`
	}
}

func discoveryShop(value app.DiscoveryShop) DiscoveryShop {
	return DiscoveryShop{ID: value.ID, Slug: value.Slug, Name: value.Name}
}
func RegisterDiscovery(api huma.API, service app.DiscoveryReader) {
	huma.Register(api, publicOperation(api, service != nil, "list-public-showroom-discovery", "/v1/showroom-discovery"), func(ctx context.Context, _ *struct{}) (*DiscoveryDirectoryOutput, error) {
		value, err := service.Directory(ctx)
		if err != nil {
			return nil, publicError(err)
		}
		out := &DiscoveryDirectoryOutput{}
		out.Body.Data.Shops = make([]DiscoveryShop, 0, len(value))
		for _, shop := range value {
			out.Body.Data.Shops = append(out.Body.Data.Shops, discoveryShop(shop))
		}
		return out, nil
	})
	huma.Register(api, publicOperation(api, service != nil, "read-public-showroom-discovery", "/v1/showrooms/{slug}/discovery"), func(ctx context.Context, in *ProfileInput) (*DiscoveryCatalogOutput, error) {
		value, err := service.Catalog(ctx, in.Slug)
		if err != nil {
			return nil, publicError(err)
		}
		out := &DiscoveryCatalogOutput{}
		out.Body.Data.Shop = discoveryShop(value.Shop)
		out.Body.Data.Pianos = make([]DiscoveryPiano, 0, len(value.Pianos))
		for _, piano := range value.Pianos {
			out.Body.Data.Pianos = append(out.Body.Data.Pianos, DiscoveryPiano{ID: piano.ID, DealerID: piano.DealerID, Title: piano.Title})
		}
		return out, nil
	})
}
