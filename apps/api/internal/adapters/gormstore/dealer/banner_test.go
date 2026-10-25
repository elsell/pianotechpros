package dealerstore

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestBannerAtomicReplacementReplayRemovalAndPrivateReads(t *testing.T) {
	admin := connection(t, false)
	shop, command, key, created := persistentFixture(t, admin)
	runtime := connection(t, true)
	repo := New(runtime)
	ctx := context.Background()
	if _, _, err := repo.Create(ctx, shop, command, key, created); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, command, created)
	event := created
	event.Action = audit.ResourceUpdated
	event.ID += "-banner"
	image := normalizedTestPhoto(t)
	first := app.BannerUpload{ID: string(shop.ID) + "-first", Key: "first-banner-key", ExpectedRevision: 1, Image: image}
	got, err := repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, first, event)
	if err != nil || got.State.Dealer.Revision != 2 || got.BannerID != first.ID {
		t.Fatalf("first upload: %+v %v", got, err)
	}
	second := first
	second.ID = string(shop.ID) + "-second"
	second.Key = "second-banner-key"
	second.ExpectedRevision = 2
	event.ID += "-second"
	got, err = repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, second, event)
	if err != nil || got.State.Dealer.Revision != 3 {
		t.Fatalf("replacement: %+v %v", got, err)
	}
	event.ID += "-replay"
	got, err = repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, first, event)
	if err != nil || !got.Replay || got.BannerID != first.ID || got.State.Banner.ID != second.ID || got.State.Dealer.Revision != 3 {
		t.Fatalf("detached replay: %+v %v", got, err)
	}
	event.ID += "-changed"
	changed := first
	changed.ExpectedRevision = 2
	if _, err = repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, changed, event); !errors.Is(err, ports.ErrIdempotencyConflict) {
		t.Fatalf("changed intent: %v", err)
	}
	event.Action = audit.ResourceViewed
	event.ID += "-read"
	if p, err := repo.ReadBannerImage(ctx, shop.OwnerUserID, shop.ID, first.ID, event); !errors.Is(err, ports.ErrNotFound) || len(p.JPEG) > 0 {
		t.Fatal("replaced bytes readable", err)
	}
	if p, err := repo.ReadBannerImage(ctx, shop.OwnerUserID, shop.ID, second.ID, event); err != nil || p.SHA256 != image.SHA256 {
		t.Fatal("current bytes unavailable", err)
	}
	if p, err := repo.ReadBannerImage(ctx, shop.OwnerUserID, shop.ID, second.ID, event); err == nil || len(p.JPEG) > 0 {
		t.Fatal("audit failure released bytes")
	}
	event.ID += "-foreign"
	event.ActorUserID = "foreign"
	if s, err := repo.ReadBannerState(ctx, "foreign", shop.ID, event); !errors.Is(err, ports.ErrNotFound) || s.Dealer.ID != "" {
		t.Fatal("foreign state readable", err)
	}
	event.ActorUserID = shop.OwnerUserID
	event.Action = audit.ResourceUpdated
	event.ID += "-remove"
	state, err := repo.RemoveBanner(ctx, shop.OwnerUserID, shop.ID, 3, event)
	if err != nil || state.Banner != nil || state.Dealer.Revision != 4 {
		t.Fatal("remove failed", err)
	}
	event.ID += "-old-replay"
	got, err = repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, first, event)
	if err != nil || !got.Replay || got.State.Banner != nil || got.State.Dealer.Revision != 4 {
		t.Fatal("old replay restored removed media", err)
	}
	var assets int64
	if err := admin.Table("dealer_banner_assets").Where("dealer_id=?", shop.ID).Count(&assets).Error; err != nil || assets != 0 {
		t.Fatal("orphaned banner bytes", assets, err)
	}
}
func TestBannerRaceAuditRollbackAndRevocation(t *testing.T) {
	admin := connection(t, false)
	shop, command, key, created := persistentFixture(t, admin)
	runtime := connection(t, true)
	repo := New(runtime)
	ctx := context.Background()
	if _, _, err := repo.Create(ctx, shop, command, key, created); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, command, created)
	image := normalizedTestPhoto(t)
	event := created
	event.Action = audit.ResourceUpdated
	event.ID += "-banner"
	var errorsOut [2]error
	var group sync.WaitGroup
	for i := 0; i < 2; i++ {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			e := event
			e.ID += fmt.Sprint(i)
			_, errorsOut[i] = repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, app.BannerUpload{ID: string(shop.ID) + fmt.Sprint(i), Key: "unique-banner-key" + fmt.Sprint(i), ExpectedRevision: 1, Image: image}, e)
		}(i)
	}
	group.Wait()
	wins := 0
	for _, err := range errorsOut {
		if err == nil {
			wins++
		} else if !errors.Is(err, ports.ErrConflict) {
			t.Fatal(err)
		}
	}
	if wins != 1 {
		t.Fatal("race did not serialize", errorsOut)
	}
	event.Action = audit.ResourceViewed
	event.ID += "-read"
	before, err := repo.ReadBannerState(ctx, shop.OwnerUserID, shop.ID, event)
	if err != nil {
		t.Fatal(err)
	}
	// Reuse the read audit ID: successful row replacement must roll back on audit uniqueness failure.
	event.Action = audit.ResourceUpdated
	if _, err := repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, app.BannerUpload{ID: string(shop.ID) + "rollback", Key: "rollback-banner-key", ExpectedRevision: 2, Image: image}, event); err == nil {
		t.Fatal("audit failure accepted")
	}
	event.Action = audit.ResourceViewed
	event.ID += "-after"
	after, err := repo.ReadBannerState(ctx, shop.OwnerUserID, shop.ID, event)
	if err != nil || after.Dealer.Revision != 2 || *after.Banner != *before.Banner {
		t.Fatal("audit failure changed current banner", err)
	}
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", shop.ID, shop.OwnerUserID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	event.Action = audit.ResourceUpdated
	event.ID += "-revoked"
	if s, err := repo.RemoveBanner(ctx, shop.OwnerUserID, shop.ID, 2, event); !errors.Is(err, ports.ErrNotFound) || s.Dealer.ID != "" {
		t.Fatal("revoked owner removed banner", err)
	}
}

func TestBannerPublicDeliveryTracksCurrentAssetAndVisibility(t *testing.T) {
	admin := connection(t, false)
	shop, command, key, event := persistentFixture(t, admin)
	runtime := connection(t, true)
	repo := New(runtime)
	ctx := context.Background()
	if _, _, err := repo.Create(ctx, shop, command, key, event); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, command, event)
	event.Action = audit.ResourceUpdated
	event.ID += "-banner"
	input := app.BannerUpload{ID: string(shop.ID) + "-asset", Key: "public-banner-key", ExpectedRevision: 1, Image: normalizedTestPhoto(t)}
	if _, err := repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, input, event); err != nil {
		t.Fatal(err)
	}
	assertAbsent := func(slug, id string) {
		t.Helper()
		image, err := repo.ReadPublicBanner(ctx, slug, id)
		if !errors.Is(err, ports.ErrNotFound) || len(image.JPEG) != 0 {
			t.Fatal("inaccessible banner released", err)
		}
	}
	assertAbsent(shop.Slug, input.ID)
	if err := admin.Table("dealer_models").Where("id=?", shop.ID).Update("showroom_published", true).Error; err != nil {
		t.Fatal(err)
	}
	profile, err := repo.ReadPublicProfile(ctx, shop.Slug)
	if err != nil || profile.Banner == nil || profile.Banner.ID != input.ID {
		t.Fatal("current banner absent from public projection", err)
	}
	image, err := repo.ReadPublicBanner(ctx, shop.Slug, input.ID)
	if err != nil || image.SHA256 != input.Image.SHA256 {
		t.Fatal("current public bytes absent", err)
	}
	assertAbsent("missing-shop", input.ID)
	assertAbsent(shop.Slug, "other-asset")
	oldID := input.ID
	input.ID += "-replacement"
	input.Key = "replacement-banner-key"
	input.ExpectedRevision = 2
	event.ID += "-replace"
	if _, err := repo.ReplaceBanner(ctx, shop.OwnerUserID, shop.ID, input, event); err != nil {
		t.Fatal(err)
	}
	assertAbsent(shop.Slug, oldID)
	if err := admin.Table("dealer_models").Where("id=?", shop.ID).Update("showroom_published", false).Error; err != nil {
		t.Fatal(err)
	}
	assertAbsent(shop.Slug, input.ID)
	if err := admin.Table("dealer_models").Where("id=?", shop.ID).Update("showroom_published", true).Error; err != nil {
		t.Fatal(err)
	}
	event.ID += "-remove"
	if _, err := repo.RemoveBanner(ctx, shop.OwnerUserID, shop.ID, 3, event); err != nil {
		t.Fatal(err)
	}
	assertAbsent(shop.Slug, input.ID)
	profile, err = repo.ReadPublicProfile(ctx, shop.Slug)
	if err != nil || profile.Banner != nil {
		t.Fatal("removed banner in public projection", err)
	}
}
