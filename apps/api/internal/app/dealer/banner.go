package dealer

import (
	"context"
	"errors"
	"io"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type BannerUpload struct {
	ID, Key          string
	ExpectedRevision int64
	Image            ports.ProcessedPhoto
}
type BannerUploadResult = domain.BannerUploadResult

// BannerRepository owns current media, profile revision and audit in one transaction.
type BannerRepository interface {
	ReadBannerState(context.Context, string, domain.ID, audit.Event) (domain.BannerState, error)
	ReadBannerImage(context.Context, string, domain.ID, string, audit.Event) (ports.ProcessedPhoto, error)
	ReplaceBanner(context.Context, string, domain.ID, BannerUpload, audit.Event) (BannerUploadResult, error)
	RemoveBanner(context.Context, string, domain.ID, int64, audit.Event) (domain.BannerState, error)
}

func bannerID(id string) bool {
	return id != "" && len(id) <= 128 && utf8.ValidString(id) && strings.TrimSpace(id) == id && strings.IndexFunc(id, unicode.IsControl) < 0
}
func bannerRevision(v int64) bool { return v >= 1 && v < 9007199254740991 }
func bannerKey(key string) bool {
	if len(key) < 16 || len(key) > 128 {
		return false
	}
	for _, c := range []byte(key) {
		if c < 33 || c > 126 {
			return false
		}
	}
	return true
}
func (s *Service) bannerAccess(ctx context.Context, credential string, id domain.ID, write bool) (string, domain.Entity, error) {
	actor, err := s.principalForAuditedOperation(ctx, credential)
	if err != nil {
		return "", domain.Entity{}, err
	}
	if s.Banners == nil {
		return "", domain.Entity{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !bannerID(string(id)) {
		return "", domain.Entity{}, ports.ErrInvalidArgument
	}
	item, err := s.Repository.Get(ctx, actor, id)
	if err != nil {
		return "", domain.Entity{}, s.bannerFailure(ctx, actor, id, err)
	}
	permission := "view"
	if write {
		permission = "manage_profile"
	}
	allowed, err := s.Authorizer.Check(ctx, "dealer", string(id), permission, actor)
	if err != nil {
		return "", domain.Entity{}, s.deniedDecision(ctx, actor, id, err)
	}
	if !allowed || (write && item.OwnerUserID != actor) {
		return "", domain.Entity{}, s.deniedDecision(ctx, actor, id, ports.ErrNotFound)
	}
	if item.ID != id || item.OwnerUserID == "" {
		return "", domain.Entity{}, ports.ErrInvalidArgument
	}
	return actor, item, nil
}
func (s *Service) bannerFailure(ctx context.Context, actor string, id domain.ID, err error) error {
	if errors.Is(err, ports.ErrNotFound) {
		return s.deniedDecision(ctx, actor, id, err)
	}
	return err
}
func (s *Service) bannerEvent(ctx context.Context, actor string, item domain.Entity, action audit.Action) audit.Event {
	return shared.NewAuditEvent(ctx, s.Clock, item.OwnerUserID, actor, action, "dealer", string(item.ID), audit.Succeeded)
}
func (s *Service) bannerResult(ctx context.Context, actor string, item domain.Entity, state domain.BannerState, err error) (domain.BannerState, error) {
	if err != nil {
		return domain.BannerState{}, s.bannerFailure(ctx, actor, item.ID, err)
	}
	if !state.ValidFor(item.ID) || state.Dealer.OwnerUserID != item.OwnerUserID {
		return domain.BannerState{}, ports.ErrInvalidArgument
	}
	return state, nil
}
func (s *Service) GetBannerState(ctx context.Context, credential string, id domain.ID) (domain.BannerState, error) {
	actor, item, err := s.bannerAccess(ctx, credential, id, false)
	if err != nil {
		return domain.BannerState{}, err
	}
	state, err := s.Banners.ReadBannerState(ctx, actor, id, s.bannerEvent(ctx, actor, item, audit.ResourceViewed))
	state, err = s.bannerResult(ctx, actor, item, state, err)
	if err == nil {
		s.observeSuccess(ctx, "dealer.banner_viewed")
	}
	return state, err
}
func (s *Service) ReadBannerImage(ctx context.Context, credential string, id domain.ID, assetID string) (ports.ProcessedPhoto, error) {
	actor, item, err := s.bannerAccess(ctx, credential, id, false)
	if err != nil {
		return ports.ProcessedPhoto{}, err
	}
	if !bannerID(assetID) {
		return ports.ProcessedPhoto{}, ports.ErrInvalidArgument
	}
	image, err := s.Banners.ReadBannerImage(ctx, actor, id, assetID, s.bannerEvent(ctx, actor, item, audit.ResourceViewed))
	if err != nil {
		return ports.ProcessedPhoto{}, s.bannerFailure(ctx, actor, id, err)
	}
	s.observeSuccess(ctx, "dealer.banner_image_viewed")
	return image, nil
}
func (s *Service) UploadBanner(ctx context.Context, credential string, id domain.ID, key string, expected int64, source io.Reader) (BannerUploadResult, error) {
	actor, item, err := s.bannerAccess(ctx, credential, id, true)
	if err != nil {
		return BannerUploadResult{}, err
	}
	if s.BannerProcessor == nil || s.NewID == nil {
		return BannerUploadResult{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !bannerRevision(expected) || !bannerKey(key) || source == nil {
		return BannerUploadResult{}, ports.ErrInvalidArgument
	}
	if err = ctx.Err(); err != nil {
		return BannerUploadResult{}, err
	}
	image, err := s.BannerProcessor.Process(ctx, source)
	if err != nil {
		return BannerUploadResult{}, err
	}
	if err = ctx.Err(); err != nil {
		return BannerUploadResult{}, err
	}
	freshActor, fresh, err := s.bannerAccess(ctx, credential, id, true)
	if err != nil {
		return BannerUploadResult{}, err
	}
	if actor != freshActor || fresh.OwnerUserID != item.OwnerUserID {
		return BannerUploadResult{}, s.deniedDecision(ctx, freshActor, id, ports.ErrNotFound)
	}
	assetID := s.NewID()
	if !bannerID(assetID) {
		return BannerUploadResult{}, ports.ErrInvalidArgument
	}
	result, err := s.Banners.ReplaceBanner(ctx, actor, id, BannerUpload{ID: assetID, Key: key, ExpectedRevision: expected, Image: image}, s.bannerEvent(ctx, actor, fresh, audit.ResourceUpdated))
	result.State, err = s.bannerResult(ctx, actor, fresh, result.State, err)
	if err != nil {
		return BannerUploadResult{}, err
	}
	if !bannerID(result.BannerID) || (!result.Replay && (result.BannerID != assetID || result.State.Banner == nil || result.State.Banner.ID != assetID || result.State.Dealer.Revision != expected+1 || result.State.Banner.SHA256 != image.SHA256)) {
		return BannerUploadResult{}, ports.ErrInvalidArgument
	}
	s.observeSuccess(ctx, "dealer.banner_uploaded")
	return result, nil
}
func (s *Service) RemoveBanner(ctx context.Context, credential string, id domain.ID, expected int64) (domain.BannerState, error) {
	actor, item, err := s.bannerAccess(ctx, credential, id, true)
	if err != nil {
		return domain.BannerState{}, err
	}
	if !bannerRevision(expected) {
		return domain.BannerState{}, ports.ErrInvalidArgument
	}
	state, err := s.Banners.RemoveBanner(ctx, actor, id, expected, s.bannerEvent(ctx, actor, item, audit.ResourceUpdated))
	state, err = s.bannerResult(ctx, actor, item, state, err)
	if err != nil {
		return domain.BannerState{}, err
	}
	if state.Banner != nil || state.Dealer.Revision != expected+1 {
		return domain.BannerState{}, ports.ErrInvalidArgument
	}
	s.observeSuccess(ctx, "dealer.banner_removed")
	return state, nil
}
