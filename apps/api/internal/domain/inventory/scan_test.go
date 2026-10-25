package inventory

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

const scanExample = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"

func TestScanIdentityCanonicalAndRedacted(t *testing.T) {
	token, err := ParseScanToken(scanExample)
	if err != nil || token.Encoded() != scanExample {
		t.Fatal("valid token rejected", err)
	}
	for _, input := range []string{"", strings.Repeat("A", 43), scanExample + "=", " " + scanExample, scanExample + "\n", scanExample[:42] + "F", strings.Repeat("!", 43)} {
		if _, err := ParseScanToken(input); err == nil {
			t.Fatal("invalid token accepted")
		}
	}
	data, err := json.Marshal(token)
	if err != nil || strings.Contains(string(data), scanExample) {
		t.Fatal("JSON leaked token")
	}
	for _, format := range []string{"%v", "%+v", "%#v", "%s", "%q"} {
		if strings.Contains(fmt.Sprintf(format, token), scanExample) {
			t.Fatal("format leaked token")
		}
	}
	if (ScanToken{}).Valid() {
		t.Fatal("zero token valid")
	}
}
func TestScanLabelImmutableIdentityAndStoredPrecision(t *testing.T) {
	token, _ := ParseScanToken(scanExample)
	at := time.Date(2026, 10, 25, 1, 2, 3, 123456789, time.FixedZone("offset", 3600))
	label, err := NewScanLabel("dealer", "record", "actor", token, at)
	if err != nil {
		t.Fatal(err)
	}
	if label.CreatedAt.Location() != time.UTC || label.CreatedAt.Nanosecond() != 123456000 || label.DealerID != "dealer" || label.RecordID != "record" || label.CreatedBy != "actor" || label.Token != token {
		t.Fatal("identity or precision changed", label)
	}
	for _, id := range []string{"", " ", "a b", "a\nb", strings.Repeat("a", 129), string([]byte{255})} {
		if _, err := NewScanLabel(id, "record", "actor", token, at); err == nil {
			t.Fatal("bad dealer accepted")
		}
		if _, err := NewScanLabel("dealer", id, "actor", token, at); err == nil {
			t.Fatal("bad record accepted")
		}
		if _, err := NewScanLabel("dealer", "record", id, token, at); err == nil {
			t.Fatal("bad actor accepted")
		}
	}
	if _, err := NewScanLabel("dealer", "record", "actor", ScanToken{}, at); err == nil {
		t.Fatal("zero token accepted")
	}
	for _, invalidTime := range []time.Time{time.Time{}, time.Time{}.Add(time.Nanosecond), time.Date(10000, 1, 1, 0, 0, 0, 0, time.UTC)} {
		if _, err := NewScanLabel("dealer", "record", "actor", token, invalidTime); err == nil {
			t.Fatal("unstorable time accepted")
		}
	}
}
