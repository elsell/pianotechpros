package inquiry

import (
	"context"
	"errors"
	"sort"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type inboxMemory struct {
	entries map[string]domain.Inquiry
	audits  []audit.Event
	failure error
	calls   int
}

func (m *inboxMemory) read(actor, shop, id string) (domain.Inquiry, error) {
	m.calls++
	if m.failure != nil {
		return domain.Inquiry{}, m.failure
	}
	entry, ok := m.entries[id]
	if actor != "actor" || !ok || entry.State().Piano.DealerID != shop {
		return domain.Inquiry{}, ports.ErrNotFound
	}
	return entry, nil
}
func (m *inboxMemory) GetInboxInquiry(_ context.Context, actor, shop, id string, event audit.Event) (domain.Inquiry, error) {
	entry, err := m.read(actor, shop, id)
	if err == nil {
		m.audits = append(m.audits, event)
	}
	return entry, err
}
func (m *inboxMemory) MarkInboxInquiryRead(_ context.Context, actor, shop, id string, revision int64, event audit.Event) (domain.Inquiry, error) {
	entry, err := m.read(actor, shop, id)
	if err != nil {
		return domain.Inquiry{}, err
	}
	if entry.State().Revision != revision {
		return domain.Inquiry{}, ports.ErrConflict
	}
	entry, err = entry.MarkRead(actor, event.OccurredAt)
	if err != nil {
		return domain.Inquiry{}, err
	}
	m.entries[id] = entry
	m.audits = append(m.audits, event)
	return entry, nil
}
func (m *inboxMemory) ListInboxInquiries(_ context.Context, actor, shop string, q domain.ListQuery, event audit.Event) (domain.Page, error) {
	m.calls++
	if m.failure != nil {
		return domain.Page{}, m.failure
	}
	if actor != "actor" {
		return domain.Page{}, ports.ErrNotFound
	}
	entries := []domain.Inquiry{}
	for _, entry := range m.entries {
		s := entry.State()
		if s.Piano.DealerID != shop || s.CreatedAt.After(q.Snapshot) {
			continue
		}
		if q.AfterID != "" && (s.CreatedAt.After(q.AfterCreated) || s.CreatedAt.Equal(q.AfterCreated) && s.ID >= q.AfterID) {
			continue
		}
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool {
		a, b := entries[i].State(), entries[j].State()
		if a.CreatedAt.Equal(b.CreatedAt) {
			return a.ID > b.ID
		}
		return a.CreatedAt.After(b.CreatedAt)
	})
	more := len(entries) > q.Limit
	if more {
		entries = entries[:q.Limit]
	}
	m.audits = append(m.audits, event)
	return domain.Page{Inquiries: entries, HasMore: more}, nil
}
func inboxFixture(t *testing.T) (*Inbox, *inboxMemory, *inboxAudit) {
	t.Helper()
	at := inboxClock{}.Now()
	entries := map[string]domain.Inquiry{}
	for _, id := range []string{"a", "b", "c"} {
		entry, err := domain.Restore(domain.State{ID: id, DealerName: "Shop", DealerSlug: "shop", Piano: inventory.PublicListing{ID: "piano", DealerID: "shop", PublicationRevision: 2, Status: inventory.Available, StockNumber: "P1", Title: "Piano", Form: inventory.Grand, Condition: inventory.Used, Photos: []inventory.PublicPhoto{{ID: "photo", AltText: "Front"}}}, Contact: domain.Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Visit", Preference: domain.Email}, CreatedAt: at, Revision: 1})
		if err != nil {
			t.Fatal(err)
		}
		entries[id] = entry
	}
	local := &inboxMemberships{entries: map[string]DealerAccess{"shop/actor": {OwnerUserID: "owner", UserActive: true, Membership: dealer.Membership{DealerID: "shop", UserID: "actor", Role: dealer.RoleEditor, Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: at, UpdatedAt: at}}}}
	store := &inboxMemory{entries: entries}
	audits := &inboxAudit{}
	inbox := NewInbox(InboxDependencies{Access: InboxAccessDependencies{Auth: inboxSession{principal: ports.Principal{UserID: "actor", Scopes: []string{"api:user"}}}, Memberships: local, Authorizer: &inboxPermissions{grants: map[string]bool{"dealer:shop#manage_inquiries@actor": true}}, Audits: audits, Limiter: &inboxBudget{remaining: 100}, Clock: inboxClock{}}, Repository: store, CursorSigningKey: []byte(strings.Repeat("k", 32))})
	return inbox, store, audits
}
func TestInboxReadAndMarkUseAuditedScopedPort(t *testing.T) {
	inbox, store, decisions := inboxFixture(t)
	ctx := context.Background()
	entry, err := inbox.Get(ctx, "session", "shop", "a")
	if err != nil || entry.State().ID != "a" {
		t.Fatal(err)
	}
	entry, err = inbox.MarkRead(ctx, "session", "shop", "a", 1)
	if err != nil || entry.State().ReadBy != "actor" {
		t.Fatal(err)
	}
	if len(store.audits) != 2 {
		t.Fatal("missing operation audit")
	}
	for _, event := range store.audits {
		if !event.Valid() || event.OwnerUserID != "owner" || event.ActorUserID != "actor" || event.TargetType != "inquiry" || event.TargetID != "a" {
			t.Fatal("invalid audit context")
		}
	}
	if _, err := inbox.Get(ctx, "session", "shop", "missing"); !errors.Is(err, ports.ErrNotFound) || len(decisions.events) != 1 {
		t.Fatal("missing inquiry decision not audited", err)
	}
	before := store.calls
	if _, err := inbox.MarkRead(ctx, "session", "shop", "a", 3); !errors.Is(err, ports.ErrInvalidArgument) || store.calls != before {
		t.Fatal("invalid revision reached storage")
	}
}
func TestInboxCursorIsOpaqueAndScoped(t *testing.T) {
	inbox, store, _ := inboxFixture(t)
	ctx := context.Background()
	page, next, err := inbox.List(ctx, "session", "shop", "", 2)
	if err != nil || len(page) != 2 || page[0].State().ID != "c" || page[1].State().ID != "b" || next == "" {
		t.Fatal("first page", err)
	}
	page, end, err := inbox.List(ctx, "session", "shop", next, 2)
	if err != nil || len(page) != 1 || page[0].State().ID != "a" || end != "" {
		t.Fatal("continuation", err)
	}
	before := store.calls
	for _, bad := range []string{next + "!", strings.Repeat("a", 4097), "not-a-cursor"} {
		if _, _, err := inbox.List(ctx, "session", "shop", bad, 2); !errors.Is(err, ports.ErrInvalidArgument) {
			t.Fatal("tampered cursor", err)
		}
	}
	if store.calls != before {
		t.Fatal("invalid cursor reached repository")
	}
	other, otherStore, _ := inboxFixture(t)
	other.dependencies.CursorSigningKey = []byte(strings.Repeat("q", 32))
	if _, _, err := other.List(ctx, "session", "shop", next, 2); !errors.Is(err, ports.ErrInvalidArgument) || otherStore.calls != 0 {
		t.Fatal("foreign cursor accepted")
	}
}
func TestInboxDependenciesAndStoreFailuresFailClosed(t *testing.T) {
	inbox, store, decisions := inboxFixture(t)
	outage := errors.New("storage failure")
	store.failure = outage
	if _, err := inbox.Get(context.Background(), "session", "shop", "a"); !errors.Is(err, outage) {
		t.Fatal(err)
	}
	if len(store.audits) != 0 || len(decisions.events) != 0 {
		t.Fatal("failed read reported as audit success")
	}
	inbox.dependencies.Repository = nil
	if _, err := inbox.Get(context.Background(), "session", "shop", "a"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal(err)
	}
}

func TestInboxCursorRejectsCrossScopeAndFutureSnapshots(t *testing.T) {
	inbox, store, _ := inboxFixture(t)
	seal, err := inbox.cursorCipher()
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*inboxCursor){func(c *inboxCursor) { c.Actor = "other" }, func(c *inboxCursor) { c.Dealer = "other" }, func(c *inboxCursor) { c.Query.Snapshot = c.Query.Snapshot.Add(1) }, func(c *inboxCursor) { c.Query.AfterID = "" }} {
		payload := inboxCursor{Version: 1, Actor: "actor", Dealer: "shop", Query: domain.ListQuery{Limit: 2, Snapshot: inboxClock{}.Now(), AfterCreated: inboxClock{}.Now(), AfterID: "b"}}
		change(&payload)
		cursor, err := sealInboxCursor(seal, payload)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := inbox.List(context.Background(), "session", "shop", cursor, 2); !errors.Is(err, ports.ErrInvalidArgument) {
			t.Fatal("invalid scope/tuple accepted", err)
		}
	}
	if store.calls != 0 {
		t.Fatal("invalid cursor reached repository")
	}
}
