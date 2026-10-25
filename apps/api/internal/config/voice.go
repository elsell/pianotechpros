package config

import (
	"errors"
	"regexp"
)

var voiceKey = regexp.MustCompile(`^[A-Za-z0-9_-]{1,256}$`)
var voiceModel = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

func (c Config) ValidateVoice() error {
	if c.GeminiAPIKey == "" && c.VoiceTranscriptionModel == "" && c.VoiceExtractionModel == "" {
		return nil
	}
	if !voiceKey.MatchString(c.GeminiAPIKey) || !voiceModel.MatchString(c.VoiceTranscriptionModel) || !voiceModel.MatchString(c.VoiceExtractionModel) {
		return errors.New("invalid voice provider configuration")
	}
	return nil
}
