package dto

import "time"

type TechnicianProfileOrigin struct {
	Label      string `json:"label"`
	Street1    string `json:"street1"`
	Street2    string `json:"street2,omitempty"`
	City       string `json:"city"`
	Region     string `json:"region"`
	PostalCode string `json:"postalCode"`
	Timezone   string `json:"timezone"`
}
type TechnicianWeeklyRule struct {
	Key            string `json:"key"`
	Kind           string `json:"kind" enum:"available,unavailable"`
	Recurrence     string `json:"recurrence" enum:"weekly"`
	Weekday        int    `json:"weekday" minimum:"0" maximum:"6"`
	Start          string `json:"start" pattern:"^([01][0-9]|2[0-3]):[0-5][0-9]$"`
	End            string `json:"end" pattern:"^([01][0-9]|2[0-3]):[0-5][0-9]$"`
	Timezone       string `json:"timezone"`
	EffectiveStart string `json:"effectiveStart,omitempty"`
	EffectiveEnd   string `json:"effectiveEnd,omitempty"`
}
type TechnicianProfileAttributes struct {
	Name                               string                  `json:"name"`
	BusinessName                       string                  `json:"businessName,omitempty"`
	Email                              string                  `json:"email"`
	Phone                              string                  `json:"phone,omitempty"`
	Biography                          string                  `json:"biography,omitempty"`
	Searchable                         bool                    `json:"searchable"`
	AcceptsRequestsWithoutAvailability bool                    `json:"acceptsRequestsWithoutAvailability"`
	Origin                             TechnicianProfileOrigin `json:"origin"`
	RadiusMiles                        int                     `json:"radiusMiles" minimum:"1" maximum:"500"`
	DrivingMinutes                     *int                    `json:"drivingMinutes,omitempty" nullable:"true" minimum:"1" maximum:"1440"`
	Services                           []string                `json:"services" maxItems:"5" nullable:"false"`
	Forms                              []string                `json:"forms" maxItems:"6" nullable:"false"`
	Availability                       []TechnicianWeeklyRule  `json:"availability" maxItems:"7" nullable:"false"`
}
type TechnicianProfileItem struct {
	ID         string                      `json:"id"`
	Revision   int64                       `json:"revision"`
	CreatedAt  time.Time                   `json:"createdAt"`
	UpdatedAt  time.Time                   `json:"updatedAt"`
	Attributes TechnicianProfileAttributes `json:"attributes"`
}
