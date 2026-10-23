package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	inventory "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
	"time"
)

func TestInventoryListFiltersPagingAndAuthorization(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("%s-p%d", e.ID, i)
		d, err := inventory.NewDraft(id, string(e.ID), fmt.Sprintf("PT-%d", i), testTime.Add(time.Duration(i)*time.Second))
		if err != nil {
			t.Fatal(err)
		}
		event := a
		event.ID = id + "-create"
		event.TargetType = "inventory"
		event.TargetID = id
		event.OccurredAt = d.CreatedAt
		if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, d, id, event); err != nil {
			t.Fatal(err)
		}
		attrs := d.Attributes
		attrs.Title = "Yamaha"
		attrs.Featured = i == 0
		attrs.PrivateNotes = "secret-search"
		if i == 1 {
			attrs.Title = "100%_\\ original"
		}
		event.ID = id + "-edit"
		event.Action = audit.ResourceUpdated
		if _, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), id, 1, attrs, inventory.Manual, event); err != nil {
			t.Fatal(err)
		}
	}
	// Lifecycle command persistence is a separate slice; admin fixture assigns inactive status.
	if err := admin.Model(&inventoryRecordModel{}).Where("id=?", string(e.ID)+"-p3").Update("status", inventory.Sold).Error; err != nil {
		t.Fatal(err)
	}
	event := a
	event.TargetType = "inventory"
	event.TargetID = string(e.ID)
	event.Action = audit.ResourceListed
	count := 0
	list := func(q inventory.ListQuery) inventory.Page {
		t.Helper()
		count++
		event.ID = fmt.Sprintf("%s-list-%d", e.ID, count)
		p, err := r.ListRecords(ctx, e.OwnerUserID, string(e.ID), q, event)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	q := inventory.ListQuery{Limit: 1, Snapshot: testTime.Add(3 * time.Second)}
	p := list(q)
	if len(p.Records) != 1 || p.Records[0].ID != string(e.ID)+"-p0" || !p.HasMore {
		t.Fatalf("featured first %+v", p)
	}
	last := p.Records[0]
	q.AfterFeatured = last.Featured
	q.AfterCreated = last.CreatedAt
	q.AfterID = last.ID
	p = list(q)
	if len(p.Records) != 1 || p.Records[0].ID != string(e.ID)+"-p2" || !p.HasMore {
		t.Fatalf("second page %+v", p)
	}
	last = p.Records[0]
	q.AfterFeatured = last.Featured
	q.AfterCreated = last.CreatedAt
	q.AfterID = last.ID
	p = list(q)
	if len(p.Records) != 1 || p.Records[0].ID != string(e.ID)+"-p1" || p.HasMore {
		t.Fatalf("last page %+v", p)
	}
	q = inventory.ListQuery{Limit: 100, Snapshot: testTime.Add(10 * time.Second)}
	if p = list(q); len(p.Records) != 4 {
		t.Fatal("default inactive filter", len(p.Records))
	}
	q.IncludeInactive = true
	if p = list(q); len(p.Records) != 5 {
		t.Fatal("include inactive", len(p.Records))
	}
	q.Status = inventory.Sold
	if p = list(q); len(p.Records) != 1 || p.Records[0].Status != inventory.Sold {
		t.Fatal("sold filter")
	}
	q.Status = ""
	q.Search = "  yamaha "
	if p = list(q); len(p.Records) != 4 {
		t.Fatal("case insensitive search", len(p.Records))
	}
	q.Search = "%_\\"
	if p = list(q); len(p.Records) != 1 {
		t.Fatal("literal search", len(p.Records))
	}
	q.Search = "secret-search"
	if p = list(q); len(p.Records) != 0 {
		t.Fatal("private notes searched")
	}
	// A duplicate audit ID aborts delivery of a nonempty page.
	q.Search = ""
	if p, err := r.ListRecords(ctx, e.OwnerUserID, string(e.ID), q, event); err == nil || len(p.Records) != 0 {
		t.Fatal("unaudited list returned", err)
	}
	event.ID = string(e.ID) + "-foreign"
	event.ActorUserID = "outsider"
	if p, err := r.ListRecords(ctx, "outsider", string(e.ID), q, event); !errors.Is(err, ports.ErrNotFound) || len(p.Records) != 0 {
		t.Fatal("cross-user access", err)
	}
	event.ActorUserID = e.OwnerUserID
	event.TargetID = "other"
	if _, err := r.ListRecords(ctx, e.OwnerUserID, "other", q, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("cross-dealer access", err)
	}
	event.TargetID = string(e.ID)
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, e.OwnerUserID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := r.ListRecords(ctx, e.OwnerUserID, string(e.ID), q, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("revoked membership", err)
	}
}

func TestInventoryListRejectsMissingOrNullFeatured(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	d, err := inventory.NewDraft(string(e.ID)+"-piano", string(e.ID), "PT-CORRUPT", testTime)
	if err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID += "-draft"
	event.TargetType = "inventory"
	event.TargetID = d.ID
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, d, "intent", event); err != nil {
		t.Fatal(err)
	}
	var row inventoryRecordModel
	if err := admin.Where("id=?", d.ID).First(&row).Error; err != nil {
		t.Fatal(err)
	}
	var attributes map[string]any
	if err := json.Unmarshal(row.Attributes, &attributes); err != nil {
		t.Fatal(err)
	}
	for _, nullValue := range []bool{false, true} {
		delete(attributes, "Featured")
		if nullValue {
			attributes["Featured"] = nil
		}
		encoded, err := json.Marshal(attributes)
		if err != nil {
			t.Fatal(err)
		}
		if err := admin.Model(&inventoryRecordModel{}).Where("id=?", d.ID).Update("attributes", json.RawMessage(encoded)).Error; err != nil {
			t.Fatal(err)
		}
		event.ID += "-list"
		event.TargetID = string(e.ID)
		event.Action = audit.ResourceListed
		page, err := r.ListRecords(ctx, e.OwnerUserID, string(e.ID), inventory.ListQuery{Limit: 1, Snapshot: testTime}, event)
		if err == nil || len(page.Records) != 0 {
			t.Fatal("malformed featured flag returned a page")
		}
	}
}
