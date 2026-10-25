package dto

type TechnicianItem struct {
	ID                                 string `json:"id"`
	Name                               string `json:"name" required:"true" minLength:"1"`
	BusinessName                       string `json:"business_name" required:"true" minLength:"1"`
	Email                              string `json:"email" required:"true" minLength:"1"`
	Phone                              string `json:"phone" required:"true" minLength:"1"`
	Biography                          string `json:"biography" required:"true" minLength:"1"`
	Searchable                         bool   `json:"searchable" required:"true"`
	AcceptsRequestsWithoutAvailability bool   `json:"accepts_requests_without_availability" required:"true"`
}

type TechnicianCreate struct {
	Name                               string `json:"name" required:"true" minLength:"1"`
	BusinessName                       string `json:"business_name" required:"true" minLength:"1"`
	Email                              string `json:"email" required:"true" minLength:"1"`
	Phone                              string `json:"phone" required:"true" minLength:"1"`
	Biography                          string `json:"biography" required:"true" minLength:"1"`
	Searchable                         bool   `json:"searchable" required:"true"`
	AcceptsRequestsWithoutAvailability bool   `json:"accepts_requests_without_availability" required:"true"`
}

type TechnicianUpdate struct {
	Name                               string `json:"name" required:"true" minLength:"1"`
	BusinessName                       string `json:"business_name" required:"true" minLength:"1"`
	Email                              string `json:"email" required:"true" minLength:"1"`
	Phone                              string `json:"phone" required:"true" minLength:"1"`
	Biography                          string `json:"biography" required:"true" minLength:"1"`
	Searchable                         bool   `json:"searchable" required:"true"`
	AcceptsRequestsWithoutAvailability bool   `json:"accepts_requests_without_availability" required:"true"`
}
