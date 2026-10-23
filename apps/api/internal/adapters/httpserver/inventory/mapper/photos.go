package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
)

func Photos(state domain.PhotoState) dto.PhotoState {
	result := dto.PhotoState{Record: Item(state.Record), Photos: make([]dto.Photo, 0, len(state.Photos))}
	for _, p := range state.Photos {
		result.Photos = append(result.Photos, dto.Photo{ID: p.ID, AltText: p.AltText})
	}
	return result
}
