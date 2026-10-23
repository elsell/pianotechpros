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
	"time"
)

// listMemory implements the query contract with independent filtering and sorting.
type listMemory struct {
	records []domain.Record
	events  []audit.Event
	failure error
}

func (m *listMemory) ListRecords(_ context.Context, actor, dealer string, q domain.ListQuery, event audit.Event) (domain.Page, error) {
	if m.failure != nil {
		return domain.Page{}, m.failure
	}
	if actor != "actor" || dealer != "dealer" {
		return domain.Page{}, ports.ErrNotFound
	}
	result := []domain.Record{}
	for _, r := range m.records {
		if r.DealerID != dealer || r.CreatedAt.After(q.Snapshot) {
			continue
		}
		if q.Status != "" && r.Status != q.Status || q.Status == "" && !q.IncludeInactive && (r.Status == domain.Sold || r.Status == domain.Archived) {
			continue
		}
		matched := q.Search == ""
		for _, v := range []string{r.StockNumber, r.Title, r.Make, r.Model} {
			matched = matched || strings.Contains(strings.ToLower(v), strings.ToLower(q.Search))
		}
		if !matched {
			continue
		}
		if q.AfterID != "" && (r.Featured && !q.AfterFeatured || r.Featured == q.AfterFeatured && (r.CreatedAt.After(q.AfterCreated) || r.CreatedAt.Equal(q.AfterCreated) && r.ID <= q.AfterID)) {
			continue
		}
		result = append(result, r)
	}
	slices.SortFunc(result, func(a, b domain.Record) int {
		if a.Featured != b.Featured {
			if a.Featured {
				return -1
			}
			return 1
		}
		if n := b.CreatedAt.Compare(a.CreatedAt); n != 0 {
			return n
		}
		return strings.Compare(a.ID, b.ID)
	})
	more := len(result) > q.Limit
	if more {
		result = result[:q.Limit]
	}
	m.events = append(m.events, event)
	return domain.Page{Records: result, HasMore: more}, nil
}
func listFixture() (*Commands, *accessFixture, *listMemory) {
	c, f, _ := commandFixture()
	m := &listMemory{}
	for i, id := range []string{"one", "two", "three"} {
		r, _ := domain.NewDraft(id, "dealer", id, f.now.Add(-time.Duration(i)*time.Second))
		r.Title = "Yamaha"
		r.Featured = i == 2
		m.records = append(m.records, r)
	}
	c.dependencies.Lists = m
	c.dependencies.CursorSigningKey = []byte(strings.Repeat("k", 32))
	return c, f, m
}
func TestInventoryListCursorJourney(t *testing.T) {
	c, _, m := listFixture()
	q := ListInput{Search: "  Yamaha ", Limit: 1}
	rows, next, err := c.listRecords(context.Background(), "opaque", "dealer", q)
	if err != nil || len(rows) != 1 || rows[0].ID != "three" || next == "" {
		t.Fatalf("first %+v %q %v", rows, next, err)
	}
	if strings.Contains(next, "Yamaha") || strings.Contains(next, "three") {
		t.Fatal("cursor reveals query or identifier")
	}
	q.Search = "Yamaha"
	q.Cursor = next
	q.Limit = 2
	rows, next, err = c.listRecords(context.Background(), "opaque", "dealer", q)
	if err != nil || len(rows) != 2 || rows[0].ID != "one" || rows[1].ID != "two" || next != "" {
		t.Fatalf("remainder %+v %q %v", rows, next, err)
	}
	if len(m.events) != 2 || m.events[0].Action != audit.ResourceListed || m.events[0].ActorUserID != "actor" || m.events[0].OwnerUserID != "owner" || m.events[0].TargetID != "dealer" {
		t.Fatal("wrong list audit")
	}
}
func TestInventoryListRejectsChangedFiltersAndTamperedCursors(t *testing.T) {
	for _, change := range []func(*ListInput){func(q *ListInput) { q.Search = "other" }, func(q *ListInput) { q.Status = domain.Sold }, func(q *ListInput) { q.IncludeInactive = true }, func(q *ListInput) { q.Cursor = "invalid" }, func(q *ListInput) { q.Cursor = strings.Repeat("x", 4097) }, func(q *ListInput) { q.Limit = 101 }} {
		c, _, m := listFixture()
		_, cursor, err := c.listRecords(context.Background(), "opaque", "dealer", ListInput{Limit: 1})
		if err != nil {
			t.Fatal(err)
		}
		q := ListInput{Limit: 1, Cursor: cursor}
		change(&q)
		rows, next, err := c.listRecords(context.Background(), "opaque", "dealer", q)
		if !errors.Is(err, ports.ErrInvalidArgument) || len(rows) != 0 || next != "" || len(m.events) != 1 {
			t.Fatalf("bad cursor/filter reached listing %v", err)
		}
	}
}
func TestInventoryListAccessAndFailures(t *testing.T) {
	for _, change := range []func(*Commands, *accessFixture, *listMemory){
		func(_ *Commands, f *accessFixture, _ *listMemory) { f.permissions["view"] = false },
		func(_ *Commands, f *accessFixture, _ *listMemory) { f.account.Membership.Active = false },
		func(_ *Commands, f *accessFixture, _ *listMemory) { f.authorityFailure = errors.New("unavailable") },
		func(_ *Commands, f *accessFixture, _ *listMemory) { f.deniedBudget = true },
		func(c *Commands, _ *accessFixture, _ *listMemory) { c.dependencies.CursorSigningKey = nil },
		func(c *Commands, _ *accessFixture, _ *listMemory) { c.dependencies.Lists = nil },
		func(_ *Commands, _ *accessFixture, m *listMemory) { m.failure = errors.New("audit unavailable") },
	} {
		c, f, m := listFixture()
		change(c, f, m)
		rows, next, err := c.listRecords(context.Background(), "opaque", "dealer", ListInput{})
		if err == nil || len(rows) != 0 || next != "" || len(m.events) != 0 {
			t.Fatal("failed boundary returned data", err)
		}
	}
	c, _, m := listFixture()
	if _, _, err := c.listRecords(context.Background(), "bad", "dealer", ListInput{}); err == nil || len(m.events) != 0 {
		t.Fatal("invalid session accepted")
	}
	c, f, m := listFixture()
	m.failure = ports.ErrNotFound
	if _, _, err := c.listRecords(context.Background(), "opaque", "dealer", ListInput{}); !errors.Is(err, ports.ErrNotFound) || len(f.events) != 1 || f.events[0].TargetID != "inventory" {
		t.Fatal("post-preflight denial not audited", err)
	}
}

func TestInventoryCursorBindingAndAuthenticatedTampering(t *testing.T) {
	c, f, m := listFixture()
	_, cursor, err := c.listRecords(context.Background(), "opaque", "dealer", ListInput{Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	seal, err := c.listCipher()
	if err != nil {
		t.Fatal(err)
	}
	original, err := openListCursor(seal, cursor)
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*listCursor){
		func(p *listCursor) { p.Actor = "another-account" }, func(p *listCursor) { p.Dealer = "another-dealer" },
		func(p *listCursor) { p.Version = 2 }, func(p *listCursor) { p.Query.Snapshot = f.now.Add(time.Hour) },
		func(p *listCursor) { p.Query.AfterCreated = p.Query.Snapshot.Add(time.Hour) },
	} {
		changed := original
		change(&changed)
		foreign, err := sealListCursor(seal, changed)
		if err != nil {
			t.Fatal(err)
		}
		if rows, _, err := c.listRecords(context.Background(), "opaque", "dealer", ListInput{Cursor: foreign}); !errors.Is(err, ports.ErrInvalidArgument) || len(rows) != 0 || len(m.events) != 1 {
			t.Fatal("foreign cursor accepted", err)
		}
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		t.Fatal(err)
	}
	raw[len(raw)-1] ^= 1
	if _, _, err := c.listRecords(context.Background(), "opaque", "dealer", ListInput{Cursor: base64.RawURLEncoding.EncodeToString(raw)}); !errors.Is(err, ports.ErrInvalidArgument) || len(m.events) != 1 {
		t.Fatal("modified authenticated ciphertext accepted", err)
	}
	f.permissions["view"] = false
	if _, _, err := c.listRecords(context.Background(), "opaque", "dealer", ListInput{Cursor: cursor}); !errors.Is(err, ports.ErrNotFound) || len(m.events) != 1 {
		t.Fatal("cursor bypassed revoked permission", err)
	}
}
