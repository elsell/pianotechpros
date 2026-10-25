package inventory

import (
	"context"
	"encoding/base64"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"slices"
	"strings"
	"testing"
)

type historyMemory struct {
	entries []domain.History
	events  []audit.Event
	failure error
}

func (m *historyMemory) ListHistory(_ context.Context, actor, dealer, id string, q domain.HistoryQuery, e audit.Event) (domain.HistoryPage, error) {
	if m.failure != nil {
		return domain.HistoryPage{}, m.failure
	}
	if actor != "actor" || dealer != "dealer" || id != "piano" {
		return domain.HistoryPage{}, ports.ErrNotFound
	}
	upper := q.UpperRevision
	if upper == 0 {
		upper = int64(len(m.entries))
	}
	rows := []domain.History{}
	for _, entry := range m.entries {
		if entry.Revision <= upper && (q.BeforeRevision == 0 || entry.Revision < q.BeforeRevision) {
			rows = append(rows, entry)
		}
	}
	slices.SortFunc(rows, func(a, b domain.History) int { return int(b.Revision - a.Revision) })
	more := len(rows) > q.Limit
	if more {
		rows = rows[:q.Limit]
	}
	m.events = append(m.events, e)
	return domain.HistoryPage{Entries: rows, UpperRevision: upper, HasMore: more}, nil
}
func historyFixture() (*Commands, *accessFixture, *historyMemory) {
	c, f, _ := commandFixture()
	m := &historyMemory{}
	for i := int64(1); i <= 3; i++ {
		m.entries = append(m.entries, domain.History{RecordID: "piano", DealerID: "dealer", ActorID: "actor", Revision: i, Kind: "attributes", Source: domain.Manual, Fields: []string{"make"}, At: f.now})
	}
	c.dependencies.History = m
	c.dependencies.CursorSigningKey = []byte(strings.Repeat("k", 32))
	return c, f, m
}
func TestHistoryCursorBoundedJourney(t *testing.T) {
	c, _, m := historyFixture()
	rows, next, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", "", 1)
	if err != nil || len(rows) != 1 || rows[0].Revision != 3 || next == "" {
		t.Fatal(rows, next, err)
	}
	m.entries = append(m.entries, domain.History{RecordID: "piano", DealerID: "dealer", Revision: 4})
	rows, next, err = c.ListHistory(context.Background(), "opaque", "dealer", "piano", next, 2)
	if err != nil || len(rows) != 2 || rows[0].Revision != 2 || rows[1].Revision != 1 || next != "" {
		t.Fatal(rows, next, err)
	}
	if len(m.events) != 2 || m.events[0].TargetID != "piano" || m.events[0].Action != audit.ResourceListed || m.events[0].OwnerUserID != "owner" {
		t.Fatal("history read not audited")
	}
}
func TestHistoryCursorAndAuthorityFailures(t *testing.T) {
	for _, change := range []func(*Commands, *accessFixture, *historyMemory){
		func(c *Commands, f *accessFixture, m *historyMemory) { f.permissions["view"] = false },
		func(c *Commands, f *accessFixture, m *historyMemory) { f.account.Membership.Active = false },
		func(c *Commands, f *accessFixture, m *historyMemory) { f.authorityFailure = errors.New("unavailable") },
		func(c *Commands, f *accessFixture, m *historyMemory) { f.deniedBudget = true },
		func(c *Commands, f *accessFixture, m *historyMemory) { c.dependencies.History = nil },
		func(c *Commands, f *accessFixture, m *historyMemory) { c.dependencies.CursorSigningKey = nil },
		func(c *Commands, f *accessFixture, m *historyMemory) { m.failure = errors.New("audit unavailable") },
	} {
		c, f, m := historyFixture()
		change(c, f, m)
		if rows, next, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", "", 20); err == nil || len(rows) != 0 || next != "" || len(m.events) != 0 {
			t.Fatal("failed boundary returned data", err)
		}
	}
	c, f, m := historyFixture()
	_, next, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, args := range [][4]string{{"bad", "dealer", "piano", ""}, {"opaque", "dealer", "piano", "tampered"}, {"opaque", "dealer", "other", next}, {"opaque", "dealer", "piano", strings.Repeat("a", 4097)}} {
		if rows, _, err := c.ListHistory(context.Background(), args[0], args[1], args[2], args[3], 1); err == nil || len(rows) != 0 || len(m.events) != 1 {
			t.Fatal("bad request read history", err)
		}
	}
	f.permissions["view"] = false
	if _, _, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", next, 1); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("cursor bypassed revocation", err)
	}
	c, f, m = historyFixture()
	m.failure = ports.ErrNotFound
	if _, _, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", "", 1); !errors.Is(err, ports.ErrNotFound) || len(f.events) != 1 {
		t.Fatal("post-preflight denial not audited", err)
	}
}

func TestHistoryCursorIdentityAndCiphertextIntegrity(t *testing.T) {
	c, _, memory := historyFixture()
	_, cursor, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	seal, err := c.listCipher()
	if err != nil {
		t.Fatal(err)
	}
	original, err := openHistoryCursor(seal, cursor)
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*historyCursor){
		func(p *historyCursor) { p.Actor = "other" }, func(p *historyCursor) { p.Dealer = "other" }, func(p *historyCursor) { p.Record = "other" },
		func(p *historyCursor) { p.Version = 2 }, func(p *historyCursor) { p.Before = 0 }, func(p *historyCursor) { p.Before = p.Upper + 1 }, func(p *historyCursor) { p.Upper = 9007199254740992 },
	} {
		payload := original
		change(&payload)
		value, err := sealHistoryCursor(seal, payload)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", value, 1); !errors.Is(err, ports.ErrInvalidArgument) {
			t.Fatal("bad authenticated payload accepted", err)
		}
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		t.Fatal(err)
	}
	raw[len(raw)-1] ^= 1
	if _, _, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", base64.RawURLEncoding.EncodeToString(raw), 1); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal("modified ciphertext accepted", err)
	}
	list, err := sealListCursor(seal, listCursor{Version: 1, Actor: "actor", Dealer: "dealer"})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := c.ListHistory(context.Background(), "opaque", "dealer", "piano", list, 1); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal("cross-purpose cursor accepted", err)
	}
	if len(memory.events) != 1 {
		t.Fatal("rejected cursor reached repository")
	}
}
