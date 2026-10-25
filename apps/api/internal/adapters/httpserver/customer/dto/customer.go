package dto

type CustomerItem struct {
	ID           string `json:"id"`
	Name         string `json:"name" required:"true" minLength:"1"`
	IsBusiness   bool   `json:"is_business" required:"true"`
	BusinessName string `json:"business_name" required:"true" minLength:"1"`
	Email        string `json:"email" required:"true" minLength:"1"`
	Phone        string `json:"phone" required:"true" minLength:"1"`
}

type CustomerCreate struct {
	Name         string `json:"name" required:"true" minLength:"1"`
	IsBusiness   bool   `json:"is_business" required:"true"`
	BusinessName string `json:"business_name" required:"true" minLength:"1"`
	Email        string `json:"email" required:"true" minLength:"1"`
	Phone        string `json:"phone" required:"true" minLength:"1"`
}

type CustomerUpdate struct {
	Name         string `json:"name" required:"true" minLength:"1"`
	IsBusiness   bool   `json:"is_business" required:"true"`
	BusinessName string `json:"business_name" required:"true" minLength:"1"`
	Email        string `json:"email" required:"true" minLength:"1"`
	Phone        string `json:"phone" required:"true" minLength:"1"`
}
