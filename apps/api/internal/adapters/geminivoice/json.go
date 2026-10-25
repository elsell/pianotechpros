package geminivoice

import (
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
)

// exactProperties prevents encoding/json's case-insensitive matching from
// overriding schema properties. Unknown envelope metadata is permitted, but an
// alternative spelling of a known security-relevant property is never accepted.
func exactProperties(raw []byte, t reflect.Type, allowUnknown bool) error {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == reflect.TypeOf(json.RawMessage{}) {
		return nil
	}
	switch t.Kind() {
	case reflect.Struct:
		var properties map[string]json.RawMessage
		if json.Unmarshal(raw, &properties) != nil {
			return ErrUnavailable
		}
		fields := map[string]reflect.Type{}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			name := strings.Split(f.Tag.Get("json"), ",")[0]
			if name == "" {
				name = f.Name
			}
			if name != "-" {
				fields[name] = f.Type
			}
		}
		for key, value := range properties {
			ft, exists := fields[key]
			if !exists {
				if !allowUnknown {
					return ErrUnavailable
				}
				for name := range fields {
					if strings.EqualFold(name, key) {
						return ErrUnavailable
					}
				}
				continue
			}
			if exactProperties(value, ft, allowUnknown) != nil {
				return ErrUnavailable
			}
		}
	case reflect.Slice:
		var values []json.RawMessage
		if json.Unmarshal(raw, &values) != nil {
			return ErrUnavailable
		}
		for _, value := range values {
			if exactProperties(value, t.Elem(), allowUnknown) != nil {
				return ErrUnavailable
			}
		}
	}
	return nil
}

// encoding/json repairs unpaired UTF-16 escapes. Reject them before decoding so
// malformed model text cannot silently acquire replacement characters.
func validEscapedUnicode(raw []byte) bool {
	inside := false
	for i := 0; i < len(raw); i++ {
		if raw[i] == '"' {
			inside = !inside
			continue
		}
		if !inside || raw[i] != '\\' {
			continue
		}
		i++
		if i >= len(raw) {
			return false
		}
		if raw[i] != 'u' {
			continue
		}
		if i+4 >= len(raw) {
			return false
		}
		value, err := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		if err != nil {
			return false
		}
		i += 4
		if value >= 0xdc00 && value <= 0xdfff {
			return false
		}
		if value >= 0xd800 && value <= 0xdbff {
			if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
				return false
			}
			low, err := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
			if err != nil || low < 0xdc00 || low > 0xdfff {
				return false
			}
			i += 6
		}
	}
	return true
}
