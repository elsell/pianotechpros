package inventory

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type PhotoState struct {
	Record domain.Record
	Photos []domain.PhotoEvidence
}
type PhotoUpload struct {
	ID, Key          string
	ExpectedRevision int64
	Image            ports.ProcessedPhoto
}
type PhotoUploadResult struct {
	State   PhotoState
	PhotoID string
	Replay  bool
}

// PhotoRepository rechecks local authority and atomically commits photo data,
// record/history and audit. Callers enforce SpiceDB and principal limiting first.
type PhotoRepository interface {
	StorePhoto(context.Context, string, string, string, PhotoUpload, audit.Event) (PhotoUploadResult, error)
	GetPhotos(context.Context, string, string, string, audit.Event) (PhotoState, error)
	GetPhoto(context.Context, string, string, string, string, audit.Event) (ports.ProcessedPhoto, error)
}
