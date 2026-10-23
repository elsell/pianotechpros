package dto

import "github.com/danielgtaylor/huma/v2"

type RevisionCommand struct {
	ExpectedRevision int64 `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
}
type LifecycleCommand struct {
	ExpectedRevision int64  `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
	Status           string `json:"status" enum:"draft,available,reserved,in_service,sold,archived"`
	SalePrice        *Money `json:"salePrice" required:"false"`
	Reason           string `json:"reason" required:"false" maxLength:"1000"`
}

func (LifecycleCommand) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	s.Properties["salePrice"] = &huma.Schema{AnyOf: []*huma.Schema{s.Properties["salePrice"], {Type: "null"}}}
	return s
}

type PublicPhoto struct {
	ID      string `json:"id"`
	AltText string `json:"alt_text"`
}

// PublicListing is an explicit allowlist, never an embedded private Attributes DTO.
type PublicListing struct {
	ID                  string             `json:"id"`
	DealerID            string             `json:"dealer_id"`
	PublicationRevision int64              `json:"publication_revision"`
	Status              string             `json:"status"`
	StockNumber         string             `json:"stock_number"`
	Title               string             `json:"title"`
	Featured            bool               `json:"featured"`
	Form                string             `json:"form"`
	PlayerSystem        bool               `json:"player_system"`
	Condition           string             `json:"condition"`
	Make                string             `json:"make"`
	Model               string             `json:"model"`
	Manufactured        *ManufacturingDate `json:"manufactured"`
	Size                string             `json:"size"`
	Finish              string             `json:"finish"`
	Description         string             `json:"description"`
	Price               *Money             `json:"price"`
	Photos              []PublicPhoto      `json:"photos" nullable:"false"`
}

func (PublicListing) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	for _, key := range []string{"price", "manufactured"} {
		s.Properties[key] = &huma.Schema{AnyOf: []*huma.Schema{s.Properties[key], {Type: "null"}}}
	}
	return s
}

type Publication struct {
	Visible         bool          `json:"visible"`
	AppliedRevision int64         `json:"applied_revision"`
	Snapshot        PublicListing `json:"snapshot"`
}
type PublicationState struct {
	Record      Item         `json:"record"`
	Publication *Publication `json:"publication"`
}

func (PublicationState) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	s.Properties["publication"] = &huma.Schema{AnyOf: []*huma.Schema{s.Properties["publication"], {Type: "null"}}}
	return s
}
