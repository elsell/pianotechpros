package dealer

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type invitationStore struct {
	*staffStore
	invites  map[string]domain.StaffInvitation
	disabled map[string]bool
}

func (r *invitationStore) CreateStaffInvitation(ctx context.Context, actor string, i domain.StaffInvitation, event audit.Event) error {
	e, err := r.Get(ctx, actor, i.DealerID)
	if err != nil {
		return err
	}
	if e.OwnerUserID != actor {
		return ports.ErrNotFound
	}
	if r.audits.err != nil {
		return r.audits.err
	}
	r.invites[i.ID] = i
	r.audits.events = append(r.audits.events, event)
	return nil
}
func (r *invitationStore) StaffInvitationCandidate(_ context.Context, actor string, dealerID domain.ID, id string, digest [32]byte) (InvitationCandidate, error) {
	if r.err != nil {
		return InvitationCandidate{}, r.err
	}
	i, ok := r.invites[id]
	if !ok || i.DealerID != dealerID || i.TokenDigest != digest || r.disabled[actor] || r.disabled[i.OwnerUserID] || !i.ConsumedAt.IsZero() || !i.RevokedAt.IsZero() {
		return InvitationCandidate{}, domain.ErrInvalidInvitation
	}
	return InvitationCandidate{Invitation: i, DealerName: r.rows[dealerID].Name}, nil
}
func (r *invitationStore) RevokeStaffInvitation(ctx context.Context, actor string, dealerID domain.ID, id string, event audit.Event) error {
	i, ok := r.invites[id]
	if !ok || i.DealerID != dealerID || i.OwnerUserID != actor {
		return ports.ErrNotFound
	}
	next, err := i.Revoke(event.OccurredAt)
	if err != nil {
		return err
	}
	if r.audits.err != nil {
		return r.audits.err
	}
	r.invites[id] = next
	r.audits.events = append(r.audits.events, event)
	return nil
}
func (r *invitationStore) AcceptStaffInvitation(ctx context.Context, actor string, dealerID domain.ID, id string, digest [32]byte, change string, event audit.Event, clock ports.Clock) (domain.Membership, error) {
	candidate, err := r.StaffInvitationCandidate(ctx, actor, dealerID, id, digest)
	if err != nil {
		return domain.Membership{}, err
	}
	i, err := candidate.Invitation.Consume(actor, clock.Now())
	if err != nil {
		return domain.Membership{}, err
	}
	key := domain.MembershipKey(dealerID, actor)
	member, exists := r.staff[key]
	if exists {
		member, err = member.Reactivate(i.Role, clock.Now())
	} else {
		member, err = domain.NewStaffMembership(dealerID, actor, i.Role, clock.Now())
	}
	if err != nil {
		return domain.Membership{}, err
	}
	if r.audits.err != nil {
		return domain.Membership{}, r.audits.err
	}
	r.invites[id] = i
	r.staff[key] = member
	r.changes = append(r.changes, change)
	r.audits.events = append(r.audits.events, event)
	return member, nil
}
func invitationFixture() (*Service, *invitationStore, *readPermissions, *readAudits) {
	s, r, p, a := staffFixture()
	store := &invitationStore{staffStore: r, invites: map[string]domain.StaffInvitation{}, disabled: map[string]bool{}}
	s.Repository = store
	return s, store, p, a
}
func TestInvitationCreatePreviewAcceptAndReplay(t *testing.T) {
	s, r, _, a := invitationFixture()
	ctx := context.Background()
	created, err := s.CreateStaffInvitation(ctx, "Bearer valid", "a", domain.RoleViewer, 0)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := base64.RawURLEncoding.DecodeString(created.Token)
	if err != nil || len(raw) != 32 {
		t.Fatalf("invalid token format: %v", err)
	}
	stored := r.invites[created.Invitation.ID]
	if stored.TokenDigest != sha256.Sum256(raw) {
		t.Fatal("digest differs from disclosed token")
	}
	s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "new-staff", Scopes: []string{"api:user"}}}
	preview, err := s.PreviewStaffInvitation(ctx, "Bearer valid", "a", stored.ID, created.Token)
	if err != nil || preview.DealerName == "" || preview.Role != domain.RoleViewer || len(r.changes) != 0 {
		t.Fatalf("preview: %+v %v", preview, err)
	}
	member, err := s.AcceptStaffInvitation(ctx, "Bearer valid", "a", stored.ID, created.Token)
	if err != nil || member.Allows(domain.View) || member.UserID != "new-staff" || len(r.changes) != 1 {
		t.Fatalf("accept: %+v %v", member, err)
	}
	if _, err := s.AcceptStaffInvitation(ctx, "Bearer valid", "a", stored.ID, created.Token); !errors.Is(err, domain.ErrInvalidInvitation) {
		t.Fatalf("replay: %v", err)
	}
	for _, event := range a.events {
		if strings.Contains(event.TargetID, created.Token) {
			t.Fatal("token in audit")
		}
	}
}
func TestInvitationTokenOperationsFailClosed(t *testing.T) {
	for _, operation := range []string{"preview", "accept"} {
		for _, scenario := range []string{"malformed", "padded", "expired", "wrong-dealer", "revoked", "issuer-disabled", "permission-denied", "permission-failure", "audit-failure", "missing-session", "rate-limit"} {
			t.Run(operation+"/"+scenario, func(t *testing.T) {
				s, r, p, a := invitationFixture()
				ctx := context.Background()
				created, err := s.CreateStaffInvitation(ctx, "Bearer valid", "a", domain.RoleViewer, 1)
				if err != nil {
					t.Fatal(err)
				}
				a.events = nil
				s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "new-staff", Scopes: []string{"api:user"}}}
				token, dealerID, credential := created.Token, domain.ID("a"), "Bearer valid"
				switch scenario {
				case "malformed":
					token = "bad"
				case "padded":
					token += "="
				case "expired":
					s.Clock = readClock{created.Invitation.ExpiresAt}
				case "wrong-dealer":
					dealerID = "private-other"
				case "revoked":
					i := r.invites[created.Invitation.ID]
					i.RevokedAt = s.Clock.Now()
					r.invites[i.ID] = i
				case "issuer-disabled":
					r.disabled["reader"] = true
				case "permission-denied":
					p.grants = map[string]bool{}
				case "permission-failure":
					p.err = errors.New("unavailable")
				case "audit-failure":
					a.err = errors.New("unavailable")
				case "missing-session":
					credential = ""
				case "rate-limit":
					s.AuditRateLimiter = &readBudget{}
				}
				if operation == "preview" {
					_, err = s.PreviewStaffInvitation(ctx, credential, dealerID, created.Invitation.ID, token)
				} else {
					_, err = s.AcceptStaffInvitation(ctx, credential, dealerID, created.Invitation.ID, token)
				}
				if err == nil || len(r.changes) != 0 || !r.invites[created.Invitation.ID].ConsumedAt.IsZero() {
					t.Fatalf("denied operation committed: %v", err)
				}
				for _, event := range a.events {
					if event.Action != audit.ResourceAccessDenied || event.TargetID != "collection" || event.OwnerUserID != "new-staff" {
						t.Fatalf("denial leaked candidate: %+v", event)
					}
				}
				if scenario != "missing-session" && scenario != "rate-limit" && scenario != "audit-failure" && len(a.events) != 1 {
					t.Fatal("missing denial audit")
				}
			})
		}
	}
}
