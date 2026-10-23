package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

func Attributes(a dto.Attributes) domain.Attributes {
	return domain.Attributes{
		StockNumber:     a.StockNumber,
		Title:           a.Title,
		Featured:        a.Featured,
		Form:            domain.Form(a.Form),
		PlayerSystem:    a.PlayerSystem,
		Condition:       domain.Condition(a.Condition),
		Make:            a.Make,
		Model:           a.Model,
		Serial:          a.Serial,
		Manufactured:    (*domain.ManufacturingDate)(a.Manufactured),
		Size:            a.Size,
		Finish:          a.Finish,
		AskingPrice:     (*domain.Money)(a.AskingPrice),
		PriceVisible:    a.PriceVisible,
		Location:        a.Location,
		Description:     a.Description,
		AcquisitionCost: (*domain.Money)(a.AcquisitionCost),
		PrivateNotes:    a.PrivateNotes,
	}
}
func Item(r domain.Record) dto.Item {
	return dto.Item{ID: r.ID, DealerID: r.DealerID, Revision: r.Revision, Status: string(r.Status), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt, Attributes: dto.Attributes{
		StockNumber:     r.StockNumber,
		Title:           r.Title,
		Featured:        r.Featured,
		Form:            string(r.Form),
		PlayerSystem:    r.PlayerSystem,
		Condition:       string(r.Condition),
		Make:            r.Make,
		Model:           r.Model,
		Serial:          r.Serial,
		Manufactured:    (*dto.ManufacturingDate)(r.Manufactured),
		Size:            r.Size,
		Finish:          r.Finish,
		AskingPrice:     (*dto.Money)(r.AskingPrice),
		PriceVisible:    r.PriceVisible,
		Location:        r.Location,
		Description:     r.Description,
		AcquisitionCost: (*dto.Money)(r.AcquisitionCost),
		PrivateNotes:    r.PrivateNotes,
	}}
}
