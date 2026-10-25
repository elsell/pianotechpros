package dealerstore

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	inventory "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
)

func TestInventoryAttributedHistoryAtomicScopeAndSources(t *testing.T) {
	admin := connection(t, false)
	e, c, k, a := persistentFixture(t, admin)
	runtime := connection(t, true)
	r := New(runtime)
	ctx := context.Background()
	if _, _, err := r.Create(ctx, e, c, k, a); err != nil {
		t.Fatal(err)
	}
	completeGrant(t, runtime, c, a)
	draft, err := inventory.NewDraft(string(e.ID)+"-provenance", string(e.ID), "PT-V", testTime)
	if err != nil {
		t.Fatal(err)
	}
	event := a
	event.ID += "-inventory"
	event.TargetType = "inventory"
	event.TargetID = draft.ID
	if _, _, err = r.CreateDraft(ctx, e.OwnerUserID, draft, "intent-voice", event); err != nil {
		t.Fatal(err)
	}
	attributes := draft.Attributes
	attributes.Make = "Steinway"
	attributes.PrivateNotes = "Manual"
	event.ID += "-edit"
	event.Action = audit.ResourceUpdated
	next, err := r.ReviseAttributedRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 1, attributes, []string{"make"}, event)
	if err != nil {
		t.Fatal(err)
	}
	var history struct {
		Source       string
		FieldSources json.RawMessage
	}
	if err = admin.Table("inventory_history").Select("source,field_sources").Where("record_id=? AND revision=2", draft.ID).Take(&history).Error; err != nil {
		t.Fatal(err)
	}
	var sources map[string]string
	if err = json.Unmarshal(history.FieldSources, &sources); err != nil {
		t.Fatal(err)
	}
	if history.Source != "mixed" || len(sources) != 2 || sources["make"] != "voice" || sources["private_notes"] != "manual" {
		t.Fatalf("wrong history: %+v %v", history, sources)
	}
	attributes.Model = "Model B"
	// Exercise the database guard independently of domain validation. Each direct
	// insert runs in a rolled-back transaction with a matching audit and record.
	for _, tc := range []struct {
		name, source, kind, fields string
		reject                     bool
	}{
		{"valid", "voice", "attributes", `{"model":"voice"}`, false},
		{"missing", "manual", "attributes", `{}`, true},
		{"null", "manual", "attributes", `null`, true},
		{"array", "manual", "attributes", `[]`, true},
		{"extra", "mixed", "attributes", `{"model":"voice","status":"manual"}`, true},
		{"unchanged", "mixed", "attributes", `{"model":"voice","make":"manual"}`, true},
		{"invalid", "voice", "attributes", `{"model":"model_verified"}`, true},
		{"number", "voice", "attributes", `{"model":1}`, true},
		{"aggregate", "manual", "attributes", `{"model":"voice"}`, true},
		{"lifecycle", "mixed", "lifecycle", `{"model":"voice"}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tx := admin.Begin()
			defer tx.Rollback()
			updated := next
			updated.Revision = 3
			updated.Attributes = attributes
			raw, err := json.Marshal(attributes)
			if err != nil {
				t.Fatal(err)
			}
			if err = tx.Model(&inventoryRecordModel{}).Where("id=?", draft.ID).Updates(map[string]any{"revision": 3, "attributes": json.RawMessage(raw)}).Error; err != nil {
				t.Fatal(err)
			}
			auditEvent := event
			auditEvent.ID += "-guard-" + tc.name
			if err = tx.Create(fromAudit(auditEvent)).Error; err != nil {
				t.Fatal(err)
			}
			snapshot, err := json.Marshal(updated)
			if err != nil {
				t.Fatal(err)
			}
			row := inventoryHistoryModel{RecordID: draft.ID, DealerID: string(e.ID), Revision: 3, ActorUserID: e.OwnerUserID, Source: tc.source, Kind: tc.kind, Snapshot: snapshot, FieldSources: json.RawMessage(tc.fields), AuditID: auditEvent.ID, CreatedAt: auditEvent.OccurredAt}
			err = tx.Create(&row).Error
			if (err != nil) != tc.reject {
				t.Fatalf("guard reject=%v: %v", tc.reject, err)
			}
		})
	}

	if _, err = r.ReviseAttributedRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 2, attributes, []string{"model"}, event); err == nil {
		t.Fatal("duplicate audit accepted")
	}
	var stored inventoryRecordModel
	if err = admin.Where("id=?", draft.ID).Take(&stored).Error; err != nil || stored.Revision != next.Revision {
		t.Fatal("audit failure committed revision", err)
	}
	event.ID += "-invalid"
	if _, err = r.ReviseAttributedRecord(ctx, e.OwnerUserID, string(e.ID), draft.ID, 2, attributes, []string{"make"}, event); err == nil {
		t.Fatal("unchanged field attributed")
	}
	event.ID += "-scope"
	event.ActorUserID = "outsider"
	if _, err = r.ReviseAttributedRecord(ctx, "outsider", string(e.ID), draft.ID, 2, attributes, []string{"model"}, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-user edit: %v", err)
	}
	event.ActorUserID = e.OwnerUserID
	event.ID += "-dealer"
	if _, err = r.ReviseAttributedRecord(ctx, e.OwnerUserID, "other-dealer", draft.ID, 2, attributes, []string{"model"}, event); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("cross-dealer edit: %v", err)
	}
	if err = runtime.Table("inventory_history").Where("record_id=? AND revision=2", draft.ID).Update("field_sources", `{}`).Error; err == nil {
		t.Fatal("runtime can rewrite provenance")
	}
}
