package dealerstore

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestInventoryScanStableScopedAuditedStorage(t *testing.T) {
	admin := connection(t, false)
	shop, command, key, created := persistentFixture(t, admin)
	runtime := connection(t, true)
	repo := New(runtime)
	ctx := context.Background()
	if _, _, err := repo.Create(ctx, shop, command, key, created); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, command, created)
	record, _ := domain.NewDraft(string(shop.ID)+"-scan", string(shop.ID), "PT-S", testTime)
	event := created
	event.ID += "-draft"
	event.TargetType = "inventory"
	event.TargetID = record.ID
	if _, _, err := repo.CreateDraft(ctx, shop.OwnerUserID, record, "scan-intent", event); err != nil {
		t.Fatal(err)
	}
	raw := sha256.Sum256([]byte(record.ID))
	token, _ := domain.ParseScanToken(base64.RawURLEncoding.EncodeToString(raw[:]))
	label, _ := domain.NewScanLabel(string(shop.ID), record.ID, shop.OwnerUserID, token, testTime.Add(time.Second))
	event.ID += "-label"
	event.TargetType = "inventory_scan"
	event.OccurredAt = label.CreatedAt
	var results [2]domain.ScanLabel
	var reuses [2]bool
	var failures [2]error
	var group sync.WaitGroup
	for i := range results {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			attempt := event
			attempt.ID += fmt.Sprint(i)
			results[i], reuses[i], failures[i] = repo.EnsureScanLabel(ctx, shop.OwnerUserID, label, attempt)
		}(i)
	}
	group.Wait()
	if failures[0] != nil || failures[1] != nil || results[0] != label || results[1] != label || reuses[0] == reuses[1] {
		t.Fatal("concurrent label creation did not converge", failures)
	}
	var got domain.ScanLabel
	var reused bool
	var err error
	alternate := label
	raw[0] ^= 255
	alternate.Token, _ = domain.ParseScanToken(base64.RawURLEncoding.EncodeToString(raw[:]))
	event.ID += "-again"
	got, reused, err = repo.EnsureScanLabel(ctx, shop.OwnerUserID, alternate, event)
	if err != nil || !reused || got != label {
		t.Fatal("stable label replaced", err)
	}
	var action string
	if err := admin.Table("audit_event_models").Select("action").Where("id=?", event.ID).Scan(&action).Error; err != nil || action != string(audit.ResourceViewed) {
		t.Fatal("replay read audit missing", err)
	}
	event.Action = audit.ResourceViewed
	event.TargetID = string(shop.ID)
	event.ID += "-resolve"
	got, err = repo.ResolveScanLabel(ctx, shop.OwnerUserID, string(shop.ID), token, event)
	if err != nil || got != label {
		t.Fatal("resolve failed", err)
	}
	if got, err := repo.ResolveScanLabel(ctx, shop.OwnerUserID, string(shop.ID), token, event); err == nil || got.Token.Valid() {
		t.Fatal("audit failure released label")
	}
	for _, tc := range []struct{ actor, dealer string }{{"foreign", string(shop.ID)}, {shop.OwnerUserID, "other"}} {
		denied := event
		denied.ID += "-denied"
		denied.ActorUserID = tc.actor
		denied.TargetID = tc.dealer
		if got, err := repo.ResolveScanLabel(ctx, tc.actor, tc.dealer, token, denied); err == nil || got.Token.Valid() {
			t.Fatal("cross scope resolution")
		}
	}
	event.ID += "-missing"
	if got, err := repo.ResolveScanLabel(ctx, shop.OwnerUserID, string(shop.ID), alternate.Token, event); !errors.Is(err, ports.ErrNotFound) || got.Token.Valid() {
		t.Fatal("unknown label disclosed", err)
	}
	for _, sql := range []string{"UPDATE inventory_scan_labels SET token=token WHERE record_id=?", "DELETE FROM inventory_scan_labels WHERE record_id=?", "TRUNCATE inventory_scan_labels"} {
		var err error
		if sql == "TRUNCATE inventory_scan_labels" {
			err = runtime.Exec(sql).Error
		} else {
			err = runtime.Exec(sql, record.ID).Error
		}
		if err == nil {
			t.Fatal("runtime modified retained labels")
		}
	}
	// Failed creation must roll back its audit; database details may contain tokens.
	second, _ := domain.NewDraft(record.ID+"-second", string(shop.ID), "PT-S2", testTime)
	create := created
	create.ID += "-second"
	create.TargetType = "inventory"
	create.TargetID = second.ID
	if _, _, err := repo.CreateDraft(ctx, shop.OwnerUserID, second, "scan-second", create); err != nil {
		t.Fatal(err)
	}
	candidate := label
	candidate.RecordID = second.ID
	collision := event
	collision.ID += "-collision"
	collision.TargetID = second.ID
	collision.Action = audit.ResourceCreated
	if got, _, err := repo.EnsureScanLabel(ctx, shop.OwnerUserID, candidate, collision); err == nil || got.Token.Valid() || strings.Contains(err.Error(), token.Encoded()) {
		t.Fatal("token collision leaked or succeeded")
	}
	var count int64
	if err := admin.Table("audit_event_models").Where("id=?", collision.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("failed creation left audit", err)
	}
	if err := admin.Table("inventory_scan_labels").Where("record_id=?", second.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("failed creation left label", err)
	}
	// Even the migration role cannot rewrite retained associations through ordinary SQL.
	if err := admin.Exec("UPDATE inventory_scan_labels SET token=token WHERE record_id=?", record.ID).Error; err == nil {
		t.Fatal("immutable trigger missing")
	}
	candidate.Token = alternate.Token
	unaudited := inventoryScanLabelModel{RecordID: second.ID, DealerID: string(shop.ID), Token: candidate.Token.Encoded(), CreatedBy: shop.OwnerUserID, CreatedAt: label.CreatedAt, AuditID: "missing"}
	if err := runtime.Create(&unaudited).Error; err == nil {
		t.Fatal("unaudited label inserted")
	}
	viewer := record.ID + "-viewer"
	seedUser(t, admin, viewer)
	if err := admin.Create(&membershipModel{DealerID: string(shop.ID), UserID: viewer, Role: "viewer", Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: testTime, UpdatedAt: testTime}).Error; err != nil {
		t.Fatal(err)
	}
	candidate.CreatedBy = viewer
	collision.ActorUserID = viewer
	collision.ID += "-valid"
	if got, _, err := repo.EnsureScanLabel(ctx, viewer, candidate, collision); err != nil || got != candidate {
		t.Fatal("independent label failed", err)
	}
	view := event
	view.ID += "-viewer"
	view.ActorUserID = viewer
	if got, err := repo.ResolveScanLabel(ctx, viewer, string(shop.ID), token, view); err != nil || got != label {
		t.Fatal("viewer cannot identify piano", err)
	}
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", shop.ID, viewer).Update("granted_revision", 0).Error; err != nil {
		t.Fatal(err)
	}
	collision.ID += "-pending"
	if got, _, err := repo.EnsureScanLabel(ctx, viewer, candidate, collision); !errors.Is(err, ports.ErrNotFound) || got.Token.Valid() {
		t.Fatal("unconfirmed viewer received label", err)
	}
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", shop.ID, shop.OwnerUserID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	event.ID += "-revoked"
	if got, err := repo.ResolveScanLabel(ctx, shop.OwnerUserID, string(shop.ID), token, event); !errors.Is(err, ports.ErrNotFound) || got.Token.Valid() {
		t.Fatal("revoked label read", err)
	}
}
