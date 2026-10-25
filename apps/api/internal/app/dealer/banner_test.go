package dealer

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type bannerIntent struct {
	digest   string
	revision int64
	id       string
}
type bannerMemory struct {
	*profileStore
	banner  *domain.Banner
	image   ports.ProcessedPhoto
	intents map[string]bannerIntent
}

func (r *bannerMemory) state() domain.BannerState {
	s := domain.BannerState{Dealer: r.rows["a"]}
	if r.banner != nil {
		b := *r.banner
		s.Banner = &b
	}
	return s
}
func (r *bannerMemory) access(ctx context.Context, actor string, id domain.ID, e audit.Event, write bool) error {
	if r.beforeWrite != nil && write {
		r.beforeWrite()
	}
	p, err := r.Get(ctx, actor, id)
	if err != nil {
		return err
	}
	if write && p.OwnerUserID != actor {
		return ports.ErrNotFound
	}
	if r.audits.err != nil {
		return r.audits.err
	}
	if !e.Valid() || e.ActorUserID != actor || e.OwnerUserID != p.OwnerUserID {
		return ports.ErrInvalidArgument
	}
	return nil
}
func (r *bannerMemory) ReadBannerState(ctx context.Context, actor string, id domain.ID, e audit.Event) (domain.BannerState, error) {
	if err := r.access(ctx, actor, id, e, false); err != nil {
		return domain.BannerState{}, err
	}
	r.audits.events = append(r.audits.events, e)
	return r.state(), nil
}
func (r *bannerMemory) ReadBannerImage(ctx context.Context, actor string, id domain.ID, asset string, e audit.Event) (ports.ProcessedPhoto, error) {
	if err := r.access(ctx, actor, id, e, false); err != nil {
		return ports.ProcessedPhoto{}, err
	}
	if r.banner == nil || r.banner.ID != asset {
		return ports.ProcessedPhoto{}, ports.ErrNotFound
	}
	r.audits.events = append(r.audits.events, e)
	p := r.image
	p.JPEG = bytes.Clone(p.JPEG)
	return p, nil
}
func (r *bannerMemory) ReplaceBanner(ctx context.Context, actor string, id domain.ID, u BannerUpload, e audit.Event) (BannerUploadResult, error) {
	if err := r.access(ctx, actor, id, e, true); err != nil {
		return BannerUploadResult{}, err
	}
	key := actor + "/" + string(id) + "/" + u.Key
	if prior, ok := r.intents[key]; ok {
		if prior.digest != u.Image.SHA256 || prior.revision != u.ExpectedRevision {
			return BannerUploadResult{}, ports.ErrIdempotencyConflict
		}
		e.Action = audit.ResourceViewed
		r.audits.events = append(r.audits.events, e)
		return BannerUploadResult{State: r.state(), BannerID: prior.id, Replay: true}, nil
	}
	p := r.rows[id]
	if p.Revision != u.ExpectedRevision {
		return BannerUploadResult{}, ports.ErrConflict
	}
	b, err := domain.NewBanner(id, u.ID, u.Image.Width, u.Image.Height, u.Image.SHA256, e.OccurredAt)
	if err != nil {
		return BannerUploadResult{}, err
	}
	p.Revision++
	p.UpdatedAt = e.OccurredAt
	r.rows[id] = p
	r.banner = &b
	r.image = u.Image
	r.image.JPEG = bytes.Clone(u.Image.JPEG)
	r.intents[key] = bannerIntent{u.Image.SHA256, u.ExpectedRevision, u.ID}
	r.audits.events = append(r.audits.events, e)
	return BannerUploadResult{State: r.state(), BannerID: b.ID}, nil
}
func (r *bannerMemory) RemoveBanner(ctx context.Context, actor string, id domain.ID, expected int64, e audit.Event) (domain.BannerState, error) {
	if err := r.access(ctx, actor, id, e, true); err != nil {
		return domain.BannerState{}, err
	}
	p := r.rows[id]
	if p.Revision != expected {
		return domain.BannerState{}, ports.ErrConflict
	}
	if r.banner == nil {
		return domain.BannerState{}, ports.ErrNotFound
	}
	p.Revision++
	p.UpdatedAt = e.OccurredAt
	r.rows[id] = p
	r.banner = nil
	r.image = ports.ProcessedPhoto{}
	r.audits.events = append(r.audits.events, e)
	return r.state(), nil
}

// Controlled processor fake treats its source bytes as a freshly encoded rendition.
// The real image decoder is verified separately at its adapter and HTTP boundaries.
type bannerProcessor struct {
	afterRead func()
	failure   error
}

func (p *bannerProcessor) Process(ctx context.Context, source io.Reader) (ports.ProcessedPhoto, error) {
	data, err := io.ReadAll(source)
	if err != nil {
		return ports.ProcessedPhoto{}, err
	}
	if p.afterRead != nil {
		p.afterRead()
	}
	if err := ctx.Err(); err != nil {
		return ports.ProcessedPhoto{}, err
	}
	if p.failure != nil {
		return ports.ProcessedPhoto{}, p.failure
	}
	if len(data) == 0 {
		return ports.ProcessedPhoto{}, ports.ErrInvalidPhoto
	}
	sum := sha256.Sum256(data)
	return ports.ProcessedPhoto{JPEG: data, Width: 10, Height: 10, SHA256: hex.EncodeToString(sum[:])}, nil
}

type unreadableBannerSource struct{}

func (unreadableBannerSource) Read([]byte) (int, error) { panic("unauthorized source consumed") }
func bannerFixture() (*Service, *bannerMemory, *readPermissions, *readAudits, *bannerProcessor) {
	s, r, p, a := profileFixture()
	m := &bannerMemory{profileStore: r, intents: map[string]bannerIntent{}}
	processor := &bannerProcessor{}
	s.Banners = m
	s.BannerProcessor = processor
	s.NewID = func() string { return "banner" }
	return s, m, p, a, processor
}
func TestBannerOwnerLifecycleAndReplayNeverRestoreOldMedia(t *testing.T) {
	s, r, _, a, _ := bannerFixture()
	ctx := context.Background()
	first, err := s.UploadBanner(ctx, "Bearer valid", "a", "first-upload-key1", 1, strings.NewReader("first"))
	if err != nil || first.State.Dealer.Revision != 2 || first.BannerID != "banner" || first.Replay {
		t.Fatalf("upload: %+v %v", first, err)
	}
	s.NewID = func() string { return "replacement" }
	second, err := s.UploadBanner(ctx, "Bearer valid", "a", "second-upload-key", 2, strings.NewReader("second"))
	if err != nil || second.State.Dealer.Revision != 3 {
		t.Fatalf("replace: %+v %v", second, err)
	}
	replay, err := s.UploadBanner(ctx, "Bearer valid", "a", "first-upload-key1", 1, strings.NewReader("first"))
	if err != nil || !replay.Replay || replay.BannerID != "banner" || replay.State.Banner.ID != "replacement" || replay.State.Dealer.Revision != 3 {
		t.Fatalf("old replay: %+v %v", replay, err)
	}
	if _, err = s.UploadBanner(ctx, "Bearer valid", "a", "first-upload-key1", 1, strings.NewReader("changed")); !errors.Is(err, ports.ErrIdempotencyConflict) {
		t.Fatalf("changed intent: %v", err)
	}
	if _, err = s.ReadBannerImage(ctx, "Bearer valid", "a", "banner"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("old bytes readable: %v", err)
	}
	image, err := s.ReadBannerImage(ctx, "Bearer valid", "a", "replacement")
	if err != nil || string(image.JPEG) != "second" {
		t.Fatalf("new image: %v", err)
	}
	image.JPEG[0] = 'X'
	if string(r.image.JPEG) != "second" {
		t.Fatal("read aliased persisted bytes")
	}
	state, err := s.RemoveBanner(ctx, "Bearer valid", "a", 3)
	if err != nil || state.Banner != nil || state.Dealer.Revision != 4 {
		t.Fatalf("remove: %+v %v", state, err)
	}
	replay, err = s.UploadBanner(ctx, "Bearer valid", "a", "first-upload-key1", 1, strings.NewReader("first"))
	if err != nil || !replay.Replay || replay.State.Banner != nil || replay.State.Dealer.Revision != 4 {
		t.Fatal("replay restored removed banner")
	}
	state, err = s.GetBannerState(ctx, "Bearer valid", "a")
	if err != nil || state.Banner != nil {
		t.Fatalf("empty state: %v", err)
	}
	mutations := 0
	for _, e := range a.events {
		if e.Action == audit.ResourceUpdated {
			mutations++
		}
	}
	if mutations != 3 {
		t.Fatalf("mutation audit count %d", mutations)
	}
}
func TestBannerDeniedBeforeConsumingSource(t *testing.T) {
	for _, which := range []string{"unauthenticated", "permission", "membership", "owner", "missing processor", "missing media", "revision", "key"} {
		t.Run(which, func(t *testing.T) {
			s, r, p, _, _ := bannerFixture()
			credential := "Bearer valid"
			expected := int64(1)
			key := "first-upload-key1"
			switch which {
			case "unauthenticated":
				credential = "invalid"
			case "permission":
				delete(p.grants, "dealer:a:manage_profile:reader")
			case "membership":
				delete(r.members["reader"], "a")
			case "owner":
				v := r.rows["a"]
				v.OwnerUserID = "other"
				r.rows["a"] = v
			case "missing processor":
				s.BannerProcessor = nil
			case "missing media":
				s.Banners = nil
			case "revision":
				expected = 0
			case "key":
				key = "invalid"
			}
			result, err := s.UploadBanner(context.Background(), credential, "a", key, expected, unreadableBannerSource{})
			if err == nil || result.State.Dealer.ID != "" || r.banner != nil || r.rows["a"].Revision != 1 {
				t.Fatalf("failed closed: %+v %v", result, err)
			}
		})
	}
}
func TestBannerProcessingAndCommitFailuresPreserveCurrentImage(t *testing.T) {
	for _, which := range []string{"processing", "permission revocation", "membership revocation", "commit revocation", "audit", "stale", "cancel"} {
		t.Run(which, func(t *testing.T) {
			s, r, p, a, processor := bannerFixture()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if _, err := s.UploadBanner(ctx, "Bearer valid", "a", "first-upload-key1", 1, strings.NewReader("first")); err != nil {
				t.Fatal(err)
			}
			expected := int64(2)
			switch which {
			case "processing":
				processor.failure = ports.ErrInvalidPhoto
			case "permission revocation":
				processor.afterRead = func() { delete(p.grants, "dealer:a:manage_profile:reader") }
			case "membership revocation":
				processor.afterRead = func() { delete(r.members["reader"], "a") }
			case "commit revocation":
				r.beforeWrite = func() { delete(r.members["reader"], "a") }
			case "audit":
				a.err = errors.New("audit unavailable")
			case "stale":
				expected = 1
			case "cancel":
				processor.afterRead = cancel
			}
			result, err := s.UploadBanner(ctx, "Bearer valid", "a", "second-upload-key", expected, strings.NewReader("second"))
			if err == nil || result.State.Dealer.ID != "" || r.rows["a"].Revision != 2 || string(r.image.JPEG) != "first" {
				t.Fatalf("failure changed banner: %+v %v", result, err)
			}
		})
	}
}
