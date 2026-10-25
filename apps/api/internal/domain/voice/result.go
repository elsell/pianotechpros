package voice

import "errors"

var ErrUnavailable = errors.New("voice_unavailable")
var ErrAudioLimit = errors.New("voice_audio_limit")

type ExtractionResult struct {
	Revision int64
	Proposal Proposal
}
type TranscriptionResult struct {
	Revision   int64
	Transcript string
}
