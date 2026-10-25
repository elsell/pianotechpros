package inventory

import (
	"maps"
	"reflect"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// RestoreHistory projects private immutable evidence without exposing snapshots.
// Authorization, bounded retrieval and read auditing belong to the calling ports.
func RestoreHistory(event History, before *Record, after Record) (History, error) {
	// Immutable JSON snapshots may predate timestamp storage truncation. Compare
	// and present the documented durable precision without mutating caller evidence.
	normalize := func(record Record) Record {
		record.CreatedAt = record.CreatedAt.UTC().Truncate(time.Microsecond)
		record.UpdatedAt = record.UpdatedAt.UTC().Truncate(time.Microsecond)
		return record
	}
	after = normalize(after)
	if before != nil {
		copy := normalize(*before)
		before = &copy
	}
	event.At = event.At.UTC().Truncate(time.Microsecond)
	invalid := func() (History, error) { return History{}, ErrInvalidFields }
	identity := func(value string) bool {
		return value != "" && len(value) <= 128 && strings.TrimSpace(value) == value && utf8.ValidString(value) && strings.IndexFunc(value, unicode.IsControl) < 0
	}
	validRecord := func(r Record) bool {
		a, err := ValidateAttributes(r.Attributes)
		return err == nil && reflect.DeepEqual(a, r.Attributes) && identity(r.ID) && identity(r.DealerID) && r.StockNumber != "" && r.Revision >= 1 && r.Revision <= 9007199254740991 && validStatus(r.Status) && !r.CreatedAt.IsZero() && !r.UpdatedAt.Before(r.CreatedAt)
	}
	if !validRecord(after) || !identity(event.ActorID) || event.RecordID != after.ID || event.DealerID != after.DealerID || event.Revision != after.Revision || !event.At.Equal(after.UpdatedAt) {
		return invalid()
	}
	if event.Source != Manual && event.Source != Voice && event.Source != Mixed {
		return invalid()
	}
	if event.Kind == "created" {
		expected, err := NewDraft(after.ID, after.DealerID, after.StockNumber, after.CreatedAt)
		if err != nil || !reflect.DeepEqual(expected, after) || before != nil || event.Source != Manual || len(event.Fields) != 0 || event.FieldSources != nil || event.From != "" || event.To != "" || event.SalePrice != nil || event.Reason != "" {
			return invalid()
		}
		event.Fields = []string{}
		return event, nil
	}
	if before == nil || !validRecord(*before) || before.ID != after.ID || before.DealerID != after.DealerID || before.Revision+1 != after.Revision || !before.CreatedAt.Equal(after.CreatedAt) || after.UpdatedAt.Before(before.UpdatedAt) {
		return invalid()
	}
	var fields []string
	switch event.Kind {
	case "attributes":
		if before.Status != after.Status || event.From != "" || event.To != "" || event.Reason != "" || event.SalePrice != nil {
			return invalid()
		}
		fields = changedFields(before.Attributes, after.Attributes)
		if len(fields) == 0 {
			return invalid()
		}
		if event.FieldSources != nil {
			if len(event.FieldSources) != len(fields) {
				return invalid()
			}
			voice := 0
			for _, field := range fields {
				source := event.FieldSources[field]
				if source != Manual && source != Voice {
					return invalid()
				}
				if source == Voice {
					voice++
				}
			}
			source := Manual
			if voice == len(fields) {
				source = Voice
			} else if voice > 0 {
				source = Mixed
			}
			if event.Source != source {
				return invalid()
			}
		} else if event.Source == Mixed {
			return invalid()
		}
	case "lifecycle":
		next, expected, err := before.Transition(event.To, event.SalePrice, event.Reason, before.Revision, event.ActorID, Manual, event.At)
		if err != nil || !reflect.DeepEqual(next, after) || !reflect.DeepEqual(expected, event) {
			return invalid()
		}
		fields = expected.Fields
	case "photos", "publish", "unpublish":
		if event.Source != Manual || event.FieldSources != nil || event.Reason != "" || event.SalePrice != nil || !reflect.DeepEqual(before.Attributes, after.Attributes) {
			return invalid()
		}
		if event.Kind == "publish" {
			target := before.Status
			if target == Draft {
				target = Available
			}
			if target != Available && target != Reserved && target != Sold {
				return invalid()
			}
			if after.Status != target || event.From != before.Status || event.To != target {
				return invalid()
			}
			fields = []string{"publication"}
			if before.Status != target {
				fields = append(fields, "status")
			}
		} else {
			if before.Status != after.Status || event.From != "" || event.To != "" {
				return invalid()
			}
			fields = []string{"publication"}
			if event.Kind == "photos" {
				fields = []string{"photos"}
			}
		}
	default:
		return invalid()
	}
	if event.Fields != nil && !slices.Equal(event.Fields, fields) {
		return invalid()
	}
	event.Fields = slices.Clone(fields)
	event.FieldSources = maps.Clone(event.FieldSources)
	if event.SalePrice != nil {
		price := *event.SalePrice
		event.SalePrice = &price
	}
	return event, nil
}
