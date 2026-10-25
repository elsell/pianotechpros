package showroom

import (
	"context"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type Listing struct {
	Profile domain.Profile
	Piano   inventory.PublicListing
}

type Page struct {
	Profile domain.Profile
	Pianos  []inventory.PublicListing
	HasMore bool
}

// CollectionRepository has the same anonymous visibility boundary as Repository.
// The query applies exclusively to published snapshots and current availability.
type CollectionRepository interface {
	ListPublicPianos(context.Context, string, domain.Query) (Page, error)
}

// Repository is deliberately anonymous: its implementation checks current
// showroom/publication visibility together and returns only public projections.
// Application callers must apply the coordinated source limiter before reads.
// Private user-owned repository methods must never implement these by omission
// of their actor scope, membership, authorization or audit arguments.
type Repository interface {
	ReadPublicBanner(context.Context, string, string) (ports.ProcessedPhoto, error)
	ReadPublicProfile(context.Context, string) (domain.Profile, error)
	ReadPublicListing(context.Context, string, string) (Listing, error)
	ReadPublicPhoto(context.Context, string, string, string) (ports.ProcessedPhoto, error)
}
