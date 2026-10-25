package showroom

import (
	"context"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

const DiscoveryLimit = 10000

// Discovery projections deliberately omit contact, private and media fields.
type DiscoveryShop struct{ ID, Slug, Name string }
type DiscoveryPiano struct{ ID, DealerID, Title string }
type DiscoveryCatalog struct {
	Shop   DiscoveryShop
	Pianos []DiscoveryPiano
}

// DiscoveryRepository is anonymous and must enforce current publication visibility
// inside each bounded read. Implementations return an error on capacity overflow,
// never a truncated directory or a catalog assembled from private working records.
type DiscoveryRepository interface {
	ReadPublicDirectory(context.Context) ([]DiscoveryShop, error)
	ReadPublicCatalog(context.Context, string) (DiscoveryCatalog, error)
}
type DiscoveryReader interface {
	Directory(context.Context) ([]DiscoveryShop, error)
	Catalog(context.Context, string) (DiscoveryCatalog, error)
}
type DiscoveryService struct {
	repository DiscoveryRepository
	probe      ports.Probe
}

func NewDiscovery(repository DiscoveryRepository, probe ports.Probe) *DiscoveryService {
	return &DiscoveryService{repository: repository, probe: probe}
}

var discoveryID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var discoverySlug = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func validDiscoverySlug(value string) bool {
	return len(value) <= 80 && discoverySlug.MatchString(value)
}
func validDiscoveryText(value string, limit int) bool {
	return utf8.ValidString(value) && value != "" && strings.TrimSpace(value) == value && utf8.RuneCountInString(value) <= limit
}
func validDiscoveryShop(shop DiscoveryShop) bool {
	return discoveryID.MatchString(shop.ID) && validDiscoverySlug(shop.Slug) && validDiscoveryText(shop.Name, 200)
}
func (s *DiscoveryService) observe(ctx context.Context, name string, err error) {
	if s.probe == nil {
		return
	}
	outcome := "succeeded"
	if err != nil {
		outcome = "failed"
	}
	s.probe.Observe(ctx, ports.ProbeEvent{Name: name, Outcome: outcome, CorrelationID: shared.CorrelationID(ctx)})
}
func (s *DiscoveryService) Directory(ctx context.Context) (value []DiscoveryShop, err error) {
	defer func() {
		if err != nil {
			value = nil
		}
		s.observe(ctx, "showroom.discovery.listed", err)
	}()
	if s.repository == nil {
		return nil, ports.ErrAuthorizationPolicyNotConfigured
	}
	value, err = s.repository.ReadPublicDirectory(ctx)
	if err != nil {
		return nil, err
	}
	if len(value) > DiscoveryLimit {
		return nil, ports.ErrInvalidArgument
	}
	ids, slugs := map[string]bool{}, map[string]bool{}
	for _, shop := range value {
		if !validDiscoveryShop(shop) || ids[shop.ID] || slugs[shop.Slug] {
			return nil, ports.ErrInvalidArgument
		}
		ids[shop.ID], slugs[shop.Slug] = true, true
	}
	return value, nil
}
func (s *DiscoveryService) Catalog(ctx context.Context, slug string) (value DiscoveryCatalog, err error) {
	defer func() {
		if err != nil {
			value = DiscoveryCatalog{}
		}
		s.observe(ctx, "showroom.discovery.viewed", err)
	}()
	if s.repository == nil {
		return value, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !validDiscoverySlug(slug) {
		return value, domain.ErrInvalidQuery
	}
	value, err = s.repository.ReadPublicCatalog(ctx, slug)
	if err != nil {
		return value, err
	}
	if !validDiscoveryShop(value.Shop) || value.Shop.Slug != slug || len(value.Pianos) > DiscoveryLimit {
		return value, ports.ErrInvalidArgument
	}
	ids := map[string]bool{}
	for _, piano := range value.Pianos {
		if !discoveryID.MatchString(piano.ID) || piano.DealerID != value.Shop.ID || ids[piano.ID] || !validDiscoveryText(piano.Title, 500) {
			return value, ports.ErrInvalidArgument
		}
		ids[piano.ID] = true
	}
	return value, nil
}
