package dto

import "time"

type ProfileLocation struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	Street1    string `json:"street1"`
	Street2    string `json:"street2,omitempty"`
	City       string `json:"city"`
	Region     string `json:"region"`
	PostalCode string `json:"postalCode"`
	Timezone   string `json:"timezone"`
	Notes      string `json:"notes,omitempty"`
}
type ProfilePiano struct {
	Key              string `json:"key"`
	LocationKey      string `json:"locationKey"`
	Nickname         string `json:"nickname"`
	Form             string `json:"form"`
	Make             string `json:"make,omitempty"`
	Model            string `json:"model,omitempty"`
	Serial           string `json:"serial,omitempty"`
	Notes            string `json:"notes,omitempty"`
	ManufacturedYear *int   `json:"manufacturedYear,omitempty" nullable:"true"`
	Player           bool   `json:"player"`
}
type ProfileAttributes struct {
	Name         string            `json:"name"`
	IsBusiness   bool              `json:"isBusiness"`
	BusinessName string            `json:"businessName,omitempty"`
	Email        string            `json:"email"`
	Phone        string            `json:"phone,omitempty"`
	Locations    []ProfileLocation `json:"locations" minItems:"1" maxItems:"50" nullable:"false"`
	Pianos       []ProfilePiano    `json:"pianos" maxItems:"200" nullable:"false"`
}
type ProfileItem struct {
	ID         string            `json:"id"`
	Revision   int64             `json:"revision"`
	CreatedAt  time.Time         `json:"createdAt"`
	UpdatedAt  time.Time         `json:"updatedAt"`
	Attributes ProfileAttributes `json:"attributes"`
}
