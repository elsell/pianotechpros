// Package scantokens provides random identity bytes behind the scan-token port.
package scantokens

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"sync"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

var ErrUnavailable = errors.New("scan_token_source_unavailable")

type Source struct {
	reader io.Reader
	mu     sync.Mutex
}

var _ ports.ScanTokens = (*Source)(nil)

// New injects an entropy source. A nil source fails closed.
func New(reader io.Reader) *Source { return &Source{reader: reader} }

// System is the production composition using the operating system random source.
func System() *Source { return New(rand.Reader) }
func (s *Source) NewScanToken() (inventory.ScanToken, error) {
	if s == nil || s.reader == nil {
		return inventory.ScanToken{}, ErrUnavailable
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var raw [32]byte
	if _, err := io.ReadFull(s.reader, raw[:]); err != nil {
		return inventory.ScanToken{}, ErrUnavailable
	}
	token, err := inventory.ParseScanToken(base64.RawURLEncoding.EncodeToString(raw[:]))
	if err != nil {
		return inventory.ScanToken{}, ErrUnavailable
	}
	return token, nil
}
