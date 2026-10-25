package photoprocessor

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"image/jpeg"
	"io"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

// Generated synthetic 3x2 RGBA pixels, lossless WebP. No external image content.
func bannerWebP(t *testing.T) []byte {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString("UklGRjAAAABXRUJQVlA4TCQAAAAvAkAAEB8gEEjaH3qN+RcQFPk/2vwH8KVAQdoGLBbQ7kT0Pzg=")
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func webpChunk(raw []byte, kind string, payload []byte) []byte {
	result := bytes.Clone(raw)
	result = append(result, []byte(kind)...)
	length := make([]byte, 4)
	binary.LittleEndian.PutUint32(length, uint32(len(payload)))
	result = append(result, length...)
	result = append(result, payload...)
	if len(payload)%2 != 0 {
		result = append(result, 0)
	}
	binary.LittleEndian.PutUint32(result[4:8], uint32(len(result)-8))
	return result
}
func TestBannerWebPIsReencodedAndOrientationApplied(t *testing.T) {
	processor := New()
	raw := bannerWebP(t)
	if _, err := processor.Process(context.Background(), bytes.NewReader(raw)); !errors.Is(err, ports.ErrInvalidPhoto) {
		t.Fatal("inventory format contract changed", err)
	}
	out, err := processor.Banner().Process(context.Background(), bytes.NewReader(raw))
	if err != nil || out.Width != 3 || out.Height != 2 {
		t.Fatalf("banner WebP: %+v %v", out, err)
	}
	if _, err := jpeg.Decode(bytes.NewReader(out.JPEG)); err != nil {
		t.Fatal(err)
	}
	// Reuse the synthetic IFD0 orientation encoded by the JPEG test helper.
	orientedJPEG := withOrientation(photoJPEG(t), 6)
	length := int(binary.BigEndian.Uint16(orientedJPEG[4:6]))
	exif := orientedJPEG[6 : 4+length]
	raw = webpChunk(raw, "EXIF", exif)
	raw = webpChunk(raw, "XMP ", []byte("PRIVATE-BANNER-METADATA"))
	out, err = processor.Banner().Process(context.Background(), bytes.NewReader(raw))
	if err != nil || out.Width != 2 || out.Height != 3 {
		t.Fatalf("WebP orientation: %dx%d %v", out.Width, out.Height, err)
	}
	if bytes.Contains(out.JPEG, []byte("PRIVATE-BANNER-METADATA")) || bytes.Contains(out.JPEG, []byte("Exif")) {
		t.Fatal("metadata retained")
	}
}
func TestBannerWebPRejectsAnimationCorruptChunksAndDuplicateExif(t *testing.T) {
	processor := New().Banner()
	raw := bannerWebP(t)
	broken := bytes.Clone(raw)
	binary.LittleEndian.PutUint32(broken[16:20], 0xffffffff)
	for _, input := range [][]byte{
		raw[:len(raw)-1], append(bytes.Clone(raw), 1), broken,
		webpChunk(raw, "ANIM", []byte{0, 0, 0, 0, 0, 0}),
		webpChunk(raw, "ANMF", []byte{0}),
		webpChunk(raw, "EXIF", []byte("bad tiff")),
		webpChunk(webpChunk(raw, "EXIF", []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0}), "EXIF", []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0}),
	} {
		if _, err := processor.Process(context.Background(), bytes.NewReader(input)); !errors.Is(err, ports.ErrInvalidPhoto) {
			t.Fatalf("accepted malformed WebP: %v", err)
		}
	}
}

type notifiedReader struct{ touched chan struct{} }

func (r notifiedReader) Read([]byte) (int, error) { close(r.touched); return 0, io.EOF }
func TestBannerSharesDecoderSlotsAndCancellation(t *testing.T) {
	p := New()
	p.slots <- struct{}{}
	p.slots <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	touched := make(chan struct{})
	result := make(chan error, 1)
	go func() { _, err := p.Banner().Process(ctx, notifiedReader{touched}); result <- err }()
	select {
	case <-touched:
		t.Fatal("banner consumed input while shared decoder slots were occupied")
	case err := <-result:
		t.Fatalf("banner bypassed shared decoder budget: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("queued banner did not cancel")
	}
	select {
	case <-touched:
		t.Fatal("canceled banner consumed input")
	default:
	}
}
