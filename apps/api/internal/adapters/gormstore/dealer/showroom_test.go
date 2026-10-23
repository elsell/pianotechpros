package dealerstore

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	inventoryapp "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

func publicFixture(t *testing.T) (*Repository, *gorm.DB, dealer.Entity, inventoryapp.PublicationState, audit.Event) {
	t.Helper()
	r, admin, photos, event := photoEditFixture(t)
	ctx := context.Background()
	profile, err := r.GetCreationOwner(ctx, event.ActorUserID, dealer.ID(photos.Record.DealerID))
	if err != nil {
		t.Fatal(err)
	}
	profile.ShowroomPublished = true
	profileEvent := event
	profileEvent.ID += "-showroom"
	profileEvent.TargetType, profileEvent.TargetID = "dealer", string(profile.ID)
	if err := r.Update(ctx, event.ActorUserID, profile, profileEvent); err != nil {
		t.Fatal(err)
	}
	profile.Revision++
	attrs := photos.Record.Attributes
	attrs.Title, attrs.Form, attrs.Condition = "Published piano", inventory.Grand, inventory.Used
	attrs.Serial, attrs.PrivateNotes, attrs.Location = "PRIVATE-SERIAL", "PRIVATE-NOTES", "PRIVATE-LOCATION"
	attrs.AskingPrice = &inventory.Money{MinorUnits: 12000, Currency: "USD"}
	attrs.PriceVisible = false
	record, err := r.ReviseRecord(ctx, event.ActorUserID, photos.Record.DealerID, photos.Record.ID, photos.Record.Revision, attrs, inventory.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-publish"
	state, err := r.PublishRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-next"
	return r, admin, profile, state, event
}

func TestShowroomReadsOnlyPublicSnapshotAndRetainedPhotos(t *testing.T) {
	r, admin, profile, state, event := publicFixture(t)
	ctx := context.Background()
	pub, _ := state.Publication.View()
	cover := pub.Photos[0].ID
	var before int64
	if err := admin.Table("audit_event_models").Count(&before).Error; err != nil {
		t.Fatal(err)
	}
	publicProfile, err := r.ReadPublicProfile(ctx, profile.Slug)
	if err != nil || publicProfile.ID != string(profile.ID) || publicProfile.Name != profile.Name {
		t.Fatalf("profile: %#v %v", publicProfile, err)
	}
	listing, err := r.ReadPublicListing(ctx, profile.Slug, state.Record.ID)
	if err != nil || listing.Piano.Title != "Published piano" || listing.Piano.Price != nil || listing.Profile.ID != string(profile.ID) {
		t.Fatalf("listing: %#v %v", listing, err)
	}
	image, err := r.ReadPublicPhoto(ctx, profile.Slug, state.Record.ID, cover)
	if err != nil || !bytes.Equal(image.JPEG, normalizedTestPhoto(t).JPEG) {
		t.Fatalf("photo: %v", err)
	}
	var after int64
	if err := admin.Table("audit_event_models").Count(&after).Error; err != nil || after != before {
		t.Fatalf("anonymous reads produced audit writes: %d %d %v", before, after, err)
	}
	image.JPEG[0] ^= 0xff
	attrs := state.Record.Attributes
	attrs.Title = "PRIVATE-EDIT"
	record, err := r.ReviseRecord(ctx, event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, attrs, inventory.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-remove"
	removed, err := r.RemovePhoto(ctx, event.ActorUserID, record.DealerID, record.ID, cover, record.Revision, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-sold"
	state, err = r.TransitionRecord(ctx, event.ActorUserID, record.DealerID, record.ID, removed.Record.Revision, inventory.Sold, &inventory.Money{MinorUnits: 10000, Currency: "USD"}, "", event)
	if err != nil {
		t.Fatal(err)
	}
	listing, err = r.ReadPublicListing(ctx, profile.Slug, record.ID)
	if err != nil || listing.Piano.Status != inventory.Sold || listing.Piano.Title != "Published piano" || len(listing.Piano.Photos) != 2 {
		t.Fatalf("sale replaced snapshot: %#v %v", listing, err)
	}
	image, err = r.ReadPublicPhoto(ctx, profile.Slug, record.ID, cover)
	if err != nil || !bytes.Equal(image.JPEG, normalizedTestPhoto(t).JPEG) {
		t.Fatalf("retained photo: %v", err)
	}
	event.ID += "-republish"
	if _, err = r.PublishRecord(ctx, event.ActorUserID, record.DealerID, record.ID, state.Record.Revision, event); err != nil {
		t.Fatal(err)
	}
	if image, err = r.ReadPublicPhoto(ctx, profile.Slug, record.ID, cover); !errors.Is(err, ports.ErrNotFound) || len(image.JPEG) != 0 {
		t.Fatalf("old photo exposed: %v", err)
	}
}

func TestShowroomUnknownForeignAndHiddenReadsReturnNoContent(t *testing.T) {
	r, _, profile, state, event := publicFixture(t)
	_, _, other, otherState, _ := publicFixture(t)
	ctx := context.Background()
	pub, _ := state.Publication.View()
	otherPub, _ := otherState.Publication.View()
	for _, pair := range [][2]string{{"missing", state.Record.ID}, {profile.Slug, "missing"}, {other.Slug, state.Record.ID}, {profile.Slug, otherState.Record.ID}} {
		value, err := r.ReadPublicListing(ctx, pair[0], pair[1])
		if !errors.Is(err, ports.ErrNotFound) || value.Piano.ID != "" || value.Profile.ID != "" {
			t.Fatalf("foreign listing exposed: %v", err)
		}
	}
	for _, id := range []string{"missing", otherPub.Photos[0].ID} {
		value, err := r.ReadPublicPhoto(ctx, profile.Slug, state.Record.ID, id)
		if !errors.Is(err, ports.ErrNotFound) || len(value.JPEG) != 0 {
			t.Fatalf("foreign photo exposed: %v", err)
		}
	}
	if _, err := r.UnpublishRecord(ctx, event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, event); err != nil {
		t.Fatal(err)
	}
	if value, err := r.ReadPublicListing(ctx, profile.Slug, state.Record.ID); !errors.Is(err, ports.ErrNotFound) || value.Piano.ID != "" {
		t.Fatalf("hidden listing exposed: %v", err)
	}
	if value, err := r.ReadPublicPhoto(ctx, profile.Slug, state.Record.ID, pub.Photos[0].ID); !errors.Is(err, ports.ErrNotFound) || len(value.JPEG) != 0 {
		t.Fatalf("hidden photo exposed: %v", err)
	}
	profile.ShowroomPublished = false
	event.ID += "-hide-shop"
	event.TargetType, event.TargetID = "dealer", string(profile.ID)
	if err := r.Update(ctx, event.ActorUserID, profile, event); err != nil {
		t.Fatal(err)
	}
	if value, err := r.ReadPublicProfile(ctx, profile.Slug); !errors.Is(err, ports.ErrNotFound) || value.ID != "" {
		t.Fatalf("hidden profile exposed: %v", err)
	}
}

func TestShowroomMalformedProfileAndCancelledDependencyReturnNoContent(t *testing.T) {
	r, admin, profile, state, _ := publicFixture(t)
	if err := admin.Model(&model{}).Where("id=?", profile.ID).Update("email", "corrupt-address").Error; err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if value, err := r.ReadPublicProfile(ctx, profile.Slug); err == nil || value.ID != "" {
		t.Fatal("corrupt profile exposed")
	}
	if value, err := r.ReadPublicListing(ctx, profile.Slug, state.Record.ID); err == nil || value.Piano.ID != "" {
		t.Fatal("corrupt profile attached to listing")
	}
	ctx, cancel := context.WithCancel(ctx)
	cancel()
	if value, err := r.ReadPublicProfile(ctx, profile.Slug); err == nil || value.ID != "" {
		t.Fatal("cancelled read returned content")
	}
	if value, err := r.ReadPublicListing(ctx, profile.Slug, state.Record.ID); err == nil || value.Piano.ID != "" || value.Profile.ID != "" {
		t.Fatal("cancelled listing returned content")
	}
	pub, _ := state.Publication.View()
	if value, err := r.ReadPublicPhoto(ctx, profile.Slug, state.Record.ID, pub.Photos[0].ID); err == nil || len(value.JPEG) != 0 {
		t.Fatal("cancelled photo returned content")
	}
}

func TestShowroomInvalidIdentifiersFailBeforeStorage(t *testing.T) {
	r := New(nil)
	ctx := context.Background()
	for _, invalid := range []string{"", " padded", "bad\x00id", string([]byte{0xff}), strings.Repeat("a", 129)} {
		if _, err := r.ReadPublicProfile(ctx, invalid); !errors.Is(err, ports.ErrNotFound) {
			t.Fatal(err)
		}
		if _, err := r.ReadPublicListing(ctx, "shop", invalid); !errors.Is(err, ports.ErrNotFound) {
			t.Fatal(err)
		}
		if _, err := r.ReadPublicPhoto(ctx, "shop", "piano", invalid); !errors.Is(err, ports.ErrNotFound) {
			t.Fatal(err)
		}
	}
	if _, err := r.ReadPublicProfile(ctx, strings.Repeat("a", 81)); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("oversized slug accepted")
	}
}

func TestShowroomPhotoWaitsForConcurrentUnpublish(t *testing.T) {
	for _, target := range []string{"showroom", "piano"} {
		t.Run(target, func(t *testing.T) {
			r, admin, profile, state, event := publicFixture(t)
			pub, _ := state.Publication.View()
			tx := r.DB.Begin()
			if tx.Error != nil {
				t.Fatal(tx.Error)
			}
			defer tx.Rollback()
			writer := New(tx)
			if target == "showroom" {
				profile.ShowroomPublished = false
				event.TargetType, event.TargetID = "dealer", string(profile.ID)
				if err := writer.Update(context.Background(), event.ActorUserID, profile, event); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := writer.UnpublishRecord(context.Background(), event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, event); err != nil {
					t.Fatal(err)
				}
			}
			readerDB := connection(t, true)
			pool, err := readerDB.DB()
			if err != nil {
				t.Fatal(err)
			}
			pool.SetMaxOpenConns(1)
			var pid int
			if err := readerDB.Table("pg_stat_activity").Select("pid").Where("pid=pg_backend_pid()").Scan(&pid).Error; err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result := make(chan error, 1)
			go func() {
				photo, err := New(readerDB).ReadPublicPhoto(ctx, profile.Slug, state.Record.ID, pub.Photos[0].ID)
				if len(photo.JPEG) != 0 {
					result <- errors.New("concurrent unpublish leaked photo")
					return
				}
				result <- err
			}()
			for {
				var blocked bool
				if err := admin.Table("pg_stat_activity").Select("count(*) > 0").Where("pid=? AND wait_event_type='Lock'", pid).Scan(&blocked).Error; err != nil {
					t.Fatal(err)
				}
				if blocked {
					break
				}
				select {
				case err := <-result:
					t.Fatalf("read did not wait for visibility transaction: %v", err)
				case <-ctx.Done():
					t.Fatal("read did not acquire visibility lock")
				default:
				}
				time.Sleep(10 * time.Millisecond)
			}
			if err := tx.Commit().Error; err != nil {
				t.Fatal(err)
			}
			if err := <-result; !errors.Is(err, ports.ErrNotFound) {
				t.Fatalf("read ignored committed unpublish: %v", err)
			}
		})
	}
}
