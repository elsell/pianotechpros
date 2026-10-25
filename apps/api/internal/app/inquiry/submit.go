package inquiry

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/elsell/pianotechpros/apps/api/internal/app/shared"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

var ErrChallenge = errors.New("inquiry_challenge_rejected")

type ChallengePolicy string

const (
	ChallengeEnabled  ChallengePolicy = "enabled"
	ChallengeDisabled ChallengePolicy = "disabled"
)

type SourceLimiter interface {
	Allow(context.Context, string, time.Time) (bool, error)
}
type ChallengeVerifier interface {
	Verify(context.Context, string) (bool, error)
}

// Submission contains no client snapshot, challenge token, source or read state.
// The repository must select and lock current public visibility, construct the
// domain inquiry and commit it in one transaction before returning success.
type Submission struct {
	ID, Slug, PianoID string
	Contact           domain.Contact
	At                time.Time
}
type Repository interface {
	CreatePublicInquiry(context.Context, Submission) error
}
type Dependencies struct {
	Repository      Repository
	Limiter         SourceLimiter
	Challenge       ChallengeVerifier
	ChallengePolicy ChallengePolicy
	Clock           ports.Clock
	NewID           func() string
	Probe           ports.Probe
}
type Request struct {
	Slug, PianoID       string
	Contact             domain.Contact
	Honeypot, Challenge string
}
type Service struct{ d Dependencies }

func New(d Dependencies) *Service { return &Service{d: d} }

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func validID(value string, limit int) bool {
	return value != "" && len(value) <= limit && utf8.ValidString(value) && strings.TrimSpace(value) == value && strings.IndexFunc(value, unicode.IsControl) < 0
}

// source is supplied by the trusted request-source adapter, never request JSON.
func (s *Service) Submit(ctx context.Context, source string, r Request) (err error) {
	d := s.d
	defer func() {
		if d.Probe != nil {
			outcome := "succeeded"
			if err != nil {
				outcome = "failed"
			}
			d.Probe.Observe(ctx, ports.ProbeEvent{Name: "inquiry.submitted", Outcome: outcome, CorrelationID: shared.CorrelationID(ctx)})
		}
	}()
	if d.Repository == nil || d.Limiter == nil || d.Clock == nil || d.NewID == nil || (d.ChallengePolicy != ChallengeEnabled && d.ChallengePolicy != ChallengeDisabled) || (d.ChallengePolicy == ChallengeEnabled && d.Challenge == nil) {
		return ports.ErrAuthorizationPolicyNotConfigured
	}
	if !validID(source, 256) {
		return ports.ErrInvalidArgument
	}
	at := d.Clock.Now().UTC()
	if at.IsZero() || at.Year() < 1 || at.Year() > 9999 {
		return ports.ErrInvalidArgument
	}
	allowed, err := d.Limiter.Allow(ctx, source, at)
	if err != nil {
		return err
	}
	if !allowed {
		return ports.ErrRateLimited
	}
	if len(r.Honeypot) > 256 || !utf8.ValidString(r.Honeypot) {
		return ports.ErrInvalidArgument
	}
	if r.Honeypot != "" {
		return nil
	}
	if len(r.Slug) > 80 || !slugPattern.MatchString(r.Slug) || !validID(r.PianoID, 128) {
		return ports.ErrInvalidArgument
	}
	contact, err := domain.ValidateContact(r.Contact)
	if err != nil {
		return err
	}
	if len(r.Challenge) > 4096 || !utf8.ValidString(r.Challenge) {
		return ports.ErrInvalidArgument
	}
	if d.ChallengePolicy == ChallengeEnabled {
		if !validID(r.Challenge, 4096) {
			return ErrChallenge
		}
		accepted, err := d.Challenge.Verify(ctx, r.Challenge)
		if err != nil {
			return err
		}
		if !accepted {
			return ErrChallenge
		}
	}
	id := d.NewID()
	if !validID(id, 128) {
		return ports.ErrInvalidArgument
	}
	return d.Repository.CreatePublicInquiry(ctx, Submission{ID: id, Slug: r.Slug, PianoID: r.PianoID, Contact: contact, At: at})
}
