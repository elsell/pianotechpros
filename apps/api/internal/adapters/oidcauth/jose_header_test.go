package oidcauth

import (
	"crypto/rand"
	"crypto/rsa"
	"strings"
	"testing"

	"github.com/go-jose/go-jose/v4"
)

func TestJOSERejectsPrivateKeyMaterialInUntrustedHeaders(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []bool{false, true} {
		name := "public"
		embedded := jose.JSONWebKey{Key: &key.PublicKey}
		if private {
			name = "private"
			embedded.Key = key
		}
		t.Run(name, func(t *testing.T) {
			options := (&jose.SignerOptions{}).WithHeader("jwk", embedded)
			signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, options)
			if err != nil {
				t.Fatal(err)
			}
			signed, err := signer.Sign([]byte("synthetic header regression"))
			if err != nil {
				t.Fatal(err)
			}
			compact, err := signed.CompactSerialize()
			if err != nil {
				t.Fatal(err)
			}
			parsed, err := jose.ParseSigned(compact, []jose.SignatureAlgorithm{jose.RS256})
			if private {
				if err == nil || !strings.Contains(err.Error(), "JWK contains private parameters") {
					t.Fatalf("private parameters must be rejected before RSA private-key validation: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			payload, err := parsed.Verify(&key.PublicKey)
			if err != nil || string(payload) != "synthetic header regression" {
				t.Fatalf("legitimate public JWK failed verification: %v", err)
			}
		})
	}
}
