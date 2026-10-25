package inventory

import (
	"bytes"
	"context"
	"errors"
	inventorydomain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/voice"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"strings"
	"testing"
)

// extractionFixture is a controlled provider with a completion barrier for
// exercising authority/revision changes while an external request is in flight.
type extractionFixture struct {
	calls      int
	received   string
	candidates []domain.Candidate
	failure    error
	complete   func()
}

func (f *extractionFixture) Extract(_ context.Context, transcript string) ([]domain.Candidate, error) {
	f.calls++
	f.received = transcript
	if f.complete != nil {
		f.complete()
	}
	return f.candidates, f.failure
}
func TestVoiceExtractionAuthorizedAndTransient(t *testing.T) {
	c, _, m := commandFixture()
	ctx := context.Background()
	r, err := c.CreateDraft(ctx, "opaque", "dealer", "voice-request-key")
	if err != nil {
		t.Fatal(err)
	}
	title := "Grand"
	provider := &extractionFixture{candidates: []domain.Candidate{{Field: "title", Value: domain.Value{Text: &title}, Confidence: domain.High, Evidence: "Grand"}}}
	c.dependencies.VoiceExtractor = provider
	result, err := c.ExtractVoice(ctx, "opaque", "dealer", r.ID, 1, "  Grand piano  ")
	if err != nil || result.Revision != 1 || len(result.Proposal.Candidates()) != 1 || provider.received != "Grand piano" {
		t.Fatalf("%+v %v", result, err)
	}
	if m.rows[r.ID].Revision != 1 || m.rows[r.ID].Title != "" || len(m.events) != 3 {
		t.Fatal("extraction mutated record or omitted audited reads")
	}
}
func TestVoiceExtractionRejectsBeforeProvider(t *testing.T) {
	for _, kind := range []string{"unauthenticated", "denied", "other-dealer", "missing", "stale", "empty", "oversize", "invalid-unicode", "rate", "repository", "unconfigured"} {
		t.Run(kind, func(t *testing.T) {
			c, f, m := commandFixture()
			ctx := context.Background()
			r, _ := c.CreateDraft(ctx, "opaque", "dealer", "voice-request-key")
			p := &extractionFixture{}
			c.dependencies.VoiceExtractor = p
			token, dealer, id, transcript, revision := "opaque", "dealer", r.ID, "Grand", int64(1)
			switch kind {
			case "unauthenticated":
				token = "bad"
			case "denied":
				f.permissions["manage_inventory"] = false
			case "other-dealer":
				dealer = "foreign"
			case "missing":
				id = "missing"
			case "stale":
				revision = 2
			case "empty":
				transcript = " "
			case "oversize":
				transcript = strings.Repeat("a", 16001)
			case "invalid-unicode":
				transcript = string([]byte{255})
			case "rate":
				f.deniedBudget = true
			case "repository":
				m.failure = errors.New("database down")
			case "unconfigured":
				c.dependencies.VoiceExtractor = nil
			}
			out, err := c.ExtractVoice(ctx, token, dealer, id, revision, transcript)
			if err == nil || p.calls != 0 || out.Revision != 0 {
				t.Fatalf("unsafe extraction %v %+v calls=%d", err, out, p.calls)
			}
		})
	}
}
func TestVoiceExtractionRechecksAndSanitizes(t *testing.T) {
	for _, kind := range []string{"revoked", "session", "revision", "repository", "authority", "cancelled", "provider", "invalid-candidate", "currency"} {
		t.Run(kind, func(t *testing.T) {
			c, f, m := commandFixture()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			r, _ := c.CreateDraft(ctx, "opaque", "dealer", "voice-request-key")
			p := &extractionFixture{}
			c.dependencies.VoiceExtractor = p
			p.complete = func() {
				switch kind {
				case "revoked":
					f.permissions["manage_inventory"] = false
				case "session":
					f.authFailure = ports.ErrInvalidCredential
				case "revision":
					v := m.rows[r.ID]
					v.Revision++
					m.rows[r.ID] = v
				case "repository":
					m.failure = errors.New("database down")
				case "authority":
					f.authorityFailure = errors.New("permission service down")
				case "cancelled":
					cancel()
				}
			}
			if kind == "provider" {
				p.failure = errors.New("secret transcript provider detail")
			}
			if kind == "invalid-candidate" {
				p.candidates = []domain.Candidate{{Field: "publish"}}
			}
			if kind == "currency" {
				p.candidates = []domain.Candidate{{Field: "asking_price", Value: domain.Value{Money: &inventorydomain.Money{Currency: "KWD", MinorUnits: 100}}, Confidence: domain.High, Evidence: "Grand"}}
			}
			out, err := c.ExtractVoice(ctx, "opaque", "dealer", r.ID, 1, "Grand")
			if err == nil || out.Revision != 0 || len(out.Proposal.Candidates()) != 0 {
				t.Fatalf("unsafe result %+v %v", out, err)
			}
			if kind == "provider" && (err != ErrVoiceUnavailable || strings.Contains(err.Error(), "secret")) {
				t.Fatal("provider failure leaked")
			}
		})
	}
}

type transcriptionFixture struct {
	calls      int
	transcript string
	failure    error
	complete   func()
}

func (f *transcriptionFixture) Transcribe(_ context.Context, audio []byte, mime string) (string, error) {
	f.calls++
	if f.complete != nil {
		f.complete()
	}
	return f.transcript, f.failure
}
func TestVoiceTranscriptionAuthorityAndTransientOutput(t *testing.T) {
	for _, kind := range []string{"success", "unauthenticated", "denied", "oversize", "empty", "revoked", "revision", "cancelled", "provider", "empty-result", "oversize-result", "unconfigured"} {
		t.Run(kind, func(t *testing.T) {
			c, f, m := commandFixture()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			r, _ := c.CreateDraft(ctx, "opaque", "dealer", "voice-request-key")
			p := &transcriptionFixture{transcript: "Grand piano"}
			c.dependencies.VoiceTranscriber = p
			token := "opaque"
			audio := []byte("audio-fixture")
			switch kind {
			case "unauthenticated":
				token = "bad"
			case "denied":
				f.permissions["manage_inventory"] = false
			case "oversize":
				audio = make([]byte, 6*1024*1024+1)
			case "empty":
				audio = nil
			case "provider":
				p.failure = errors.New("private provider details")
			case "empty-result":
				p.transcript = " "
			case "oversize-result":
				p.transcript = strings.Repeat("x", 16001)
			case "unconfigured":
				c.dependencies.VoiceTranscriber = nil
			}
			p.complete = func() {
				switch kind {
				case "revoked":
					f.permissions["manage_inventory"] = false
				case "revision":
					v := m.rows[r.ID]
					v.Revision++
					m.rows[r.ID] = v
				case "cancelled":
					cancel()
				}
			}
			result, err := c.TranscribeVoice(ctx, token, "dealer", r.ID, 1, bytes.NewReader(audio), "audio/wav")
			if kind == "success" {
				if err != nil || result.Transcript != "Grand piano" || result.Revision != 1 || len(m.events) != 3 || m.rows[r.ID].Revision != 1 {
					t.Fatalf("%+v %v", result, err)
				}
				return
			}
			if err == nil || result.Transcript != "" || result.Revision != 0 {
				t.Fatalf("leaked result %+v %v", result, err)
			}
			if kind == "provider" && err != ErrVoiceUnavailable {
				t.Fatal("raw error")
			}
			switch kind {
			case "unauthenticated", "denied", "empty", "oversize", "unconfigured":
				if p.calls != 0 {
					t.Fatal("unnecessary provider call")
				}
			}
		})
	}
}
