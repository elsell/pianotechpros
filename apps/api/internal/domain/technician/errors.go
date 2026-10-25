package technician

import "errors"

var ErrInvalidFields = errors.New("domain fields are invalid")

var ErrRevisionConflict = errors.New("technician revision conflict")
