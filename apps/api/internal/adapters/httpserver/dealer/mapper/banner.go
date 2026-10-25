package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
)

func BannerState(state domain.BannerState) dto.DealerBannerState {
	out := dto.DealerBannerState{Profile: Item(state.Dealer)}
	if state.Banner != nil {
		out.Banner = &dto.DealerBanner{ID: state.Banner.ID, Width: state.Banner.Width, Height: state.Banner.Height}
	}
	return out
}
