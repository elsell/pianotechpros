package technician

import (
	"strings"
	"time"
)

type ID string
type Attributes struct {
	Name                               string
	BusinessName                       string
	Email                              string
	Phone                              string
	Biography                          string
	Searchable                         bool
	AcceptsRequestsWithoutAvailability bool
}
type Entity struct {
	ID          ID
	OwnerUserID string
	Attributes
	CreatedAt, UpdatedAt time.Time
}

func New(id ID, ownerUserID string, attributes Attributes) (Entity, error) {
	attributes.Name = strings.TrimSpace(attributes.Name)
	if attributes.Name == "" {
		return Entity{}, ErrInvalidFields
	}
	attributes.BusinessName = strings.TrimSpace(attributes.BusinessName)
	if attributes.BusinessName == "" {
		return Entity{}, ErrInvalidFields
	}
	attributes.Email = strings.TrimSpace(attributes.Email)
	if attributes.Email == "" {
		return Entity{}, ErrInvalidFields
	}
	attributes.Phone = strings.TrimSpace(attributes.Phone)
	if attributes.Phone == "" {
		return Entity{}, ErrInvalidFields
	}
	attributes.Biography = strings.TrimSpace(attributes.Biography)
	if attributes.Biography == "" {
		return Entity{}, ErrInvalidFields
	}
	if id == "" || strings.TrimSpace(ownerUserID) == "" {
		return Entity{}, ErrInvalidFields
	}
	return Entity{ID: id, OwnerUserID: ownerUserID, Attributes: attributes}, nil
}
