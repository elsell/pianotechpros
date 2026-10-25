package dto

type InventoryScanLabel struct {
	DealerID string `json:"dealer_id"`
	RecordID string `json:"record_id"`
	Token    string `json:"token"`
}
type InventoryScanResolution struct {
	DealerID string `json:"dealer_id"`
	RecordID string `json:"record_id"`
}
