// Package photoprocessor converts untrusted images into bounded fresh renditions.
package photoprocessor

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"io"

	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

const maxBytes = 20 << 20
const maxAxis = 10000
const maxPixels = 25000000

// Processor must be shared by bootstrap so concurrent decoding stays bounded.
type Processor struct{ slots chan struct{} }

func New() *Processor { return &Processor{slots: make(chan struct{}, 2)} }

var _ ports.PhotoProcessor = (*Processor)(nil)

func (p *Processor) Process(ctx context.Context, source io.Reader) (ports.ProcessedPhoto, error) {
	empty := ports.ProcessedPhoto{}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	if source == nil || p == nil || p.slots == nil {
		return empty, ports.ErrInvalidPhoto
	}
	select {
	case p.slots <- struct{}{}:
		defer func() { <-p.slots }()
	case <-ctx.Done():
		return empty, ctx.Err()
	}
	raw, err := io.ReadAll(io.LimitReader(contextReader{ctx, source}, maxBytes+1))
	if err != nil {
		if ctx.Err() != nil {
			return empty, ctx.Err()
		}
		if errors.Is(err, ports.ErrPhotoLimit) {
			return empty, ports.ErrPhotoLimit
		}
		return empty, ports.ErrInvalidPhoto
	}
	if len(raw) > maxBytes {
		return empty, ports.ErrPhotoLimit
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || (format != "jpeg" && format != "png") {
		return empty, ports.ErrInvalidPhoto
	}
	if config.Width < 1 || config.Height < 1 || config.Width > maxAxis || config.Height > maxAxis || int64(config.Width)*int64(config.Height) > maxPixels {
		return empty, ports.ErrPhotoLimit
	}
	orientation, err := readOrientation(raw, format)
	if err != nil {
		return empty, err
	}
	if err = ctx.Err(); err != nil {
		return empty, err
	}
	decoded, decodedFormat, err := image.Decode(bytes.NewReader(raw))
	if err != nil || decodedFormat != format {
		return empty, ports.ErrInvalidPhoto
	}
	if decoded.Bounds().Dx() != config.Width || decoded.Bounds().Dy() != config.Height {
		return empty, ports.ErrInvalidPhoto
	}
	normalized, err := orient(ctx, decoded, orientation)
	if err != nil {
		return empty, err
	}
	var output limitedOutput
	output.ctx = ctx
	if err = jpeg.Encode(&output, normalized, &jpeg.Options{Quality: 90}); err != nil {
		if ctx.Err() != nil {
			return empty, ctx.Err()
		}
		if errors.Is(err, ports.ErrPhotoLimit) {
			return empty, ports.ErrPhotoLimit
		}
		return empty, ports.ErrInvalidPhoto
	}
	if err = ctx.Err(); err != nil {
		return empty, err
	}
	data := output.Bytes()
	hash := sha256.Sum256(data)
	return ports.ProcessedPhoto{JPEG: data, Width: normalized.Bounds().Dx(), Height: normalized.Bounds().Dy(), SHA256: hex.EncodeToString(hash[:])}, nil
}

type contextReader struct {
	ctx context.Context
	io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.Reader.Read(p)
}

type limitedOutput struct {
	bytes.Buffer
	ctx context.Context
}

func (w *limitedOutput) Write(p []byte) (int, error) {
	if err := w.ctx.Err(); err != nil {
		return 0, err
	}
	if len(p) > maxBytes-w.Len() {
		return 0, ports.ErrPhotoLimit
	}
	return w.Buffer.Write(p)
}

func orient(ctx context.Context, src image.Image, orientation int) (*image.RGBA, error) {
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	dw, dh := w, h
	if orientation >= 5 {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < dh; y++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for x := 0; x < dw; x++ {
			sx, sy := x, y
			switch orientation {
			case 2:
				sx = w - 1 - x
			case 3:
				sx, sy = w-1-x, h-1-y
			case 4:
				sy = h - 1 - y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, h-1-x
			case 7:
				sx, sy = w-1-y, h-1-x
			case 8:
				sx, sy = w-1-y, x
			}
			// RGBA returns premultiplied channels; composite transparent pixels over white.
			r, g, b, a := src.At(sx+src.Bounds().Min.X, sy+src.Bounds().Min.Y).RGBA()
			dst.SetRGBA(x, y, color.RGBA{R: uint8((r + 65535 - a) >> 8), G: uint8((g + 65535 - a) >> 8), B: uint8((b + 65535 - a) >> 8), A: 255})
		}
	}
	return dst, nil
}
