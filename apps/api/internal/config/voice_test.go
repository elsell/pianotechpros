package config

import (
	"strings"
	"testing"
)

func TestVoiceConfigurationIsAllOrNothing(t *testing.T) {
	for _, tc := range []struct {
		c  Config
		ok bool
	}{
		{Config{}, true},
		{Config{GeminiAPIKey: "test-key", VoiceTranscriptionModel: "transcription-model", VoiceExtractionModel: "extraction-model"}, true},
		{Config{GeminiAPIKey: "test-key"}, false},
		{Config{VoiceTranscriptionModel: "model", VoiceExtractionModel: "model"}, false},
		{Config{GeminiAPIKey: "test-key", VoiceTranscriptionModel: "../model", VoiceExtractionModel: "model"}, false},
		{Config{GeminiAPIKey: "private\nkey", VoiceTranscriptionModel: "model", VoiceExtractionModel: "model"}, false},
	} {
		err := tc.c.ValidateVoice()
		if (err == nil) != tc.ok {
			t.Fatalf("unexpected config result %v", err)
		}
		if err != nil && strings.Contains(err.Error(), "private") {
			t.Fatal("secret in config error")
		}
	}
}
