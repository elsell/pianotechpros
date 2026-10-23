package inventory

import (
	"context"
	"crypto/sha256"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

// photoMemory is a scoped stateful fake behind the persistence port.
type photoIntent struct {
	id       string
	revision int64
	digest   [32]byte
}
type photoMemory struct {
	intents    map[string]photoIntent
	state      PhotoState
	image      ports.ProcessedPhoto
	events     []audit.Event
	failure    error
	unreadable bool
}

func (m *photoMemory) check(actor, dealer, id string) error {
	if m.failure != nil {
		return m.failure
	}
	if m.unreadable || actor != "actor" || m.state.Record.ID != id || m.state.Record.DealerID != dealer {
		return ports.ErrNotFound
	}
	return nil
}
func (m *photoMemory) GetPhotos(_ context.Context, actor, dealer, id string, e audit.Event) (PhotoState, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return PhotoState{}, err
	}
	m.events = append(m.events, e)
	return m.state, nil
}
func (m *photoMemory) GetPhoto(_ context.Context, actor, dealer, id, photo string, e audit.Event) (ports.ProcessedPhoto, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return ports.ProcessedPhoto{}, err
	}
	for _, p := range m.state.Photos {
		if p.ID == photo {
			m.events = append(m.events, e)
			return m.image, nil
		}
	}
	return ports.ProcessedPhoto{}, ports.ErrNotFound
}
func (m *photoMemory) StorePhoto(_ context.Context, actor, dealer, id string, u PhotoUpload, e audit.Event) (PhotoUploadResult, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return PhotoUploadResult{}, err
	}
	intentKey := actor + "/" + dealer + "/" + id + "/" + u.Key
	digest := sha256.Sum256(u.Image.JPEG)
	if intent, ok := m.intents[intentKey]; ok {
		if intent.revision != u.ExpectedRevision || intent.digest != digest {
			return PhotoUploadResult{}, ports.ErrIdempotencyConflict
		}
		e.Action = audit.ResourceViewed
		m.events = append(m.events, e)
		return PhotoUploadResult{State: m.state, PhotoID: intent.id, Replay: true}, nil
	}
	c, err := domain.RestorePhotos(id, dealer, m.state.Photos)
	if err != nil {
		return PhotoUploadResult{}, err
	}
	r, p, _, err := m.state.Record.AttachPhoto(c, domain.PhotoEvidence{ID: u.ID, RecordID: id, DealerID: dealer, Ready: true}, u.ExpectedRevision, actor, e.OccurredAt)
	if err != nil {
		return PhotoUploadResult{}, err
	}
	m.state = PhotoState{Record: r, Photos: p.Evidence()}
	m.image = u.Image
	if m.intents == nil {
		m.intents = map[string]photoIntent{}
	}
	m.intents[intentKey] = photoIntent{id: u.ID, revision: u.ExpectedRevision, digest: digest}
	m.events = append(m.events, e)
	return PhotoUploadResult{State: m.state, PhotoID: u.ID}, nil
}
func (m *photoMemory) edit(actor, dealer, id string, e audit.Event, apply func(domain.Record, domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error)) (PhotoState, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return PhotoState{}, err
	}
	c, err := domain.RestorePhotos(id, dealer, m.state.Photos)
	if err != nil {
		return PhotoState{}, err
	}
	r, p, _, err := apply(m.state.Record, c)
	if errors.Is(err, domain.ErrNoChange) {
		e.Action = audit.ResourceViewed
	} else if err != nil {
		return PhotoState{}, err
	} else {
		m.state = PhotoState{Record: r, Photos: p.Evidence()}
	}
	m.events = append(m.events, e)
	return m.state, nil
}
func (m *photoMemory) ReorderPhotos(_ context.Context, a, d, id string, ids []string, v int64, e audit.Event) (PhotoState, error) {
	return m.edit(a, d, id, e, func(r domain.Record, p domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error) {
		return r.ReorderPhotos(p, ids, v, a, e.OccurredAt)
	})
}
func (m *photoMemory) DescribePhoto(_ context.Context, a, d, id, photo, alt string, v int64, e audit.Event) (PhotoState, error) {
	return m.edit(a, d, id, e, func(r domain.Record, p domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error) {
		return r.DescribePhoto(p, photo, alt, v, a, e.OccurredAt)
	})
}
func (m *photoMemory) RemovePhoto(_ context.Context, a, d, id, photo string, v int64, e audit.Event) (PhotoState, error) {
	return m.edit(a, d, id, e, func(r domain.Record, p domain.PhotoCollection) (domain.Record, domain.PhotoCollection, domain.History, error) {
		return r.RemovePhoto(p, photo, v, a, e.OccurredAt)
	})
}

type photoProcessing struct {
	bytes   int
	after   func()
	failure error
}

func (p *photoProcessing) Process(ctx context.Context, r io.Reader) (ports.ProcessedPhoto, error) {
	raw, err := io.ReadAll(r)
	p.bytes += len(raw)
	if err != nil {
		return ports.ProcessedPhoto{}, err
	}
	if p.after != nil {
		p.after()
	}
	if p.failure != nil {
		return ports.ProcessedPhoto{}, p.failure
	}
	return ports.ProcessedPhoto{JPEG: raw, Width: 1, Height: 1, SHA256: "server-digest"}, nil
}
func photoCommandsFixture() (*Commands, *accessFixture, *photoMemory, *photoProcessing) {
	c, f, _ := commandFixture()
	r, _ := domain.NewDraft("piano", "dealer", "PT-1", f.now)
	m := &photoMemory{state: PhotoState{Record: r}}
	p := &photoProcessing{}
	c.dependencies.Photos = m
	c.dependencies.PhotoProcessor = p
	return c, f, m, p
}
func uploadPhoto(c *Commands) (PhotoUploadResult, error) {
	return c.UploadPhoto(context.Background(), "opaque", "dealer", "piano", "photo-upload-0001", 1, strings.NewReader("normalized by processor"))
}

func TestPhotoCommandsUploadReadAndEdit(t *testing.T) {
	c, f, m, p := photoCommandsFixture()
	out, err := uploadPhoto(c)
	if err != nil || out.State.Record.Revision != 2 || len(out.State.Photos) != 1 || p.bytes == 0 {
		t.Fatalf("upload: %+v %v", out, err)
	}
	if len(m.events) != 2 || m.events[0].Action != audit.ResourceViewed || m.events[1].Action != audit.ResourceUpdated {
		t.Fatal("upload phases not audited")
	}
	for _, e := range m.events {
		if e.ActorUserID != "actor" || e.OwnerUserID != "owner" || e.TargetID != "piano" || !e.OccurredAt.Equal(f.now) {
			t.Fatalf("audit: %+v", e)
		}
	}
	ctx := context.Background()
	photo := out.PhotoID
	if _, err := c.ListPhotos(ctx, "opaque", "dealer", "piano"); err != nil {
		t.Fatal(err)
	}
	if image, err := c.ReadPhoto(ctx, "opaque", "dealer", "piano", photo); err != nil || len(image.JPEG) == 0 {
		t.Fatalf("bytes: %v", err)
	}
	state, err := c.DescribePhoto(ctx, "opaque", "dealer", "piano", photo, " Keyboard ", 2)
	if err != nil || state.Photos[0].AltText != "Keyboard" || state.Record.Revision != 3 {
		t.Fatalf("alt: %v", err)
	}
	if _, err := c.ReorderPhotos(ctx, "opaque", "dealer", "piano", []string{photo}, 2); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stale order: %v", err)
	}
	if _, err := c.ReorderPhotos(ctx, "opaque", "dealer", "piano", []string{photo}, 3); err != nil {
		t.Fatal(err)
	}
	state, err = c.RemovePhoto(ctx, "opaque", "dealer", "piano", photo, 3)
	if err != nil || len(state.Photos) != 0 || state.Record.Revision != 4 {
		t.Fatalf("remove: %v", err)
	}
}

func TestPhotoUploadStopsBeforeProcessingOnDeniedAccess(t *testing.T) {
	for _, change := range []func(*accessFixture, *photoMemory){
		func(f *accessFixture, m *photoMemory) { f.authFailure = ports.ErrInvalidCredential },
		func(f *accessFixture, m *photoMemory) { f.permissions["manage_inventory"] = false },
		func(f *accessFixture, m *photoMemory) { f.account.Membership.Role = dealer.RoleViewer },
		func(f *accessFixture, m *photoMemory) { f.deniedBudget = true },
		func(f *accessFixture, m *photoMemory) { f.authorityFailure = errors.New("unavailable") },
		func(f *accessFixture, m *photoMemory) { m.unreadable = true },
	} {
		c, f, m, p := photoCommandsFixture()
		change(f, m)
		if out, err := uploadPhoto(c); err == nil || out.PhotoID != "" || p.bytes != 0 || len(m.events) != 0 {
			t.Fatalf("access bypass: %+v %v", out, err)
		}
	}
}
func TestPhotoUploadRechecksAccessAfterProcessing(t *testing.T) {
	for _, change := range []func(*accessFixture, *photoMemory){
		func(f *accessFixture, m *photoMemory) { f.authFailure = ports.ErrInvalidCredential },
		func(f *accessFixture, m *photoMemory) { f.permissions["manage_inventory"] = false },
		func(f *accessFixture, m *photoMemory) { f.account.Membership.Active = false },
		func(f *accessFixture, m *photoMemory) { f.deniedBudget = true },
		func(f *accessFixture, m *photoMemory) { m.unreadable = true },
	} {
		c, f, m, p := photoCommandsFixture()
		p.after = func() { change(f, m) }
		if out, err := uploadPhoto(c); err == nil || out.PhotoID != "" || p.bytes == 0 || len(m.events) != 1 || m.state.Record.Revision != 1 {
			t.Fatalf("postprocess bypass: %+v %v", out, err)
		}
	}
}

func TestPhotoOperationsFailClosedAtEveryAccessBoundary(t *testing.T) {
	operations := map[string]func(*Commands, string) error{
		"list": func(c *Commands, credential string) error {
			_, err := c.ListPhotos(context.Background(), credential, "dealer", "piano")
			return err
		},
		"read": func(c *Commands, credential string) error {
			_, err := c.ReadPhoto(context.Background(), credential, "dealer", "piano", "photo")
			return err
		},
		"order": func(c *Commands, credential string) error {
			_, err := c.ReorderPhotos(context.Background(), credential, "dealer", "piano", []string{"photo"}, 1)
			return err
		},
		"describe": func(c *Commands, credential string) error {
			_, err := c.DescribePhoto(context.Background(), credential, "dealer", "piano", "photo", "Piano", 1)
			return err
		},
		"remove": func(c *Commands, credential string) error {
			_, err := c.RemovePhoto(context.Background(), credential, "dealer", "piano", "photo", 1)
			return err
		},
	}
	for name, invoke := range operations {
		t.Run(name, func(t *testing.T) {
			c, _, m, _ := photoCommandsFixture()
			if err := invoke(c, "provider-token"); !errors.Is(err, ports.ErrInvalidCredential) || len(m.events) != 0 {
				t.Fatalf("provider token: %v", err)
			}
			for _, change := range []func(*accessFixture){
				func(f *accessFixture) { f.permissions = map[string]bool{} },
				func(f *accessFixture) { f.account.UserActive = false },
				func(f *accessFixture) { f.account.Membership.GrantedRevision = 1 },
				func(f *accessFixture) { f.account.Membership.UserID = "other" },
				func(f *accessFixture) { f.deniedBudget = true },
				func(f *accessFixture) { f.authorityFailure = errors.New("authority unavailable") },
			} {
				c, f, m, _ := photoCommandsFixture()
				change(f)
				if err := invoke(c, "opaque"); err == nil || len(m.events) != 0 {
					t.Fatalf("access bypass: %v", err)
				}
			}
			c, f, m, _ := photoCommandsFixture()
			m.unreadable = true
			if err := invoke(c, "opaque"); !errors.Is(err, ports.ErrNotFound) || len(f.events) != 1 || f.events[0].TargetID != "inventory" {
				t.Fatalf("repository denial: %v", err)
			}
			c, f, m, _ = photoCommandsFixture()
			m.unreadable = true
			f.auditFailure = errors.New("audit unavailable")
			if err := invoke(c, "opaque"); !errors.Is(err, f.auditFailure) {
				t.Fatalf("denial audit bypass: %v", err)
			}
			c, _, m, _ = photoCommandsFixture()
			m.failure = errors.New("database unavailable")
			if err := invoke(c, "opaque"); !errors.Is(err, m.failure) || len(m.events) != 0 {
				t.Fatalf("repository failure bypass: %v", err)
			}
			c, _, _, _ = photoCommandsFixture()
			c.dependencies.Photos = nil
			if err := invoke(c, "opaque"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
				t.Fatalf("missing port: %v", err)
			}
		})
	}
}

func TestPhotoUploadFailureCancellationAndInputBoundaries(t *testing.T) {
	for _, change := range []func(*Commands, *photoProcessing){
		func(c *Commands, p *photoProcessing) { c.dependencies.PhotoProcessor = nil },
		func(c *Commands, p *photoProcessing) { c.dependencies.NewID = nil },
	} {
		c, _, m, p := photoCommandsFixture()
		change(c, p)
		if _, err := uploadPhoto(c); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) || len(m.events) != 0 || p.bytes != 0 {
			t.Fatalf("missing composition: %v", err)
		}
	}
	for _, key := range []string{"short", strings.Repeat("x", 129), "white space key 01", "bad\nkey-123456789"} {
		c, _, m, p := photoCommandsFixture()
		if _, err := c.UploadPhoto(context.Background(), "opaque", "dealer", "piano", key, 1, strings.NewReader("source")); !errors.Is(err, ports.ErrInvalidArgument) || len(m.events) != 0 || p.bytes != 0 {
			t.Fatalf("bad key: %v", err)
		}
	}
	c, _, m, p := photoCommandsFixture()
	p.failure = ports.ErrInvalidPhoto
	if _, err := uploadPhoto(c); !errors.Is(err, ports.ErrInvalidPhoto) || m.state.Record.Revision != 1 || len(m.events) != 1 {
		t.Fatalf("processing failure: %v", err)
	}
	c, _, m, p = photoCommandsFixture()
	ctx, cancel := context.WithCancel(context.Background())
	p.after = cancel
	if _, err := c.UploadPhoto(ctx, "opaque", "dealer", "piano", "photo-upload-0001", 1, strings.NewReader("source")); !errors.Is(err, context.Canceled) || m.state.Record.Revision != 1 || len(m.events) != 1 {
		t.Fatalf("cancelled processing committed: %v", err)
	}
	c, _, m, p = photoCommandsFixture()
	m.state.Photos = []domain.PhotoEvidence{{ID: "foreign", RecordID: "other", DealerID: "dealer", Ready: true}}
	if _, err := uploadPhoto(c); !errors.Is(err, errPhotoResult) || p.bytes != 0 {
		t.Fatalf("corrupt repository state: %v", err)
	}
	c, _, m, _ = photoCommandsFixture()
	if _, err := c.ReorderPhotos(context.Background(), "opaque", "dealer", "piano", []string{"photo", "photo"}, 1); !errors.Is(err, ports.ErrInvalidArgument) || len(m.events) != 0 {
		t.Fatalf("duplicate order: %v", err)
	}
	if _, err := c.DescribePhoto(context.Background(), "opaque", "dealer", "piano", "photo", strings.Repeat("界", 241), 1); !errors.Is(err, ports.ErrInvalidArgument) || len(m.events) != 0 {
		t.Fatalf("long alt: %v", err)
	}
}

func TestPhotoUploadRetryAllowsNewerPreflightAndDetachedAsset(t *testing.T) {
	c, _, m, _ := photoCommandsFixture()
	first, err := uploadPhoto(c)
	if err != nil {
		t.Fatal(err)
	}
	retry, err := uploadPhoto(c)
	if err != nil || !retry.Replay || retry.PhotoID != first.PhotoID || retry.State.Record.Revision != 2 || len(retry.State.Photos) != 1 {
		t.Fatalf("newer preflight blocked replay: %+v %v", retry, err)
	}
	if _, err := c.RemovePhoto(context.Background(), "opaque", "dealer", "piano", first.PhotoID, 2); err != nil {
		t.Fatal(err)
	}
	retry, err = uploadPhoto(c)
	if err != nil || !retry.Replay || len(retry.State.Photos) != 0 || retry.State.Record.Revision != 3 || len(m.state.Photos) != 0 {
		t.Fatalf("removed photo reattached: %+v %v", retry, err)
	}
}
