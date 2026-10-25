package dto

type VoiceExtraction struct {
	ExpectedRevision int64  `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
	Transcript       string `json:"transcript" minLength:"1" maxLength:"16000"`
}
type VoiceValue struct {
	Text    *string            `json:"text,omitempty"`
	Boolean *bool              `json:"boolean,omitempty"`
	Money   *Money             `json:"money,omitempty"`
	Date    *ManufacturingDate `json:"date,omitempty"`
}
type VoiceCandidate struct {
	Field      string     `json:"field"`
	Value      VoiceValue `json:"value"`
	Confidence string     `json:"confidence" enum:"high,uncertain"`
	Evidence   string     `json:"evidence"`
}
type VoiceProposal struct {
	Revision   int64            `json:"revision"`
	Transcript string           `json:"transcript"`
	Candidates []VoiceCandidate `json:"candidates" nullable:"false"`
}
type VoiceTranscript struct {
	Revision   int64  `json:"revision"`
	Transcript string `json:"transcript"`
}
