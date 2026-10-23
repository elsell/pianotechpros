package showroom

import (
	"github.com/danielgtaylor/huma/v2"
	dealerstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/showroom/routes"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func Registration(db *gorm.DB, probe ports.Probe) func(huma.API) {
	return func(api huma.API) {
		var repository app.Repository
		if db != nil {
			repository = dealerstore.New(db)
		}
		routes.Register(api, app.New(repository, probe))
	}
}
