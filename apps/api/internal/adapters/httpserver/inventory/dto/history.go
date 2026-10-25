package dto

import "time"

type InventoryHistoryEntry struct {
	Revision     int64             `json:"revision" minimum:"1" maximum:"9007199254740991"`
	ActorID      string            `json:"actor_id"`
	Kind         string            `json:"kind" enum:"created,attributes,photos,publish,unpublish,lifecycle"`
	Source       string            `json:"source" enum:"manual,voice,mixed"`
	Fields       []string          `json:"fields" nullable:"false"`
	FieldSources map[string]string `json:"field_sources" nullable:"true"`
	OccurredAt   time.Time         `json:"occurred_at"`
	From         string            `json:"from,omitempty"`
	To           string            `json:"to,omitempty"`
	SalePrice    *Money            `json:"sale_price,omitempty"`
	Reason       string            `json:"reason,omitempty"`
}
