package dealer

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
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
	List(context.Context, string, PageRequest) (Page, error)
	Get(context.Context, string, domain.ID) (domain.Entity, error)
	GetCreationOwner(context.Context, string, domain.ID) (domain.Entity, error)
	Update(context.Context, string, domain.Entity, audit.Event) error
	Delete(context.Context, string, domain.ID, ports.AuthorizationChange, audit.Event) error
}
