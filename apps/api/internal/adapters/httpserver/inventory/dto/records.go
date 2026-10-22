package dto

import "time"

type Money struct {
	MinorUnits int64  `json:"minor_units" minimum:"0" maximum:"9007199254740991"`
	Currency   string `json:"currency" pattern:"^[A-Z]{3}$"`
}
type ManufacturingDate struct {
	Year  int `json:"year" minimum:"1" maximum:"9999"`
	Month int `json:"month" minimum:"0" maximum:"12"`
	Day   int `json:"day" minimum:"0" maximum:"31"`
}
type Attributes struct {
	StockNumber     string             `json:"stock_number" minLength:"1" maxLength:"80"`
	Title           string             `json:"title" required:"false"`
	Featured        bool               `json:"featured" required:"false"`
	Form            string             `json:"form" required:"false"`
	PlayerSystem    bool               `json:"player_system" required:"false"`
	Condition       string             `json:"condition" required:"false"`
	Make            string             `json:"make" required:"false"`
	Model           string             `json:"model" required:"false"`
	Serial          string             `json:"serial" required:"false"`
	Manufactured    *ManufacturingDate `json:"manufactured" required:"false"`
	Size            string             `json:"size" required:"false"`
	Finish          string             `json:"finish" required:"false"`
	AskingPrice     *Money             `json:"asking_price" required:"false"`
	PriceVisible    bool               `json:"price_visible" required:"false"`
	Location        string             `json:"location" required:"false"`
	Description     string             `json:"description" required:"false"`
	AcquisitionCost *Money             `json:"acquisition_cost" required:"false"`
	PrivateNotes    string             `json:"private_notes" required:"false"`
}
type Update struct {
	ExpectedRevision int64      `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
	Attributes       Attributes `json:"attributes"`
}
type Item struct {
	ID         string     `json:"id"`
	DealerID   string     `json:"dealer_id"`
	Revision   int64      `json:"revision"`
	Status     string     `json:"status"`
	Attributes Attributes `json:"attributes"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}
