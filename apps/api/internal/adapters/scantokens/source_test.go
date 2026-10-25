package scantokens

import (
	"bytes"
	"errors"
	"io"
	"testing"
)

type failingReader struct{}

func (failingReader) Read(p []byte) (int, error) {
	copy(p, []byte{1, 2})
	return 2, errors.New("source unavailable")
}
func TestRandomScanSourceUsesAllBytesAndFailsClosed(t *testing.T) {
	source := New(bytes.NewReader(bytes.Repeat([]byte{1}, 64)))
	first, err := source.NewScanToken()
	if err != nil || first.Encoded() != "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE" {
		t.Fatal("source bytes not preserved", err)
	}
	if _, err := source.NewScanToken(); err != nil {
		t.Fatal(err)
	}
	if token, err := source.NewScanToken(); err == nil || token.Valid() {
		t.Fatal("exhausted source returned token")
	}
	for _, reader := range []io.Reader{nil, bytes.NewReader(make([]byte, 32)), bytes.NewReader([]byte{1}), failingReader{}} {
		token, err := New(reader).NewScanToken()
		if err == nil || token.Valid() {
			t.Fatal("bad source returned token")
		}
	}
}
func TestSystemSourceProducesIndependentValidTokens(t *testing.T) {
	source := System()
	first, err := source.NewScanToken()
	if err != nil || !first.Valid() {
		t.Fatal(err)
	}
	second, err := source.NewScanToken()
	if err != nil || !second.Valid() || first == second {
		t.Fatal("system source invalid", err)
	}
}
