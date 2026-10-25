package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/customer/dto"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
)

func Item(entity domain.Entity) dto.CustomerItem {
	return dto.CustomerItem{ID: string(entity.ID), Name: entity.Name, IsBusiness: entity.IsBusiness, BusinessName: entity.BusinessName, Email: entity.Email, Phone: entity.Phone}
}

func Attributes(input dto.CustomerCreate) domain.Attributes {
	return domain.Attributes{Name: input.Name, IsBusiness: input.IsBusiness, BusinessName: input.BusinessName, Email: input.Email, Phone: input.Phone}
}

func UpdateAttributes(input dto.CustomerUpdate) domain.Attributes {
	return domain.Attributes{Name: input.Name, IsBusiness: input.IsBusiness, BusinessName: input.BusinessName, Email: input.Email, Phone: input.Phone}
}
