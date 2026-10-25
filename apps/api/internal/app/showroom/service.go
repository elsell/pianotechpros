package showroom

import (
	"context"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type Service struct {
	repository Repository
	probe      ports.Probe
}

func New(repository Repository, probe ports.Probe) *Service {
	return &Service{repository: repository, probe: probe}
}

func read[T any](ctx context.Context, s *Service, operation string, load func() (T, error)) (T, error) {
	var value T
	var err error
	if s.repository == nil {
		err = ports.ErrAuthorizationPolicyNotConfigured
	} else {
		value, err = load()
	}
	outcome := "succeeded"
	if err != nil {
		outcome = "failed"
		var zero T
		value = zero
	}
	if s.probe != nil {
		s.probe.Observe(ctx, ports.ProbeEvent{Name: operation, Outcome: outcome, CorrelationID: shared.CorrelationID(ctx)})
	}
	return value, err
}

func (s *Service) ReadPublicProfile(ctx context.Context, slug string) (domain.Profile, error) {
	return read(ctx, s, "showroom.profile.viewed", func() (domain.Profile, error) { return s.repository.ReadPublicProfile(ctx, slug) })
}
func (s *Service) ReadPublicListing(ctx context.Context, slug, id string) (Listing, error) {
	return read(ctx, s, "showroom.listing.viewed", func() (Listing, error) { return s.repository.ReadPublicListing(ctx, slug, id) })
}
func (s *Service) ReadPublicPhoto(ctx context.Context, slug, id, photoID string) (ports.ProcessedPhoto, error) {
	return read(ctx, s, "showroom.photo.viewed", func() (ports.ProcessedPhoto, error) { return s.repository.ReadPublicPhoto(ctx, slug, id, photoID) })
}

func (s *Service) ReadPublicBanner(ctx context.Context, slug, id string) (ports.ProcessedPhoto, error) {
	return read(ctx, s, "showroom.banner.viewed", func() (ports.ProcessedPhoto, error) { return s.repository.ReadPublicBanner(ctx, slug, id) })
}
