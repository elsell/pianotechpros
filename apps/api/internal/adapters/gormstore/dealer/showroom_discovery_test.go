package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/showroom"
	"gorm.io/gorm"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestPublicDiscoveryUsesSnapshotsAndCurrentVisibility(t *testing.T) {
	r, _, profile, state, event := publicFixture(t)
	_, _, other, _, _ := publicFixture(t)
	ctx := context.Background()
	directory, err := r.ReadPublicDirectory(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, shop := range directory {
		if shop.ID == string(profile.ID) {
			found = shop.Slug == profile.Slug && shop.Name == profile.Name
		}
	}
	if !found {
		t.Fatal("published showroom absent")
	}
	attrs := state.Record.Attributes
	attrs.Title = "PRIVATE-DISCOVERY-TITLE"
	record, err := r.ReviseRecord(ctx, event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, attrs, inventory.Manual, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-sold"
	sold, err := r.TransitionRecord(ctx, event.ActorUserID, record.DealerID, record.ID, record.Revision, inventory.Sold, &inventory.Money{MinorUnits: 1, Currency: "USD"}, "", event)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := r.ReadPublicCatalog(ctx, profile.Slug)
	if err != nil || catalog.Shop.ID != string(profile.ID) || len(catalog.Pianos) != 1 || catalog.Pianos[0].ID != record.ID || catalog.Pianos[0].Title != "Published piano" {
		t.Fatalf("catalog: %#v %v", catalog, err)
	}
	foreign, err := r.ReadPublicCatalog(ctx, other.Slug)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range foreign.Pianos {
		if p.ID == record.ID {
			t.Fatal("cross-showroom record leaked")
		}
	}
	event.ID += "-hide"
	if _, err := r.UnpublishRecord(ctx, event.ActorUserID, record.DealerID, record.ID, sold.Record.Revision, event); err != nil {
		t.Fatal(err)
	}
	catalog, err = r.ReadPublicCatalog(ctx, profile.Slug)
	if err != nil || len(catalog.Pianos) != 0 {
		t.Fatal("unpublished piano retained", err)
	}
	profile.ShowroomPublished = false
	event.ID += "-shop"
	event.TargetType = "dealer"
	event.TargetID = string(profile.ID)
	if err := r.Update(ctx, event.ActorUserID, profile, event); err != nil {
		t.Fatal(err)
	}
	directory, err = r.ReadPublicDirectory(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, shop := range directory {
		if shop.ID == string(profile.ID) {
			t.Fatal("hidden shop enumerated")
		}
	}
	if value, err := r.ReadPublicCatalog(ctx, profile.Slug); !errors.Is(err, ports.ErrNotFound) || value.Shop.ID != "" {
		t.Fatal("hidden catalog exposed", err)
	}
	if value, err := r.ReadPublicCatalog(ctx, "missing"); !errors.Is(err, ports.ErrNotFound) || value.Shop.ID != "" {
		t.Fatal("missing catalog exposed", err)
	}
}

func TestPublicDiscoveryWaitsBehindUnpublish(t *testing.T) {
	for _, target := range []string{"showroom", "piano", "directory"} {
		t.Run(target, func(t *testing.T) {
			r, admin, profile, state, event := publicFixture(t)
			tx := r.DB.Begin()
			if tx.Error != nil {
				t.Fatal(tx.Error)
			}
			defer tx.Rollback()
			if target != "piano" {
				profile.ShowroomPublished = false
				event.TargetType = "dealer"
				event.TargetID = string(profile.ID)
				if err := New(tx).Update(context.Background(), event.ActorUserID, profile, event); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := New(tx).UnpublishRecord(context.Background(), event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, event); err != nil {
					t.Fatal(err)
				}
			}
			reader := connection(t, true)
			pool, err := reader.DB()
			if err != nil {
				t.Fatal(err)
			}
			pool.SetMaxOpenConns(1)
			var pid int
			if err := reader.Table("pg_stat_activity").Select("pid").Where("pid=pg_backend_pid()").Scan(&pid).Error; err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result := make(chan error, 1)
			go func() {
				if target == "directory" {
					shops, err := New(reader).ReadPublicDirectory(ctx)
					for _, shop := range shops {
						if shop.ID == string(profile.ID) {
							result <- errors.New("unpublished shop enumerated")
							return
						}
					}
					result <- err
					return
				}
				page, err := New(reader).ReadPublicCatalog(ctx, profile.Slug)
				if len(page.Pianos) != 0 {
					result <- errors.New("unpublished piano leaked")
					return
				}
				if target == "showroom" && page.Shop.ID != "" {
					result <- errors.New("unpublished showroom leaked")
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
					t.Fatalf("read did not wait: %v", err)
				case <-ctx.Done():
					t.Fatal("read did not acquire visibility lock")
				default:
				}
				time.Sleep(10 * time.Millisecond)
			}
			if err := tx.Commit().Error; err != nil {
				t.Fatal(err)
			}
			err = <-result
			if target == "showroom" {
				if !errors.Is(err, ports.ErrNotFound) {
					t.Fatal(err)
				}
			} else if err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestPublicDiscoveryRejectsCorruptionAndDependencyFailure(t *testing.T) {
	r, admin, profile, state, event := publicFixture(t)
	const callback = "test:invalid-discovery-snapshot"
	if err := r.DB.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		row, ok := tx.Statement.Dest.(*publicationSnapshotModel)
		if !ok {
			return
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(row.Snapshot, &fields); err != nil {
			tx.AddError(err)
			return
		}
		fields["UnexpectedPrivateField"] = json.RawMessage(`"PRIVATE"`)
		body, err := json.Marshal(fields)
		if err != nil {
			tx.AddError(err)
			return
		}
		row.Snapshot = body
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { r.DB.Callback().Create().Remove(callback) })
	if _, err := r.PublishRecord(context.Background(), event.ActorUserID, state.Record.DealerID, state.Record.ID, state.Record.Revision, event); err != nil {
		t.Fatal(err)
	}
	if value, err := r.ReadPublicCatalog(context.Background(), profile.Slug); err == nil || value.Shop.ID != "" || len(value.Pianos) != 0 {
		t.Fatal("corrupt snapshot leaked")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if value, err := r.ReadPublicDirectory(ctx); err == nil || len(value) != 0 {
		t.Fatal("failed directory leaked")
	}
	if value, err := r.ReadPublicCatalog(ctx, profile.Slug); err == nil || value.Shop.ID != "" {
		t.Fatal("failed catalog leaked")
	}
	if err := admin.Model(&model{}).Where("id=?", profile.ID).Update("email", "malformed").Error; err != nil {
		t.Fatal(err)
	}
	if value, err := r.ReadPublicDirectory(context.Background()); err == nil || len(value) != 0 {
		t.Fatal("corrupt directory leaked")
	}
}

func TestPublicDiscoveryDirectoryOverflowFailsInsteadOfTruncating(t *testing.T) {
	_, admin, profile, _, _ := publicFixture(t)
	tx := admin.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	rows := make([]model, app.DiscoveryLimit+1)
	for i := range rows {
		rows[i] = *fromEntity(profile)
		rows[i].ID = fmt.Sprintf("discovery-capacity-%d-%s", i, profile.ID)
		rows[i].Slug = rows[i].ID
	}
	if err := tx.CreateInBatches(&rows, 500).Error; err != nil {
		t.Fatal(err)
	}
	if value, err := New(tx).ReadPublicDirectory(context.Background()); err == nil || len(value) != 0 {
		t.Fatal("directory capacity silently truncated")
	}
}
