package dto

import "github.com/danielgtaylor/huma/v2"

type DealerBanner struct {
	ID     string `json:"id"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}
type DealerBannerState struct {
	Profile DealerItem    `json:"profile"`
	Banner  *DealerBanner `json:"banner"`
}

func (DealerBannerState) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	s.Properties["banner"] = &huma.Schema{AnyOf: []*huma.Schema{s.Properties["banner"], {Type: "null"}}}
	return s
}
