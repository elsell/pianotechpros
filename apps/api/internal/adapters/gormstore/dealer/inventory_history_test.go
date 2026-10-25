package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
	"time"
)

func TestInventoryHistoryPagingScopeAndAudit(t *testing.T) {
	admin := connection(t, false)
	shop, command, key, created := persistentFixture(t, admin)
	runtime := connection(t, true)
	repo := New(runtime)
	ctx := context.Background()
	if _, _, err := repo.Create(ctx, shop, command, key, created); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, command, created)
	at := testTime.Add(123456789 * time.Nanosecond)
	record, _ := domain.NewDraft(string(shop.ID)+"-history", string(shop.ID), "PT-H", at)
	event := created
	event.ID += "-draft"
	event.TargetType = "inventory"
	event.TargetID = record.ID
	event.OccurredAt = at
	if _, _, err := repo.CreateDraft(ctx, shop.OwnerUserID, record, "history-intent", event); err != nil {
		t.Fatal(err)
	}
	attributes := record.Attributes
	attributes.Make = "Steinway"
	attributes.Model = "B"
	event.ID += "-edit"
	event.Action = audit.ResourceUpdated
	event.OccurredAt = at.Add(time.Second)
	next, err := repo.ReviseAttributedRecord(ctx, shop.OwnerUserID, string(shop.ID), record.ID, 1, attributes, []string{"make"}, event)
	if err != nil {
		t.Fatal(err)
	}
	event.ID += "-list"
	event.Action = audit.ResourceListed
	page, err := repo.ListHistory(ctx, shop.OwnerUserID, string(shop.ID), record.ID, domain.HistoryQuery{Limit: 1}, event)
	if err != nil || len(page.Entries) != 1 || page.Entries[0].Revision != 2 || page.Entries[0].FieldSources["make"] != domain.Voice || !page.HasMore || page.UpperRevision != 2 {
		t.Fatalf("first page %+v %v", page, err)
	}
	// A concurrent later revision cannot enter this page sequence.
	attributes.Model = "D"
	event.ID += "-next"
	event.Action = audit.ResourceUpdated
	event.OccurredAt = at.Add(2 * time.Second)
	if _, err := repo.ReviseAttributedRecord(ctx, shop.OwnerUserID, string(shop.ID), record.ID, next.Revision, attributes, nil, event); err != nil {
		t.Fatal(err)
	}
	event.ID += "-tail"
	event.Action = audit.ResourceListed
	tail, err := repo.ListHistory(ctx, shop.OwnerUserID, string(shop.ID), record.ID, domain.HistoryQuery{Limit: 1, UpperRevision: page.UpperRevision, BeforeRevision: 2}, event)
	if err != nil || len(tail.Entries) != 1 || tail.Entries[0].Kind != "created" || tail.HasMore {
		t.Fatalf("tail %+v %v", tail, err)
	}
	// Duplicate audit ID fails atomically, never returns the selected history.
	if got, err := repo.ListHistory(ctx, shop.OwnerUserID, string(shop.ID), record.ID, domain.HistoryQuery{Limit: 20}, event); err == nil || len(got.Entries) != 0 {
		t.Fatal("unaudited page returned", err)
	}
	for _, tc := range []struct{ actor, dealer, id string }{{"foreign", string(shop.ID), record.ID}, {shop.OwnerUserID, "other-dealer", record.ID}, {shop.OwnerUserID, string(shop.ID), "absent"}} {
		event.ID += "-denied"
		event.TargetID = tc.id
		event.ActorUserID = tc.actor
		if got, err := repo.ListHistory(ctx, tc.actor, tc.dealer, tc.id, domain.HistoryQuery{Limit: 20}, event); err == nil || len(got.Entries) != 0 {
			t.Fatal("cross-scope page", err)
		}
	}
	event.ActorUserID = shop.OwnerUserID
	event.ID += "-future"
	event.TargetID = record.ID
	if _, err := repo.ListHistory(ctx, shop.OwnerUserID, string(shop.ID), record.ID, domain.HistoryQuery{Limit: 20, UpperRevision: 99}, event); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal("future upper revision accepted", err)
	}
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", shop.ID, shop.OwnerUserID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	event.ID += "-revoked"
	if got, err := repo.ListHistory(ctx, shop.OwnerUserID, string(shop.ID), record.ID, domain.HistoryQuery{Limit: 20}, event); !errors.Is(err, ports.ErrNotFound) || len(got.Entries) != 0 {
		t.Fatal("revoked membership read history", err)
	}
}

func TestInventoryHistoryProjectionRejectsCorruptStorage(t *testing.T) {
	at := testTime.Add(123456789 * time.Nanosecond)
	before, _ := domain.NewDraft("piano", "dealer", "PT-H", at)
	attrs := before.Attributes
	attrs.Make = "Steinway"
	after, event, err := before.ReviseAttributed(attrs, 1, "actor", []string{"make"}, at.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	encode := func(value any) json.RawMessage {
		raw, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	prior := inventoryHistoryModel{RecordID: before.ID, DealerID: before.DealerID, Revision: 1, Kind: "created", Snapshot: encode(before), CreatedAt: before.UpdatedAt.Truncate(time.Microsecond)}
	row := inventoryHistoryModel{RecordID: after.ID, DealerID: after.DealerID, Revision: 2, ActorUserID: "actor", Source: "voice", Kind: "attributes", Snapshot: encode(after), FieldSources: encode(event.FieldSources), CreatedAt: after.UpdatedAt.Truncate(time.Microsecond)}
	if got, err := historyProjection(row, &prior); err != nil || got.FieldSources["make"] != domain.Voice {
		t.Fatal("valid storage rejected", got, err)
	}

	for _, variant := range []string{"missing", "null", "case"} {
		var object map[string]json.RawMessage
		if json.Unmarshal(row.Snapshot, &object) != nil {
			t.Fatal("fixture")
		}
		switch variant {
		case "missing":
			delete(object, "Featured")
		case "null":
			object["Featured"] = json.RawMessage(`null`)
		case "case":
			object["featured"] = object["Featured"]
			delete(object, "Featured")
		}
		malformed := row
		malformed.Snapshot = encode(object)
		if _, err := historyProjection(malformed, &prior); err == nil {
			t.Fatalf("%s scalar defaulted silently", variant)
		}
	}
	for _, change := range []func(*inventoryHistoryModel){
		func(r *inventoryHistoryModel) { r.DealerID = "other" },
		func(r *inventoryHistoryModel) { r.Snapshot = json.RawMessage(`null`) },
		func(r *inventoryHistoryModel) { r.FieldSources = json.RawMessage(`{"status":"voice"}`) },
		func(r *inventoryHistoryModel) { r.CreatedAt = r.CreatedAt.Add(time.Microsecond) },
		func(r *inventoryHistoryModel) { r.Kind = "publish" },
		func(r *inventoryHistoryModel) { r.Source = "manual" },
	} {
		bad := row
		change(&bad)
		if _, err := historyProjection(bad, &prior); err == nil {
			t.Fatal("corrupt row accepted")
		}
	}
	// The nested lifecycle event is checked against its immutable row, not trusted alone.
	sold, history, err := after.Transition(domain.Sold, &domain.Money{MinorUnits: 12345, Currency: "USD"}, "", 2, "actor", domain.Manual, at.Add(2*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	life := inventoryHistoryModel{RecordID: sold.ID, DealerID: sold.DealerID, Revision: 3, ActorUserID: "actor", Source: "manual", Kind: "lifecycle", CreatedAt: sold.UpdatedAt.Truncate(time.Microsecond), Snapshot: encode(struct {
		Record domain.Record
		Event  domain.History
	}{sold, history})}
	if got, err := historyProjection(life, &row); err != nil || got.SalePrice.MinorUnits != 12345 {
		t.Fatal(got, err)
	}
	life.ActorUserID = "different"
	if _, err := historyProjection(life, &row); err == nil {
		t.Fatal("mismatched nested event actor accepted")
	}
}
