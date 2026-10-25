package customer

import "errors"

var ErrInvalidFields = errors.New("domain fields are invalid")

var ErrRevisionConflict = errors.New("customer revision conflict")
