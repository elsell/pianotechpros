package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

func PublicListing(s domain.PublicListing) dto.PublicListing {
	photos := make([]dto.PublicPhoto, 0, len(s.Photos))
	for _, photo := range s.Photos {
		photos = append(photos, dto.PublicPhoto{ID: photo.ID, AltText: photo.AltText})
	}
	return dto.PublicListing{ID: s.ID, DealerID: s.DealerID, PublicationRevision: s.PublicationRevision, Status: string(s.Status), StockNumber: s.StockNumber, Title: s.Title, Featured: s.Featured, Form: string(s.Form), PlayerSystem: s.PlayerSystem, Condition: string(s.Condition), Make: s.Make, Model: s.Model, Manufactured: (*dto.ManufacturingDate)(s.Manufactured), Size: s.Size, Finish: s.Finish, Description: s.Description, Price: (*dto.Money)(s.Price), Photos: photos}
}
func PublicationState(state domain.PublicationRecord) dto.PublicationState {
	out := dto.PublicationState{Record: Item(state.Record)}
	if state.Publication != nil {
		p := state.Publication.State()
		out.Publication = &dto.Publication{Visible: p.Visible, AppliedRevision: p.AppliedRevision, Snapshot: PublicListing(p.Snapshot)}
	}
	return out
}
