package dealer

import (
	"context"
	"errors"
	"sort"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func (r *staffStore) ListStaff(ctx context.Context, actor string, id domain.ID, p StaffPageRequest) (StaffPage, error) {
	e, err := r.Get(ctx, actor, id)
	if err != nil {
		return StaffPage{}, err
	}
	if e.OwnerUserID != actor {
		return StaffPage{}, ports.ErrNotFound
	}
	items := []domain.Membership{}
	for _, m := range r.staff {
		if m.DealerID == id && !m.CreatedAt.After(p.Snapshot) && (p.AfterID == "" || m.CreatedAt.After(p.AfterCreated) || (m.CreatedAt.Equal(p.AfterCreated) && m.UserID > p.AfterID)) {
			items = append(items, m)
		}
	}
	sort.Slice(items, func(a, b int) bool {
		if items[a].CreatedAt.Equal(items[b].CreatedAt) {
			return items[a].UserID < items[b].UserID
		}
		return items[a].CreatedAt.Before(items[b].CreatedAt)
	})
	more := len(items) > p.Limit
	if more {
		items = items[:p.Limit]
	}
	return StaffPage{Items: items, HasMore: more}, nil
}
func (r *invitationStore) ListStaffInvitations(ctx context.Context, actor string, id domain.ID, p StaffPageRequest) (InvitationPage, error) {
	e, err := r.Get(ctx, actor, id)
	if err != nil {
		return InvitationPage{}, err
	}
	if e.OwnerUserID != actor {
		return InvitationPage{}, ports.ErrNotFound
	}
	items := []domain.InvitationSummary{}
	for _, i := range r.invites {
		if i.DealerID == id && !i.CreatedAt.After(p.Snapshot) && (p.AfterID == "" || i.CreatedAt.After(p.AfterCreated) || (i.CreatedAt.Equal(p.AfterCreated) && i.ID > p.AfterID)) {
			items = append(items, domain.InvitationSummary{ID: i.ID, DealerID: i.DealerID, Role: i.Role, CreatedAt: i.CreatedAt, ExpiresAt: i.ExpiresAt, ConsumedBy: i.ConsumedBy, ConsumedAt: i.ConsumedAt, RevokedAt: i.RevokedAt})
		}
	}
	sort.Slice(items, func(a, b int) bool {
		if items[a].CreatedAt.Equal(items[b].CreatedAt) {
			return items[a].ID < items[b].ID
		}
		return items[a].CreatedAt.Before(items[b].CreatedAt)
	})
	more := len(items) > p.Limit
	if more {
		items = items[:p.Limit]
	}
	return InvitationPage{Items: items, HasMore: more}, nil
}
func TestStaffListCursorsBindOwnerDealerAndKind(t *testing.T) {
	s, r, _, a := invitationFixture()
	ctx := context.Background()
	for _, id := range []string{"second", "third"} {
		m, _ := domain.NewStaffMembership("a", id, domain.RoleViewer, s.Clock.Now())
		r.staff[domain.MembershipKey("a", id)] = m
	}
	for n := 0; n < 3; n++ {
		if _, err := s.CreateStaffInvitation(ctx, "Bearer valid", "a", domain.RoleViewer, 72); err != nil {
			t.Fatal(err)
		}
	}
	items, cursor, err := s.ListStaff(ctx, "Bearer valid", "a", "", 1)
	if err != nil || len(items) != 1 || cursor == "" {
		t.Fatalf("first page: %+v %q %v", items, cursor, err)
	}
	next, _, err := s.ListStaff(ctx, "Bearer valid", "a", cursor, 1)
	if err != nil || len(next) != 1 || next[0].UserID == items[0].UserID {
		t.Fatalf("continuation: %+v %v", next, err)
	}
	if _, _, err := s.ListStaffInvitations(ctx, "Bearer valid", "a", cursor, 1); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("cross-kind cursor: %v", err)
	}
	other := r.rows["a"]
	other.ID = "b"
	r.rows["b"] = other
	r.members["reader"]["b"] = true
	// Cursor binding is checked before any candidate read, independently of access.
	if _, _, err := s.ListStaff(ctx, "Bearer valid", "b", cursor, 1); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("cross-dealer cursor: %v", err)
	}
	s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "different", Scopes: []string{"api:user"}}}
	if _, _, err := s.ListStaff(ctx, "Bearer valid", "a", cursor, 1); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("cross-actor cursor: %v", err)
	}
	s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "reader", Scopes: []string{"api:user"}}}
	invites, inviteCursor, err := s.ListStaffInvitations(ctx, "Bearer valid", "a", "", 1)
	if err != nil || len(invites) != 1 || inviteCursor == "" {
		t.Fatalf("invitation page: %+v %v", invites, err)
	}
	s.Clock = readClock{s.Clock.Now().Add(time.Minute)}
	if _, err := s.CreateStaffInvitation(ctx, "Bearer valid", "a", domain.RoleViewer, 72); err != nil {
		t.Fatal(err)
	}
	remainder, _, err := s.ListStaffInvitations(ctx, "Bearer valid", "a", inviteCursor, 100)
	if err != nil || len(remainder) != 2 {
		t.Fatalf("snapshot admitted later invitation: %d %v", len(remainder), err)
	}
	if len(a.events) == 0 || a.events[len(a.events)-1].Action != audit.InvitationListed {
		t.Fatal("missing list audit")
	}
}
func TestStaffListsFailClosed(t *testing.T) {
	for _, kind := range []string{"staff", "invites"} {
		for _, scenario := range []string{"unauthenticated", "local-denied", "non-owner", "permission-denied", "permission-failed", "audit-failed", "rate-limit", "invalid-cursor"} {
			t.Run(kind+"/"+scenario, func(t *testing.T) {
				s, r, p, a := invitationFixture()
				credential := "Bearer valid"
				cursor := ""
				switch scenario {
				case "unauthenticated":
					credential = ""
				case "local-denied":
					delete(r.members["reader"], "a")
				case "non-owner":
					e := r.rows["a"]
					e.OwnerUserID = "different"
					r.rows["a"] = e
				case "permission-denied":
					p.grants = map[string]bool{}
				case "permission-failed":
					p.err = errors.New("unavailable")
				case "audit-failed":
					a.err = errors.New("unavailable")
				case "rate-limit":
					s.AuditRateLimiter = &readBudget{}
				case "invalid-cursor":
					cursor = "bad"
				}
				if kind == "staff" {
					items, next, err := s.ListStaff(context.Background(), credential, "a", cursor, 1)
					if err == nil || len(items) != 0 || next != "" {
						t.Fatalf("failed staff list leaked: %+v %q %v", items, next, err)
					}
				} else {
					items, next, err := s.ListStaffInvitations(context.Background(), credential, "a", cursor, 1)
					if err == nil || len(items) != 0 || next != "" {
						t.Fatalf("failed invite list leaked: %+v %q %v", items, next, err)
					}
				}
			})
		}
	}
}
