package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

func History(event domain.History) dto.InventoryHistoryEntry {
	out := dto.InventoryHistoryEntry{Revision: event.Revision, ActorID: event.ActorID, Kind: event.Kind, Source: string(event.Source), Fields: append([]string{}, event.Fields...), OccurredAt: event.At, From: string(event.From), To: string(event.To), Reason: event.Reason}
	if event.FieldSources != nil {
		out.FieldSources = make(map[string]string, len(event.FieldSources))
		for field, source := range event.FieldSources {
			out.FieldSources[field] = string(source)
		}
	}
	if event.SalePrice != nil {
		out.SalePrice = &dto.Money{MinorUnits: event.SalePrice.MinorUnits, Currency: event.SalePrice.Currency}
	}
	return out
}
