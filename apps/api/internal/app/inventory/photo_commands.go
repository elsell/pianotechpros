package inventory

import (
	"context"
	"errors"
	"io"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

var errPhotoResult = errors.New("invalid_photo_repository_result")

func (c *Commands) photoAccess(ctx context.Context, credential, dealerID, id string, operation Operation) (Access, error) {
	access, err := c.policy.Require(ctx, credential, dealerID, operation)
	if err != nil {
		return Access{}, err
	}
	if c.dependencies.Photos == nil {
		return Access{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if !validID(id) {
		return Access{}, ports.ErrInvalidArgument
	}
	return access, nil
}
func (c *Commands) photoFailure(ctx context.Context, access Access, err error) error {
	_, err = c.result(ctx, access, domain.Record{}, err, "")
	return err
}
func validatePhotoState(state PhotoState, dealerID, id string) error {
	if state.Record.ID != id || state.Record.DealerID != dealerID || state.Record.Revision < 1 || state.Record.Revision > 9007199254740991 {
		return errPhotoResult
	}
	if _, err := domain.RestorePhotos(id, dealerID, state.Photos); err != nil {
		return errPhotoResult
	}
	return nil
}
func (c *Commands) photoResult(ctx context.Context, access Access, id string, state PhotoState, err error, probe string) (PhotoState, error) {
	if err == nil {
		err = validatePhotoState(state, access.DealerID, id)
	}
	if err != nil {
		return PhotoState{}, c.photoFailure(ctx, access, err)
	}
	_, _ = c.result(ctx, access, state.Record, nil, probe)
	return state, nil
}
func validPhotoIntent(key string, expected int64) bool {
	if len(key) < 16 || len(key) > 128 || !validPhotoRevision(expected) {
		return false
	}
	for _, b := range []byte(key) {
		if b < 33 || b > 126 {
			return false
		}
	}
	return true
}
func validPhotoRevision(expected int64) bool { return expected > 0 && expected <= 9007199254740991 }

func (c *Commands) UploadPhoto(ctx context.Context, credential, dealerID, id, key string, expected int64, source io.Reader) (PhotoUploadResult, error) {
	access, err := c.photoAccess(ctx, credential, dealerID, id, Write)
	if err != nil {
		return PhotoUploadResult{}, err
	}
	if c.dependencies.PhotoProcessor == nil || c.dependencies.NewID == nil {
		return PhotoUploadResult{}, ports.ErrAuthorizationPolicyNotConfigured
	}
	if source == nil || !validPhotoIntent(key, expected) {
		return PhotoUploadResult{}, ports.ErrInvalidArgument
	}
	state, err := c.dependencies.Photos.GetPhotos(ctx, access.ActorID, dealerID, id, c.event(ctx, access, id, audit.ResourceViewed))
	if err == nil {
		err = validatePhotoState(state, dealerID, id)
	}
	if err != nil {
		return PhotoUploadResult{}, c.photoFailure(ctx, access, err)
	}
	if err := ctx.Err(); err != nil {
		return PhotoUploadResult{}, err
	}
	image, err := c.dependencies.PhotoProcessor.Process(ctx, source)
	if err != nil {
		return PhotoUploadResult{}, err
	}
	if err := ctx.Err(); err != nil {
		return PhotoUploadResult{}, err
	}
	fresh, err := c.photoAccess(ctx, credential, dealerID, id, Write)
	if err != nil {
		return PhotoUploadResult{}, err
	}
	if fresh.ActorID != access.ActorID || fresh.OwnerUserID != access.OwnerUserID {
		return PhotoUploadResult{}, c.policy.deny(ctx, fresh.ActorID, ports.ErrNotFound)
	}
	photoID := c.dependencies.NewID()
	if !validID(photoID) {
		return PhotoUploadResult{}, ports.ErrInvalidArgument
	}
	out, err := c.dependencies.Photos.StorePhoto(ctx, fresh.ActorID, dealerID, id, PhotoUpload{ID: photoID, Key: key, ExpectedRevision: expected, Image: image}, c.event(ctx, fresh, id, audit.ResourceUpdated))
	if err == nil && !validID(out.PhotoID) {
		err = errPhotoResult
	}
	if err != nil {
		return PhotoUploadResult{}, c.photoFailure(ctx, fresh, err)
	}
	out.State, err = c.photoResult(ctx, fresh, id, out.State, nil, "inventory.photo_uploaded")
	if err != nil {
		return PhotoUploadResult{}, err
	}
	return out, nil
}
func (c *Commands) ListPhotos(ctx context.Context, credential, dealerID, id string) (PhotoState, error) {
	access, err := c.photoAccess(ctx, credential, dealerID, id, Read)
	if err != nil {
		return PhotoState{}, err
	}
	state, err := c.dependencies.Photos.GetPhotos(ctx, access.ActorID, dealerID, id, c.event(ctx, access, id, audit.ResourceViewed))
	return c.photoResult(ctx, access, id, state, err, "inventory.photos_viewed")
}
func (c *Commands) ReadPhoto(ctx context.Context, credential, dealerID, id, photoID string) (ports.ProcessedPhoto, error) {
	access, err := c.photoAccess(ctx, credential, dealerID, id, Read)
	if err != nil {
		return ports.ProcessedPhoto{}, err
	}
	if !validID(photoID) {
		return ports.ProcessedPhoto{}, ports.ErrInvalidArgument
	}
	image, err := c.dependencies.Photos.GetPhoto(ctx, access.ActorID, dealerID, id, photoID, c.event(ctx, access, id, audit.ResourceViewed))
	if err != nil {
		return ports.ProcessedPhoto{}, c.photoFailure(ctx, access, err)
	}
	_, _ = c.result(ctx, access, domain.Record{}, nil, "inventory.photo_viewed")
	return image, nil
}
func (c *Commands) ReorderPhotos(ctx context.Context, credential, dealerID, id string, ids []string, expected int64) (PhotoState, error) {
	access, err := c.photoAccess(ctx, credential, dealerID, id, Write)
	if err != nil {
		return PhotoState{}, err
	}
	if !validPhotoRevision(expected) || len(ids) > 50 {
		return PhotoState{}, ports.ErrInvalidArgument
	}
	seen := map[string]bool{}
	for _, photoID := range ids {
		if !validID(photoID) || seen[photoID] {
			return PhotoState{}, ports.ErrInvalidArgument
		}
		seen[photoID] = true
	}
	state, err := c.dependencies.Photos.ReorderPhotos(ctx, access.ActorID, dealerID, id, ids, expected, c.event(ctx, access, id, audit.ResourceUpdated))
	return c.photoResult(ctx, access, id, state, err, "inventory.photos_reordered")
}
func (c *Commands) DescribePhoto(ctx context.Context, credential, dealerID, id, photoID, alt string, expected int64) (PhotoState, error) {
	access, err := c.photoAccess(ctx, credential, dealerID, id, Write)
	if err != nil {
		return PhotoState{}, err
	}
	if !validID(photoID) || !validPhotoRevision(expected) {
		return PhotoState{}, ports.ErrInvalidArgument
	}
	// Validate text through the same domain collection contract used in persistence.
	if _, err := domain.RestorePhotos(id, dealerID, []domain.PhotoEvidence{{ID: photoID, RecordID: id, DealerID: dealerID, Ready: true, AltText: alt}}); err != nil {
		return PhotoState{}, ports.ErrInvalidArgument
	}
	state, err := c.dependencies.Photos.DescribePhoto(ctx, access.ActorID, dealerID, id, photoID, alt, expected, c.event(ctx, access, id, audit.ResourceUpdated))
	return c.photoResult(ctx, access, id, state, err, "inventory.photo_described")
}
func (c *Commands) RemovePhoto(ctx context.Context, credential, dealerID, id, photoID string, expected int64) (PhotoState, error) {
	access, err := c.photoAccess(ctx, credential, dealerID, id, Write)
	if err != nil {
		return PhotoState{}, err
	}
	if !validID(photoID) || !validPhotoRevision(expected) {
		return PhotoState{}, ports.ErrInvalidArgument
	}
	state, err := c.dependencies.Photos.RemovePhoto(ctx, access.ActorID, dealerID, id, photoID, expected, c.event(ctx, access, id, audit.ResourceUpdated))
	return c.photoResult(ctx, access, id, state, err, "inventory.photo_removed")
}
