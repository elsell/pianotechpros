package dealer

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

const cursorContext = "pianotechpros/dealer-cursor/v1"

// Seal the shared validated cursor envelope because a continuation may refer to
// an unauthorized candidate. A signature alone would expose its identifier.
func (s *Service) cursorCipher() (cipher.AEAD, error) {
	if len(s.CursorSigningKey) < 32 {
		return nil, ports.ErrAuthorizationPolicyNotConfigured
	}
	derive := hmac.New(sha256.New, s.CursorSigningKey)
	_, _ = derive.Write([]byte(cursorContext))
	block, err := aes.NewCipher(derive.Sum(nil))
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func (s *Service) encodeCursor(payload shared.CursorPayload) (string, error) {
	envelope, err := shared.EncodeCursor(s.CursorSigningKey, payload)
	if err != nil {
		return "", err
	}
	seal, err := s.cursorCipher()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, seal.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := seal.Seal(nonce, nonce, []byte(envelope), []byte(cursorContext))
	return base64.RawURLEncoding.EncodeToString(ciphertext), nil
}
func (s *Service) decodeCursor(value string) (shared.CursorPayload, error) {
	invalid := shared.CursorPayload{}
	if len(value) > 4096 {
		return invalid, ports.ErrInvalidArgument
	}
	seal, err := s.cursorCipher()
	if err != nil {
		return invalid, err
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) < seal.NonceSize()+seal.Overhead() {
		return invalid, ports.ErrInvalidArgument
	}
	envelope, err := seal.Open(nil, raw[:seal.NonceSize()], raw[seal.NonceSize():], []byte(cursorContext))
	if err != nil {
		return invalid, ports.ErrInvalidArgument
	}
	return shared.DecodeCursor(s.CursorSigningKey, string(envelope))
}
