package inventory

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var ErrInvalidScanLabel = errors.New("invalid_inventory_scan_label")

// ScanToken identifies a record; it never authorizes access to it.
// Its representation is private to prevent accidental diagnostic disclosure.
type ScanToken struct{ value [32]byte }

func ParseScanToken(encoded string) (ScanToken, error) {
	var token ScanToken
	if len(encoded) != 43 {
		return token, ErrInvalidScanLabel
	}
	raw, err := base64.RawURLEncoding.Strict().DecodeString(encoded)
	if err != nil || len(raw) != 32 || base64.RawURLEncoding.EncodeToString(raw) != encoded {
		return token, ErrInvalidScanLabel
	}
	copy(token.value[:], raw)
	if !token.Valid() {
		return ScanToken{}, ErrInvalidScanLabel
	}
	return token, nil
}
func (t ScanToken) Valid() bool { return t.value != [32]byte{} }

// Encoded is for the explicit private scan transport, never logs or audit.
func (t ScanToken) Encoded() string {
	if !t.Valid() {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(t.value[:])
}
func (t ScanToken) Format(state fmt.State, _ rune) { _, _ = io.WriteString(state, "[scan-token]") }
func (t ScanToken) MarshalJSON() ([]byte, error)   { return []byte(`"[scan-token]"`), nil }

// ScanLabel is the immutable association persisted separately from content revisions.
type ScanLabel struct {
	DealerID, RecordID, CreatedBy string
	Token                         ScanToken
	CreatedAt                     time.Time
}

func NewScanLabel(dealerID, recordID, actorID string, token ScanToken, at time.Time) (ScanLabel, error) {
	valid := func(id string) bool {
		return len(id) > 0 && len(id) <= 128 && utf8.ValidString(id) && strings.IndexFunc(id, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) < 0
	}
	at = at.UTC().Truncate(time.Microsecond)
	if !valid(dealerID) || !valid(recordID) || !valid(actorID) || !token.Valid() || at.IsZero() || at.Year() < 1 || at.Year() > 9999 {
		return ScanLabel{}, ErrInvalidScanLabel
	}
	return ScanLabel{DealerID: dealerID, RecordID: recordID, CreatedBy: actorID, Token: token, CreatedAt: at}, nil
}
