package inventory

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type PhotoState = domain.PhotoState
type PhotoUpload struct {
	ID, Key          string
	ExpectedRevision int64
	Image            ports.ProcessedPhoto
}
type PhotoUploadResult = domain.PhotoUploadResult

// PhotoRepository rechecks local authority and atomically commits photo data,
// record/history and audit. Callers enforce SpiceDB and principal limiting first.
type PhotoRepository interface {
	ReorderPhotos(context.Context, string, string, string, []string, int64, audit.Event) (PhotoState, error)
	DescribePhoto(context.Context, string, string, string, string, string, int64, audit.Event) (PhotoState, error)
	RemovePhoto(context.Context, string, string, string, string, int64, audit.Event) (PhotoState, error)
	StorePhoto(context.Context, string, string, string, PhotoUpload, audit.Event) (PhotoUploadResult, error)
	GetPhotos(context.Context, string, string, string, audit.Event) (PhotoState, error)
	GetPhoto(context.Context, string, string, string, string, audit.Event) (ports.ProcessedPhoto, error)
}
