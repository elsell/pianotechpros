package ports

import (
	"context"
	"errors"
	"io"
)

var ErrInvalidPhoto = errors.New("invalid_photo")
var ErrPhotoLimit = errors.New("photo_limit_exceeded")

// ProcessedPhoto is a newly encoded rendition, never the untrusted source file.
// Only an authorized media persistence transaction may turn it into ready evidence.
type ProcessedPhoto struct {
	JPEG          []byte
	Width, Height int
	SHA256        string
}

type PhotoProcessor interface {
	Process(context.Context, io.Reader) (ProcessedPhoto, error)
}
