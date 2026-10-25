package photoprocessor

import (
	"bytes"
	"encoding/binary"

	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

// Only IFD0 orientation is consumed. No metadata offsets are followed recursively.
func exifOrientation(tiff []byte) (int, error) {
	if len(tiff) < 8 {
		return 0, ports.ErrInvalidPhoto
	}
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 0, ports.ErrInvalidPhoto
	}
	if order.Uint16(tiff[2:4]) != 42 {
		return 0, ports.ErrInvalidPhoto
	}
	offset := uint64(order.Uint32(tiff[4:8]))
	if offset < 8 || offset+2 > uint64(len(tiff)) {
		return 0, ports.ErrInvalidPhoto
	}
	count := uint64(order.Uint16(tiff[offset : offset+2]))
	if offset+2+count*12+4 > uint64(len(tiff)) {
		return 0, ports.ErrInvalidPhoto
	}
	orientation := 1
	seen := false
	for i := uint64(0); i < count; i++ {
		entry := tiff[offset+2+i*12 : offset+2+(i+1)*12]
		if order.Uint16(entry[:2]) != 0x112 {
			continue
		}
		if seen || order.Uint16(entry[2:4]) != 3 || order.Uint32(entry[4:8]) != 1 {
			return 0, ports.ErrInvalidPhoto
		}
		seen = true
		orientation = int(order.Uint16(entry[8:10]))
		if orientation < 1 || orientation > 8 {
			return 0, ports.ErrInvalidPhoto
		}
	}
	return orientation, nil
}

func readOrientation(raw []byte, format string) (int, error) {
	orientation := 1
	found := false
	consume := func(payload []byte) error {
		if found {
			return ports.ErrInvalidPhoto
		}
		found = true
		var err error
		orientation, err = exifOrientation(payload)
		return err
	}
	if format == "webp" {
		if len(raw) < 12 || string(raw[:4]) != "RIFF" || string(raw[8:12]) != "WEBP" || uint64(binary.LittleEndian.Uint32(raw[4:8])) != uint64(len(raw)-8) {
			return 0, ports.ErrInvalidPhoto
		}
		for offset := 12; offset < len(raw); {
			if len(raw)-offset < 8 {
				return 0, ports.ErrInvalidPhoto
			}
			kind := string(raw[offset : offset+4])
			length := uint64(binary.LittleEndian.Uint32(raw[offset+4 : offset+8]))
			padded := length + length%2
			if padded > uint64(len(raw)-offset-8) {
				return 0, ports.ErrInvalidPhoto
			}
			payload := raw[offset+8 : offset+8+int(length)]
			if kind == "ANIM" || kind == "ANMF" || (kind == "VP8X" && (len(payload) != 10 || payload[0]&2 != 0)) {
				return 0, ports.ErrInvalidPhoto
			}
			if kind == "EXIF" {
				payload = bytes.TrimPrefix(payload, []byte{'E', 'x', 'i', 'f', 0, 0})
				if err := consume(payload); err != nil {
					return 0, err
				}
			}
			offset += 8 + int(padded)
		}
		return orientation, nil
	}
	if format == "png" {
		for offset := 8; offset < len(raw); {
			if len(raw)-offset < 12 {
				return 0, ports.ErrInvalidPhoto
			}
			length := uint64(binary.BigEndian.Uint32(raw[offset : offset+4]))
			if length > uint64(len(raw)-offset-12) {
				return 0, ports.ErrInvalidPhoto
			}
			kind := string(raw[offset+4 : offset+8])
			payload := raw[offset+8 : offset+8+int(length)]
			if kind == "acTL" || kind == "fcTL" || kind == "fdAT" {
				return 0, ports.ErrInvalidPhoto
			}
			if kind == "eXIf" {
				if err := consume(payload); err != nil {
					return 0, err
				}
			}
			offset += int(length) + 12
			if kind == "IEND" {
				return orientation, nil
			}
		}
		return 0, ports.ErrInvalidPhoto
	}
	// JPEG APP1 metadata precedes the first scan. The JPEG decoder validates pixels.
	for offset := 2; offset < len(raw); {
		if raw[offset] != 0xff {
			return 0, ports.ErrInvalidPhoto
		}
		for offset < len(raw) && raw[offset] == 0xff {
			offset++
		}
		if offset == len(raw) {
			return 0, ports.ErrInvalidPhoto
		}
		marker := raw[offset]
		offset++
		if marker == 0xda {
			return orientation, nil
		}
		if marker == 0xd9 {
			return 0, ports.ErrInvalidPhoto
		}
		if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7) {
			continue
		}
		if len(raw)-offset < 2 {
			return 0, ports.ErrInvalidPhoto
		}
		length := int(binary.BigEndian.Uint16(raw[offset : offset+2]))
		if length < 2 || length > len(raw)-offset {
			return 0, ports.ErrInvalidPhoto
		}
		payload := raw[offset+2 : offset+length]
		if marker == 0xe1 && bytes.HasPrefix(payload, []byte{'E', 'x', 'i', 'f', 0, 0}) {
			if err := consume(payload[6:]); err != nil {
				return 0, err
			}
		}
		offset += length
	}
	return 0, ports.ErrInvalidPhoto
}
