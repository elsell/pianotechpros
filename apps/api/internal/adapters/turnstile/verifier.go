// Package turnstile verifies anonymous inquiry challenges without retaining tokens.
package turnstile

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

var unavailable = errors.New("challenge verification unavailable")
var hostnamePattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$`)

type Verifier struct {
	secret, hostname, endpoint string
	clock                      ports.Clock
	client                     *http.Client
}

func New(secret, hostname string, clock ports.Clock) (*Verifier, error) {
	if secret == "" || strings.TrimSpace(secret) != secret || len(secret) > 4096 || strings.IndexFunc(secret, unicode.IsControl) >= 0 || !utf8.ValidString(secret) || len(hostname) > 253 || !hostnamePattern.MatchString(hostname) || clock == nil {
		return nil, errors.New("invalid challenge verifier configuration")
	}
	return &Verifier{secret: secret, hostname: hostname, clock: clock, endpoint: "https://challenges.cloudflare.com/turnstile/v0/siteverify", client: &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (v *Verifier) Verify(ctx context.Context, token string) (bool, error) {
	if token == "" || len(token) > 2048 || !utf8.ValidString(token) || strings.TrimSpace(token) != token || strings.IndexFunc(token, unicode.IsControl) >= 0 {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	form := url.Values{"secret": {v.secret}, "response": {token}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, v.endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return false, unavailable
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := v.client.Do(request)
	if err != nil {
		return false, unavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return false, unavailable
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 16385))
	if err != nil || len(data) > 16384 {
		return false, unavailable
	}
	var result struct {
		Success   bool     `json:"success"`
		Hostname  string   `json:"hostname"`
		Action    string   `json:"action"`
		Timestamp string   `json:"challenge_ts"`
		Errors    []string `json:"error-codes"`
	}
	if json.Unmarshal(data, &result) != nil {
		return false, unavailable
	}
	for _, code := range result.Errors {
		if result.Success || (code != "invalid-input-response" && code != "missing-input-response" && code != "timeout-or-duplicate") {
			return false, unavailable
		}
	}
	if !result.Success || result.Hostname != v.hostname || result.Action != "inquiry" {
		return false, nil
	}
	at, err := time.Parse(time.RFC3339, result.Timestamp)
	now := v.clock.Now().UTC()
	if err != nil || now.IsZero() || at.Before(now.Add(-5*time.Minute)) || at.After(now.Add(30*time.Second)) {
		return false, nil
	}
	return true, nil
}
