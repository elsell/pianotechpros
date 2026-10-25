package dealerstore

import (
	"bytes"
	"context"
	"encoding/json"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"io"
	"reflect"
	"time"
)

var _ application.HistoryRepository = (*Repository)(nil)

func decodeHistoryValue(raw json.RawMessage, value any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return ports.ErrInvalidArgument
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return ports.ErrInvalidArgument
	}
	return nil
}
func historyRecord(row inventoryHistoryModel) (domain.Record, error) {
	raw := row.Snapshot
	switch row.Kind {
	case "created", "attributes":
	case "photos", "publish", "unpublish", "lifecycle":
		var wrapper map[string]json.RawMessage
		if err := json.Unmarshal(raw, &wrapper); err != nil {
			return domain.Record{}, ports.ErrInvalidArgument
		}
		raw = wrapper["Record"]
	default:
		return domain.Record{}, ports.ErrInvalidArgument
	}
	var record domain.Record
	if err := decodeHistoryValue(raw, &record); err != nil {
		return domain.Record{}, err
	}
	// Go decoding alone permits missing/null scalars and case-insensitive keys.
	// Stored records were encoded from this complete typed shape. Compare decoded
	// JSON values (not object ordering) to reject invented defaults and aliases.
	encoded, err := json.Marshal(record)
	if err != nil {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	var storedShape, canonicalShape any
	if json.Unmarshal(raw, &storedShape) != nil || json.Unmarshal(encoded, &canonicalShape) != nil || !reflect.DeepEqual(storedShape, canonicalShape) {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	if record.ID != row.RecordID || record.DealerID != row.DealerID || record.Revision != row.Revision || !record.UpdatedAt.UTC().Truncate(time.Microsecond).Equal(row.CreatedAt.UTC().Truncate(time.Microsecond)) {
		return domain.Record{}, ports.ErrInvalidArgument
	}
	return record, nil
}
func historyProjection(row inventoryHistoryModel, previous *inventoryHistoryModel) (domain.History, error) {
	record, err := historyRecord(row)
	if err != nil {
		return domain.History{}, err
	}
	var before *domain.Record
	if previous != nil {
		value, err := historyRecord(*previous)
		if err != nil {
			return domain.History{}, err
		}
		before = &value
	}
	event := domain.History{RecordID: row.RecordID, DealerID: row.DealerID, ActorID: row.ActorUserID, Revision: row.Revision, Source: domain.Source(row.Source), Kind: row.Kind, At: row.CreatedAt}
	if row.Kind == "publish" || row.Kind == "unpublish" || row.Kind == "lifecycle" {
		var wrapper map[string]json.RawMessage
		if json.Unmarshal(row.Snapshot, &wrapper) != nil {
			return domain.History{}, ports.ErrInvalidArgument
		}
		var stored domain.History
		if decodeHistoryValue(wrapper["Event"], &stored) != nil || stored.RecordID != event.RecordID || stored.DealerID != event.DealerID || stored.ActorID != event.ActorID || stored.Revision != event.Revision || stored.Source != event.Source || stored.Kind != event.Kind || !stored.At.UTC().Truncate(time.Microsecond).Equal(event.At.UTC().Truncate(time.Microsecond)) || stored.FieldSources != nil {
			return domain.History{}, ports.ErrInvalidArgument
		}
		event = stored
	}
	if len(row.FieldSources) > 0 && decodeHistoryValue(row.FieldSources, &event.FieldSources) != nil {
		return domain.History{}, ports.ErrInvalidArgument
	}
	result, err := domain.RestoreHistory(event, before, record)
	if err != nil {
		return domain.History{}, ports.ErrInvalidArgument
	}
	return result, nil
}
func (r *Repository) ListHistory(ctx context.Context, actor, dealerID, id string, q domain.HistoryQuery, event audit.Event) (domain.HistoryPage, error) {
	if q.Validate() != nil || dealerID == "" || !inventoryEventValid(event, actor, id, audit.ResourceListed) {
		return domain.HistoryPage{}, ports.ErrInvalidArgument
	}
	page := domain.HistoryPage{Entries: []domain.History{}}
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.View)
		if err != nil {
			return err
		}
		if event.OwnerUserID != owner {
			return ports.ErrInvalidArgument
		}
		record, err := inventoryRead(tx, dealerID, id)
		if err != nil {
			return err
		}
		upper := q.UpperRevision
		if upper == 0 {
			upper = record.Revision
		}
		if upper > record.Revision {
			return ports.ErrInvalidArgument
		}
		page.UpperRevision = upper
		query := tx.Where("dealer_id=? AND record_id=? AND revision<=?", dealerID, id, upper)
		if q.BeforeRevision > 0 {
			query = query.Where("revision<?", q.BeforeRevision)
		}
		var rows []inventoryHistoryModel
		if err := query.Order("revision DESC").Limit(q.Limit + 1).Find(&rows).Error; err != nil {
			return err
		}
		expected := upper
		if q.BeforeRevision > 0 {
			expected = q.BeforeRevision - 1
		}
		if expected > 0 && (len(rows) == 0 || rows[0].Revision != expected) {
			return ports.ErrInvalidArgument
		}
		count := len(rows)
		page.HasMore = count > q.Limit
		if page.HasMore {
			count = q.Limit
		}
		for i := 0; i < count; i++ {
			var previous *inventoryHistoryModel
			if i+1 < len(rows) {
				previous = &rows[i+1]
			}
			entry, err := historyProjection(rows[i], previous)
			if err != nil {
				return err
			}
			page.Entries = append(page.Entries, entry)
		}
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return domain.HistoryPage{}, inventoryError(err)
	}
	return page, nil
}
