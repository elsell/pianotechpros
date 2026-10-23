package photoprocessor

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func photoPNG(t *testing.T) []byte {
	t.Helper()
	im := image.NewNRGBA(image.Rect(0, 0, 3, 2))
	im.Set(0, 0, color.NRGBA{R: 255, A: 255})
	var b bytes.Buffer
	if err := png.Encode(&b, im); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func photoJPEG(t *testing.T) []byte {
	t.Helper()
	im := image.NewRGBA(image.Rect(0, 0, 30, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 30; x++ {
			im.Set(x, y, color.RGBA{R: uint8(x * 8), G: uint8(y * 12), A: 255})
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, im, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func withOrientation(src []byte, orientation uint16) []byte {
	// EXIF little-endian IFD0 with a single SHORT orientation entry.
	exif := []byte{'E', 'x', 'i', 'f', 0, 0, 'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
	binary.LittleEndian.PutUint16(exif[24:26], orientation)
	result := append([]byte{}, src[:2]...)
	result = append(result, 0xff, 0xe1, byte((len(exif)+2)>>8), byte(len(exif)+2))
	result = append(result, exif...)
	return append(result, src[2:]...)
}

func TestProcessProducesFreshMetadataFreeJPEG(t *testing.T) {
	for _, src := range [][]byte{photoPNG(t), withOrientation(photoJPEG(t), 6)} {
		src = append(src, []byte("PRIVATE-GPS<script>trailing</script>")...)
		out, err := New().Process(context.Background(), bytes.NewReader(src))
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(out.JPEG, []byte("PRIVATE")) || bytes.Contains(out.JPEG, []byte("Exif")) {
			t.Fatal("source metadata survived")
		}
		config, err := jpeg.DecodeConfig(bytes.NewReader(out.JPEG))
		if err != nil || config.Width != out.Width || config.Height != out.Height {
			t.Fatalf("invalid rendition: %v", err)
		}
		hash := sha256.Sum256(out.JPEG)
		if out.SHA256 != hex.EncodeToString(hash[:]) {
			t.Fatal("incorrect digest")
		}
	}
	out, err := New().Process(context.Background(), bytes.NewReader(withOrientation(photoJPEG(t), 6)))
	if err != nil || out.Width != 20 || out.Height != 30 {
		t.Fatalf("orientation dimensions: %+v %v", out, err)
	}
}

func TestProcessorRejectsInvalidUnsupportedAndOversizedInputs(t *testing.T) {
	for _, src := range [][]byte{nil, []byte("<svg/>"), []byte("GIF89a"), photoPNG(t)[:20], withOrientation(photoJPEG(t), 9)} {
		if out, err := New().Process(context.Background(), bytes.NewReader(src)); !errors.Is(err, ports.ErrInvalidPhoto) || len(out.JPEG) != 0 {
			t.Fatalf("accepted invalid input: %v", err)
		}
	}
	if _, err := New().Process(context.Background(), bytes.NewReader(make([]byte, maxBytes+1))); !errors.Is(err, ports.ErrPhotoLimit) {
		t.Fatalf("input limit: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := New().Process(ctx, bytes.NewReader(photoPNG(t))); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation: %v", err)
	}
}

func TestAllOrientationPixelMappings(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 3, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 3; x++ {
			src.SetNRGBA(x, y, color.NRGBA{R: uint8(1 + y*3 + x), A: 255})
		}
	}
	want := [][]uint8{{1, 2, 3, 4, 5, 6}, {3, 2, 1, 6, 5, 4}, {6, 5, 4, 3, 2, 1}, {4, 5, 6, 1, 2, 3}, {1, 4, 2, 5, 3, 6}, {4, 1, 5, 2, 6, 3}, {6, 3, 5, 2, 4, 1}, {3, 6, 2, 5, 1, 4}}
	for o := 1; o <= 8; o++ {
		got, err := orient(context.Background(), src, o)
		if err != nil {
			t.Fatal(err)
		}
		var pixels []uint8
		for y := 0; y < got.Bounds().Dy(); y++ {
			for x := 0; x < got.Bounds().Dx(); x++ {
				v := color.NRGBAModel.Convert(got.At(x, y)).(color.NRGBA)
				pixels = append(pixels, v.R)
			}
		}
		if !bytes.Equal(pixels, want[o-1]) {
			t.Fatalf("orientation %d: %v", o, pixels)
		}
	}
}

func pngChunk(kind string, payload []byte) []byte {
	b := make([]byte, 12+len(payload))
	binary.BigEndian.PutUint32(b, uint32(len(payload)))
	copy(b[4:8], kind)
	copy(b[8:], payload)
	binary.BigEndian.PutUint32(b[len(b)-4:], crc32.ChecksumIEEE(b[4:len(b)-4]))
	return b
}
func insertPNG(src []byte, chunk []byte) []byte {
	out := append([]byte{}, src[:33]...)
	out = append(out, chunk...)
	return append(out, src[33:]...)
}
func TestPreflightLimitsAndPNGMetadata(t *testing.T) {
	for _, size := range [][2]uint32{{10001, 1}, {5001, 5000}} {
		src := photoPNG(t)
		binary.BigEndian.PutUint32(src[16:20], size[0])
		binary.BigEndian.PutUint32(src[20:24], size[1])
		binary.BigEndian.PutUint32(src[29:33], crc32.ChecksumIEEE(src[12:29]))
		if _, err := New().Process(context.Background(), bytes.NewReader(src)); !errors.Is(err, ports.ErrPhotoLimit) {
			t.Fatalf("dimensions: %v", err)
		}
	}
	src := photoPNG(t)
	exifJPEG := withOrientation(photoJPEG(t), 6)
	// APP1 length includes its two-byte length, then six-byte EXIF marker.
	tiff := exifJPEG[12 : 4+int(binary.BigEndian.Uint16(exifJPEG[4:6]))]
	src = insertPNG(src, pngChunk("eXIf", tiff))
	src = insertPNG(src, pngChunk("tEXt", []byte("GPS\x00PRIVATE-LOCATION")))
	out, err := New().Process(context.Background(), bytes.NewReader(src))
	if err != nil || out.Width != 2 || out.Height != 3 || bytes.Contains(out.JPEG, []byte("PRIVATE")) {
		t.Fatalf("PNG metadata: %v", err)
	}
	animated := insertPNG(photoPNG(t), pngChunk("acTL", make([]byte, 8)))
	if _, err := New().Process(context.Background(), bytes.NewReader(animated)); !errors.Is(err, ports.ErrInvalidPhoto) {
		t.Fatalf("animation: %v", err)
	}
	duplicate := withOrientation(withOrientation(photoJPEG(t), 6), 3)
	if _, err := New().Process(context.Background(), bytes.NewReader(duplicate)); !errors.Is(err, ports.ErrInvalidPhoto) {
		t.Fatalf("duplicate EXIF: %v", err)
	}
}

func TestTransparentPixelsFlattenToWhite(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	src.SetNRGBA(0, 0, color.NRGBA{R: 200, G: 5, B: 100, A: 0})
	src.SetNRGBA(1, 0, color.NRGBA{R: 255, A: 128})
	out, err := orient(context.Background(), src, 1)
	if err != nil {
		t.Fatal(err)
	}
	if out.RGBAAt(0, 0) != (color.RGBA{255, 255, 255, 255}) || out.RGBAAt(1, 0) != (color.RGBA{255, 127, 127, 255}) {
		t.Fatalf("flatten: %v %v", out.RGBAAt(0, 0), out.RGBAAt(1, 0))
	}
}

func TestAdmissionCancellationAndFixedReadFailure(t *testing.T) {
	p := New()
	p.slots <- struct{}{}
	p.slots <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := p.Process(ctx, bytes.NewReader(nil)); done <- err }()
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("admission: %v", err)
	}
	if len(p.slots) != 2 {
		t.Fatal("cancelled operation consumed a slot")
	}
	if _, err := New().Process(context.Background(), failedReader{}); err != ports.ErrInvalidPhoto {
		t.Fatalf("raw failure escaped: %v", err)
	}
	output := limitedOutput{ctx: context.Background()}
	if _, err := output.Write(make([]byte, maxBytes+1)); err != ports.ErrPhotoLimit || output.Len() != 0 {
		t.Fatalf("output limit: %v", err)
	}
}

type failedReader struct{}

func (failedReader) Read([]byte) (int, error) { return 0, errors.New("PRIVATE-STORAGE-DETAIL") }

func FuzzPhotoMetadataFraming(f *testing.F) {
	f.Add([]byte{}, false)
	f.Add([]byte{'I', 'I', 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0}, true)
	f.Fuzz(func(t *testing.T, b []byte, tiff bool) {
		if len(b) > 1<<20 {
			t.Skip()
		}
		if tiff {
			_, _ = exifOrientation(b)
		} else {
			_, _ = readOrientation(b, "jpeg")
			_, _ = readOrientation(b, "png")
		}
	})
}

func TestEXIFBigEndianAndMalformedOrientation(t *testing.T) {
	tiff := make([]byte, 26)
	copy(tiff, "MM")
	binary.BigEndian.PutUint16(tiff[2:4], 42)
	binary.BigEndian.PutUint32(tiff[4:8], 8)
	binary.BigEndian.PutUint16(tiff[8:10], 1)
	binary.BigEndian.PutUint16(tiff[10:12], 0x112)
	binary.BigEndian.PutUint16(tiff[12:14], 3)
	binary.BigEndian.PutUint32(tiff[14:18], 1)
	binary.BigEndian.PutUint16(tiff[18:20], 8)
	if got, err := exifOrientation(tiff); err != nil || got != 8 {
		t.Fatalf("big endian: %d %v", got, err)
	}
	for _, mutate := range []func([]byte){
		func(b []byte) { binary.BigEndian.PutUint32(b[4:8], 0xffffffff) },
		func(b []byte) { binary.BigEndian.PutUint16(b[8:10], 0xffff) },
		func(b []byte) { binary.BigEndian.PutUint16(b[12:14], 4) },
		func(b []byte) { binary.BigEndian.PutUint32(b[14:18], 2) },
		func(b []byte) { binary.BigEndian.PutUint16(b[18:20], 0) },
	} {
		bad := append([]byte{}, tiff...)
		mutate(bad)
		if _, err := exifOrientation(bad); err != ports.ErrInvalidPhoto {
			t.Fatalf("malformed EXIF: %v", err)
		}
	}
}
