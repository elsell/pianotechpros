package showroom

import (
	"github.com/danielgtaylor/huma/v2"
	dealerstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/routes"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func Registration(db *gorm.DB, probe ports.Probe, cursorKey []byte) func(huma.API) {
	return func(api huma.API) {
		var repository app.Repository
		var collection app.CollectionRepository
		var discovery app.DiscoveryRepository
		if db != nil {
			repository = dealerstore.New(db)
			collection = dealerstore.New(db)
			discovery = dealerstore.New(db)
		}
		routes.Register(api, app.New(repository, probe))
		routes.RegisterCollection(api, app.NewCollection(collection, cursorKey, probe))
		routes.RegisterDiscovery(api, app.NewDiscovery(discovery, probe))
	}
}
