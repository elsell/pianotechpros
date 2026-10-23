package dealerstore

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	inventory "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"reflect"
	"testing"
)

func TestInventoryDraftAtomicHistoryIdempotencyAndScope(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	draft, err := inventory.NewDraft(string(e.ID)+"-piano", string(e.ID), "PT-1", testTime)
	if err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID += "-inventory"
	event.TargetType = "inventory"
	event.TargetID = draft.ID
	created, replay, err := r.CreateDraft(ctx, e.OwnerUserID, draft, "intent", event)
	if err != nil || replay || created.ID != draft.ID {
		t.Fatalf("create: %+v %v %v", created, replay, err)
	}
	var histories int64
	if err := admin.Table("inventory_history").Where("record_id=?", draft.ID).Count(&histories).Error; err != nil || histories != 1 {
		t.Fatal("missing history")
	}
	alternative := draft
	alternative.ID += "-retry"
	alternative.StockNumber = "PT-2"
	event.ID += "-retry"
	event.TargetID = alternative.ID
	replayed, replay, err := r.CreateDraft(ctx, e.OwnerUserID, alternative, "intent", event)
	if err != nil || !replay || replayed.ID != draft.ID {
		t.Fatalf("replay: %+v %v %v", replayed, replay, err)
	}
	event.ID += "-read"
	event.TargetID = draft.ID
	event.Action = audit.ResourceViewed
	if _, err := r.GetRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, event); err != nil {
		t.Fatal(err)
	}
	event.ID += "-denied"
	event.ActorUserID = "outsider"
	if _, err := r.GetRecord(ctx, "outsider", string(e.ID), draft.ID, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-user read: %v", err)
	}
	event.ActorUserID = e.OwnerUserID
	if _, err := r.GetRecord(ctx, e.OwnerUserID, "other-dealer", draft.ID, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-dealer read: %v", err)
	}
	// Reusing an audit ID forces rollback of record, history and reservation.
	failed := draft
	failed.ID += "-failed"
	failed.StockNumber = "PT-FAIL"
	failedAudit := a
	failedAudit.TargetType = "inventory"
	failedAudit.TargetID = failed.ID
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, failed, "failed-intent", failedAudit); err == nil {
		t.Fatal("unaudited creation succeeded")
	}
	var records int64
	if err := admin.Table("inventory_records").Where("id=?", failed.ID).Count(&records).Error; err != nil || records != 0 {
		t.Fatal("failed creation leaked record")
	}
	failedAudit.ID += "-fixed"
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, failed, "failed-intent", failedAudit); err != nil {
		t.Fatalf("reservation not rolled back: %v", err)
	}
	if err := runtime.Table("inventory_history").Where("record_id=?", draft.ID).Update("kind", "attributes").Error; err == nil {
		t.Fatal("runtime can rewrite history")
	}
	if err := runtime.Where("id=?", draft.ID).Delete(&inventoryRecordModel{}).Error; err == nil {
		t.Fatal("runtime can delete inventory")
	}
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, e.OwnerUserID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	event.ID += "-revoked"
	if _, err := r.GetRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("revoked reader allowed")
	}
}

func TestInventoryDraftConcurrentRetryAndAuditFailure(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	type outcome struct {
		record inventory.Record
		replay bool
		err    error
	}
	results := make(chan outcome, 2)
	for _, suffix := range []string{"one", "two"} {
		go func(suffix string) {
			draft, err := inventory.NewDraft(string(e.ID)+suffix, string(e.ID), "ST-"+suffix, testTime)
			if err != nil {
				results <- outcome{err: err}
				return
			}
			event := a
			event.ID += "-" + suffix
			event.TargetType = "inventory"
			event.TargetID = draft.ID
			record, replay, err := r.CreateDraft(ctx, e.OwnerUserID, draft, "concurrent", event)
			results <- outcome{record, replay, err}
		}(suffix)
	}
	first, second := <-results, <-results
	if first.err != nil || second.err != nil || first.record.ID != second.record.ID || first.replay == second.replay {
		t.Fatalf("retry diverged: %+v %+v", first, second)
	}
	read := a
	read.TargetType = "inventory"
	read.TargetID = first.record.ID
	read.Action = audit.ResourceViewed
	if got, err := r.GetRecord(ctx, e.OwnerUserID, string(e.ID), first.record.ID, read); err == nil || got.ID != "" {
		t.Fatalf("audit failure exposed record: %+v %v", got, err)
	}
	read.ID += "-valid-read"
	if _, err := r.GetRecord(ctx, e.OwnerUserID, string(e.ID), first.record.ID, read); err != nil {
		t.Fatal(err)
	}
	invalid := first.record
	invalid.Title = "facts are not an empty draft"
	read.Action = audit.ResourceCreated
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, invalid, "invalid", read); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("nonempty initial draft: %v", err)
	}
	duplicate := first.record
	duplicate.ID += "-duplicate"
	read.TargetID = duplicate.ID
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, duplicate, "duplicate-stock", read); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("duplicate stock: %v", err)
	}
	read.TargetID = first.record.ID
	// Confirmed authority must still exist before an idempotent replay.
	if err := admin.Table("dealer_memberships").Where("dealer_id=? AND user_id=?", e.ID, e.OwnerUserID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, first.record, "concurrent", read); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("revoked replay: %v", err)
	}
}

// A controlled database constraint fails only this fixture's history insert,
// after the record and audit inserts, to exercise the complete rollback boundary.
func TestInventoryDraftHistoryFailureRollsBack(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	draft, err := inventory.NewDraft(string(e.ID)+"-history-failure", string(e.ID), "HISTORY", testTime)
	if err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID += "-history"
	event.TargetType = "inventory"
	event.TargetID = draft.ID
	// Fixture IDs are generated internally and contain no SQL metacharacters.
	for _, c := range draft.ID {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			t.Fatal("unsafe fixture identifier")
		}
	}
	constraint := "inventory_history_test_rejection"
	shape := reflect.StructOf([]reflect.StructField{{Name: "RecordID", Type: reflect.TypeOf(""), Tag: reflect.StructTag(`gorm:"column:record_id;check:inventory_history_test_rejection,record_id <> '` + draft.ID + `'"`)}})
	row := reflect.New(shape).Interface()
	migrator := admin.Table("inventory_history").Migrator()
	if err := migrator.CreateConstraint(row, constraint); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := migrator.DropConstraint(row, constraint); err != nil {
			t.Error(err)
		}
	}()
	if got, _, err := r.CreateDraft(ctx, e.OwnerUserID, draft, "history-failure", event); err == nil || got.ID != "" {
		t.Fatalf("history failure returned success: %+v %v", got, err)
	}
	for _, probe := range []struct{ table, column, value string }{{"inventory_records", "id", draft.ID}, {"audit_event_models", "id", event.ID}, {"idempotency_models", "resource_id", draft.ID}} {
		var count int64
		if err := admin.Table(probe.table).Where(probe.column+"=?", probe.value).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("rollback %s count=%d err=%v", probe.table, count, err)
		}
	}
}

func TestInventoryAttributeRevisionAtomicConflictAndScope(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	draft, err := inventory.NewDraft(string(e.ID)+"-edit", string(e.ID), "EDIT", testTime)
	if err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID += "-draft"
	event.TargetType = "inventory"
	event.TargetID = draft.ID
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, draft, "edit", event); err != nil {
		t.Fatal(err)
	}
	attributes := draft.Attributes
	attributes.Title = "Grand piano"
	attributes.PrivateNotes = "private"
	attributes.Featured = true
	event.ID += "-update"
	event.Action = audit.ResourceUpdated
	updated, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 1, attributes, inventory.Manual, event)
	if err != nil || updated.Revision != 2 || updated.Title != attributes.Title || updated.Status != inventory.Draft {
		t.Fatalf("edit: %+v %v", updated, err)
	}
	stale := event
	stale.ID += "-stale"
	if _, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 1, attributes, inventory.Manual, stale); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stale edit: %v", err)
	}
	stale.ActorUserID = "outsider"
	if _, err := r.ReviseRecord(ctx, "outsider", string(e.ID), draft.ID, 1, attributes, inventory.Manual, stale); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-user edit: %v", err)
	}
	stale.ActorUserID = e.OwnerUserID
	if _, err := r.ReviseRecord(ctx, e.OwnerUserID, "other-dealer", draft.ID, 1, attributes, inventory.Manual, stale); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-dealer edit: %v", err)
	}
	noChange := event
	noChange.ID += "-no-change"
	if _, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 2, updated.Attributes, inventory.Manual, noChange); !errors.Is(err, inventory.ErrNoChange) {
		t.Fatalf("no-op: %v", err)
	}
	invalid := updated.Attributes
	invalid.StockNumber = ""
	if _, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 2, invalid, inventory.Manual, noChange); !errors.Is(err, inventory.ErrInvalidFields) {
		t.Fatalf("invalid attributes: %v", err)
	}
	other, err := inventory.NewDraft(draft.ID+"-other", string(e.ID), "OTHER", testTime)
	if err != nil {
		t.Fatal(err)
	}
	create := event
	create.ID += "-other"
	create.Action = audit.ResourceCreated
	create.TargetID = other.ID
	if _, _, err := r.CreateDraft(ctx, e.OwnerUserID, other, "other", create); err != nil {
		t.Fatal(err)
	}
	collision := updated.Attributes
	collision.StockNumber = other.StockNumber
	if _, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 2, collision, inventory.Manual, noChange); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stock conflict: %v", err)
	}
	// Duplicate audit ID fails after updating the row, which must roll back.
	attributes.Title = "must roll back"
	if got, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 2, attributes, inventory.Manual, event); err == nil || got.ID != "" {
		t.Fatalf("audit failure: %+v %v", got, err)
	}
	read := event
	read.ID += "-read"
	read.Action = audit.ResourceViewed
	current, err := r.GetRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, read)
	if err != nil || current.Revision != 2 || current.Title != updated.Title {
		t.Fatalf("rollback: %+v %v", current, err)
	}
	var history inventoryHistoryModel
	if err := admin.Where("record_id=? AND revision=2", draft.ID).Take(&history).Error; err != nil || history.Kind != "attributes" || history.Source != "manual" {
		t.Fatalf("history: %+v %v", history, err)
	}
	var count int64
	if err := admin.Table("inventory_history").Where("record_id=?", draft.ID).Count(&count).Error; err != nil || count != 2 {
		t.Fatal("unexpected history")
	}
	// Concurrent CAS updates cannot silently overwrite one another.
	results := make(chan error, 2)
	for _, suffix := range []string{"a", "b"} {
		go func(suffix string) {
			input := current.Attributes
			input.Title = suffix
			ev := event
			ev.ID += "-concurrent-" + suffix
			_, err := r.ReviseRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 2, input, inventory.Voice, ev)
			results <- err
		}(suffix)
	}
	first, second := <-results, <-results
	if !((first == nil && errors.Is(second, ports.ErrConflict)) || (second == nil && errors.Is(first, ports.ErrConflict))) {
		t.Fatalf("CAS outcomes: %v %v", first, second)
	}
}
