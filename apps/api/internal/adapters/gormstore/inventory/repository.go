package inventorystore

import (
	dealerstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/dealer"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"gorm.io/gorm"
)

// Repository reuses dealer-scoped transactional locking and inventory persistence.
type Repository struct{ *dealerstore.Repository }

var _ application.Repository = (*Repository)(nil)

func New(db *gorm.DB) *Repository { return &Repository{Repository: dealerstore.New(db)} }
