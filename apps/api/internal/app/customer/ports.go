package customer

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"time"
)

type PageRequest struct {
	AfterID      domain.ID
	AfterCreated time.Time
	Snapshot     time.Time
	Limit        int
}

type Page struct {
	Items   []domain.Entity
	HasMore bool
}

type Repository interface {
	Create(context.Context, domain.Entity, ports.AuthorizationChange, ports.Idempotency, audit.Event) (domain.Entity, bool, error)
	Get(context.Context, string, domain.ID) (domain.Entity, error)
	Save(context.Context, string, domain.ID, int64, domain.Attributes, time.Time, audit.Event) (domain.Entity, bool, error)
}
