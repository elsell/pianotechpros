package config

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

var inquiryHostname = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$`)

func (c Config) validateInquiry() error {
	switch c.InquiryChallengePolicy {
	case "", "disabled":
		if c.TurnstileSecret != "" || c.TurnstileHostname != "" {
			return errors.New("inquiry verifier settings require enabled challenge policy")
		}
	case "enabled":
		if c.TurnstileSecret == "" || len(c.TurnstileSecret) > 4096 || strings.TrimSpace(c.TurnstileSecret) != c.TurnstileSecret || strings.IndexFunc(c.TurnstileSecret, unicode.IsControl) >= 0 || !utf8.ValidString(c.TurnstileSecret) || len(c.TurnstileHostname) > 253 || !inquiryHostname.MatchString(c.TurnstileHostname) {
			return errors.New("enabled inquiry challenge requires secret and hostname")
		}
	default:
		return errors.New("inquiry challenge policy must be enabled or disabled")
	}
	return nil
}
