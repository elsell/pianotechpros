package inventory

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/voice"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

var ErrVoiceUnavailable = errors.New("voice_unavailable")

// VoiceExtractor receives no authorization credential or stored record data.
// Candidates remain untrusted until validated by the application/domain boundary.
type VoiceExtractor interface {
	Extract(context.Context, string) ([]voice.Candidate, error)
}
type VoiceResult struct {
	Revision int64
	Proposal voice.Proposal
}

func (c *Commands) voiceRecord(ctx context.Context, credential, dealerID, id string, expected int64) (Access, error) {
	access, err := c.require(ctx, credential, dealerID, Write)
	if err != nil {
		return Access{}, err
	}
	record, err := c.dependencies.Records.GetRecord(ctx, access.ActorID, dealerID, id, c.event(ctx, access, id, audit.ResourceViewed))
	record, err = c.result(ctx, access, record, err, "inventory.voice_context_viewed")
	if err != nil {
		return Access{}, err
	}
	if record.ID != id || record.DealerID != dealerID {
		return Access{}, ports.ErrNotFound
	}
	if record.Revision != expected {
		return Access{}, ports.ErrConflict
	}
	return access, nil
}

func (c *Commands) ExtractVoice(ctx context.Context, credential, dealerID, id string, expected int64, transcript string) (VoiceResult, error) {
	if err := ctx.Err(); err != nil {
		return VoiceResult{}, err
	}
	if !validID(id) || expected < 1 || expected > 9007199254740991 {
		return VoiceResult{}, ports.ErrInvalidArgument
	}
	access, err := c.voiceRecord(ctx, credential, dealerID, id, expected)
	if err != nil {
		return VoiceResult{}, err
	}
	if c.dependencies.VoiceExtractor == nil {
		return VoiceResult{}, ErrVoiceUnavailable
	}
	transcript = strings.TrimSpace(transcript)
	if transcript == "" || !utf8.ValidString(transcript) || utf8.RuneCountInString(transcript) > 16000 {
		return VoiceResult{}, ports.ErrInvalidArgument
	}
	candidates, err := c.dependencies.VoiceExtractor.Extract(ctx, transcript)
	if ctx.Err() != nil {
		return VoiceResult{}, ctx.Err()
	}
	if err != nil {
		return VoiceResult{}, ErrVoiceUnavailable
	}
	proposal, err := voice.NewProposal(transcript, candidates)
	if err != nil {
		return VoiceResult{}, ErrVoiceUnavailable
	}
	for _, candidate := range proposal.Candidates() {
		if money := candidate.Value.Money; money != nil && !c.dependencies.SupportedCurrency(money.Currency) {
			return VoiceResult{}, ErrVoiceUnavailable
		}
	}
	current, err := c.voiceRecord(ctx, credential, dealerID, id, expected)
	if err != nil {
		return VoiceResult{}, err
	}
	if current.ActorID != access.ActorID || current.OwnerUserID != access.OwnerUserID {
		return VoiceResult{}, ports.ErrInvalidCredential
	}
	if err := ctx.Err(); err != nil {
		return VoiceResult{}, err
	}
	return VoiceResult{Revision: expected, Proposal: proposal}, nil
}

// VoiceTranscriber consumes transient bounded audio; it must not retain it.
type VoiceTranscriber interface {
	Transcribe(context.Context, []byte, string) (string, error)
}
type TranscriptionResult struct {
	Revision   int64
	Transcript string
}

func (c *Commands) TranscribeVoice(ctx context.Context, credential, dealerID, id string, expected int64, audio []byte, mimeType string) (TranscriptionResult, error) {
	if err := ctx.Err(); err != nil {
		return TranscriptionResult{}, err
	}
	if !validID(id) || expected < 1 || expected > 9007199254740991 {
		return TranscriptionResult{}, ports.ErrInvalidArgument
	}
	access, err := c.voiceRecord(ctx, credential, dealerID, id, expected)
	if err != nil {
		return TranscriptionResult{}, err
	}
	if c.dependencies.VoiceTranscriber == nil {
		return TranscriptionResult{}, ErrVoiceUnavailable
	}
	if len(audio) == 0 || len(audio) > 6*1024*1024 || len(mimeType) > 128 {
		return TranscriptionResult{}, ports.ErrInvalidArgument
	}
	transcript, err := c.dependencies.VoiceTranscriber.Transcribe(ctx, audio, mimeType)
	if ctx.Err() != nil {
		return TranscriptionResult{}, ctx.Err()
	}
	if err != nil {
		return TranscriptionResult{}, ErrVoiceUnavailable
	}
	transcript = strings.TrimSpace(transcript)
	if transcript == "" || !utf8.ValidString(transcript) || utf8.RuneCountInString(transcript) > 16000 {
		return TranscriptionResult{}, ErrVoiceUnavailable
	}
	current, err := c.voiceRecord(ctx, credential, dealerID, id, expected)
	if err != nil {
		return TranscriptionResult{}, err
	}
	if current.ActorID != access.ActorID || current.OwnerUserID != access.OwnerUserID {
		return TranscriptionResult{}, ports.ErrInvalidCredential
	}
	if err := ctx.Err(); err != nil {
		return TranscriptionResult{}, err
	}
	return TranscriptionResult{Revision: expected, Transcript: transcript}, nil
}
