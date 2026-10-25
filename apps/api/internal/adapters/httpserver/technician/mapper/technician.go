package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
)

func Item(entity domain.Entity) dto.TechnicianItem {
	return dto.TechnicianItem{ID: string(entity.ID), Name: entity.Name, BusinessName: entity.BusinessName, Email: entity.Email, Phone: entity.Phone, Biography: entity.Biography, Searchable: entity.Searchable, AcceptsRequestsWithoutAvailability: entity.AcceptsRequestsWithoutAvailability}
}

func Attributes(input dto.TechnicianCreate) domain.Attributes {
	return domain.Attributes{Name: input.Name, BusinessName: input.BusinessName, Email: input.Email, Phone: input.Phone, Biography: input.Biography, Searchable: input.Searchable, AcceptsRequestsWithoutAvailability: input.AcceptsRequestsWithoutAvailability}
}

func UpdateAttributes(input dto.TechnicianUpdate) domain.Attributes {
	return domain.Attributes{Name: input.Name, BusinessName: input.BusinessName, Email: input.Email, Phone: input.Phone, Biography: input.Biography, Searchable: input.Searchable, AcceptsRequestsWithoutAvailability: input.AcceptsRequestsWithoutAvailability}
}
