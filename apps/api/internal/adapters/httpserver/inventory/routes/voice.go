package routes

import (
	"context"
	"errors"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/mapper"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/voice"
	"io"
	"net/http"
	"time"
)

type VoiceService interface {
	TranscribeVoice(context.Context, string, string, string, int64, io.Reader, string) (voice.TranscriptionResult, error)
	ExtractVoice(context.Context, string, string, string, int64, string) (voice.ExtractionResult, error)
}
type voiceBodyKey struct{}
type VoiceTranscribeInput struct {
	GetInput
	ExpectedRevision int64  `query:"expectedRevision" required:"true" minimum:"1" maximum:"9007199254740991"`
	ContentType      string `header:"Content-Type" required:"true" maxLength:"128"`
}
type VoiceExtractInput struct {
	GetInput
	Body dto.VoiceExtraction
}
type VoiceTranscriptOutput struct {
	Body struct {
		Data dto.VoiceTranscript `json:"data"`
	}
}
type VoiceProposalOutput struct {
	Body struct {
		Data dto.VoiceProposal `json:"data"`
	}
}

func voiceError(err error) error {
	if errors.Is(err, voice.ErrUnavailable) {
		return huma.Error503ServiceUnavailable("service unavailable")
	}
	if errors.Is(err, voice.ErrAudioLimit) {
		return huma.Error413RequestEntityTooLarge("request too large")
	}
	return shared.MapError(err, true)
}
func RegisterVoice(api huma.API, service VoiceService) {
	base := "/v1/dealers/{dealerID}/inventory/{id}/voice"
	operation := func(id, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: http.MethodPost, Path: base + path, MaxBodyBytes: 128 * 1024, Metadata: map[string]any{"sensitive-input": true}, Security: []map[string][]string{{"oidc": {}}}, Middlewares: huma.Middlewares{func(ctx huma.Context, next func(huma.Context)) {
			ctx.SetHeader("Cache-Control", "no-store")
			ctx.SetHeader("Referrer-Policy", "no-referrer")
			ctx.SetHeader("X-Content-Type-Options", "nosniff")
			_, w := humago.Unwrap(ctx)
			// ResponseController reaches the underlying connection through middleware.
			// In-memory test writers may not implement deadlines.
			if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(90 * time.Second)); err != nil && !errors.Is(err, http.ErrNotSupported) {
				_ = huma.WriteErr(api, ctx, 503, "service unavailable")
				return
			}
			next(ctx)
		}}}
	}
	transcribe := operation("transcribe-inventory-voice", "/transcribe")
	transcribe.RequestBody = &huma.RequestBody{Required: true, Content: map[string]*huma.MediaType{}}
	for _, mediaType := range []string{"audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3"} {
		transcribe.RequestBody.Content[mediaType] = &huma.MediaType{Schema: &huma.Schema{Type: "string", Format: "binary"}}
	}
	transcribe.Middlewares = append(transcribe.Middlewares, func(ctx huma.Context, next func(huma.Context)) {
		next(huma.WithContext(ctx, context.WithValue(ctx.Context(), voiceBodyKey{}, ctx.BodyReader())))
	})
	huma.Register(api, transcribe, func(ctx context.Context, in *VoiceTranscribeInput) (*VoiceTranscriptOutput, error) {
		body, _ := ctx.Value(voiceBodyKey{}).(io.Reader)
		result, err := service.TranscribeVoice(ctx, in.Authorization, in.DealerID, in.ID, in.ExpectedRevision, body, in.ContentType)
		if err != nil {
			return nil, voiceError(err)
		}
		out := &VoiceTranscriptOutput{}
		out.Body.Data = dto.VoiceTranscript{Revision: result.Revision, Transcript: result.Transcript}
		return out, nil
	})
	huma.Register(api, operation("extract-inventory-voice", "/extract"), func(ctx context.Context, in *VoiceExtractInput) (*VoiceProposalOutput, error) {
		result, err := service.ExtractVoice(ctx, in.Authorization, in.DealerID, in.ID, in.Body.ExpectedRevision, in.Body.Transcript)
		if err != nil {
			return nil, voiceError(err)
		}
		out := &VoiceProposalOutput{}
		out.Body.Data = mapper.VoiceProposal(result)
		return out, nil
	})
}
