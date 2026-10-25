package config

import "testing"

func TestInquiryConfigurationFailsClosed(t *testing.T) {
	for _, test := range []struct {
		policy, secret, host string
		valid                bool
	}{
		{"", "", "", true}, {"enabled", "secret", "shop.example.com", true}, {"disabled", "", "", true},
		{"enabled", "secret", "https://shop.example.com", false}, {"enabled", "secret\n", "shop.example.com", false},
		{"true", "", "", false}, {"enabled", "", "shop.example.com", false}, {"enabled", "secret", "", false}, {"", "secret", "shop.example.com", false}, {"disabled", "secret", "shop.example.com", false},
	} {
		c := Config{InquiryChallengePolicy: test.policy, TurnstileSecret: test.secret, TurnstileHostname: test.host}
		if err := c.validateInquiry(); (err == nil) != test.valid {
			t.Fatalf("policy %q valid=%v err=%v", test.policy, test.valid, err)
		}
	}
}
