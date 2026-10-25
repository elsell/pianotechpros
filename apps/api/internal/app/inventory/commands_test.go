package inventory

import (
	"context"
	"errors"
	"fmt"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
)

// recordMemory is a controlled transactional fake: failure commits nothing.
type recordMemory struct {
	rows      map[string]domain.Record
	intents   map[string]string
	histories []domain.History
	events    []audit.Event
	failure   error
}

func (m *recordMemory) CreateDraft(_ context.Context, actor string, d domain.Record, key string, event audit.Event) (domain.Record, bool, error) {
	if m.failure != nil {
		return domain.Record{}, false, m.failure
	}
	intent := actor + "/" + d.DealerID + "/" + key
	if id := m.intents[intent]; id != "" {
		event.Action = audit.ResourceViewed
		event.TargetID = id
		m.events = append(m.events, event)
		return m.rows[id], true, nil
	}
	m.rows[d.ID] = d
	m.intents[intent] = d.ID
	m.events = append(m.events, event)
	return d, false, nil
}
func (m *recordMemory) GetRecord(_ context.Context, actor, dealerID, id string, event audit.Event) (domain.Record, error) {
	if m.failure != nil {
		return domain.Record{}, m.failure
	}
	d, ok := m.rows[id]
	if !ok || d.DealerID != dealerID || actor != "actor" {
		return domain.Record{}, ports.ErrNotFound
	}
	m.events = append(m.events, event)
	return d, nil
}
func (m *recordMemory) ReviseAttributedRecord(_ context.Context, actor, dealerID, id string, expected int64, a domain.Attributes, voiceFields []string, event audit.Event) (domain.Record, error) {
	if m.failure != nil {
		return domain.Record{}, m.failure
	}
	d, ok := m.rows[id]
	if !ok || d.DealerID != dealerID || actor != "actor" {
		return domain.Record{}, ports.ErrNotFound
	}
	next, history, err := d.ReviseAttributed(a, expected, actor, voiceFields, event.OccurredAt)
	if errors.Is(err, domain.ErrConflict) {
		return domain.Record{}, ports.ErrConflict
	}
	if err != nil {
		return domain.Record{}, err
	}
	m.rows[id] = next
	m.histories = append(m.histories, history)
	m.events = append(m.events, event)
	return next, nil
}
func commandFixture() (*Commands, *accessFixture, *recordMemory) {
	_, f := policyFixture()
	m := &recordMemory{rows: map[string]domain.Record{}, intents: map[string]string{}}
	counter := 0
	c := NewCommands(CommandDependencies{SupportedCurrency: supportedCurrency, Access: AccessDependencies{Auth: f, Memberships: f, Authorizer: f, Audits: f, Limiter: f, Clock: f}, Records: m, NewID: func() string { counter++; return fmt.Sprintf("piano-%d", counter) }})
	return c, f, m
}
func TestRecordCommandsCreateRetryReadEdit(t *testing.T) {
	c, f, m := commandFixture()
	ctx := context.Background()
	d, err := c.CreateDraft(ctx, "opaque", "dealer", "idempotency-key-01")
	if err != nil || d.StockNumber != "PT-"+d.ID || d.Revision != 1 {
		t.Fatalf("create %+v %v", d, err)
	}
	retry, err := c.CreateDraft(ctx, "opaque", "dealer", "idempotency-key-01")
	if err != nil || retry.ID != d.ID || len(m.rows) != 1 {
		t.Fatal("retry duplicated draft")
	}
	if !m.events[0].OccurredAt.Equal(d.CreatedAt) || m.events[0].ActorUserID != "actor" || m.events[0].OwnerUserID != "owner" || m.events[1].Action != audit.ResourceViewed {
		t.Fatal("incorrect audit")
	}
	a := d.Attributes
	a.Title = "Grand"
	a.PrivateNotes = "private"
	edited, err := c.EditRecord(ctx, "opaque", "dealer", d.ID, 1, a)
	if err != nil || edited.Revision != 2 {
		t.Fatal(err)
	}
	got, err := c.GetRecord(ctx, "opaque", "dealer", d.ID)
	if err != nil || got.Title != "Grand" {
		t.Fatal(err)
	}
	if _, err := c.EditRecord(ctx, "opaque", "dealer", d.ID, 1, a); !errors.Is(err, ports.ErrConflict) {
		t.Fatal("stale edit permitted")
	}
	if _, err := c.EditRecord(ctx, "opaque", "dealer", d.ID, 2, a); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatalf("no-op error %v", err)
	}
	f.permissions["manage_inventory"] = false
	if _, err := c.EditRecord(ctx, "opaque", "dealer", d.ID, 2, a); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("cached authorization")
	}
}
func TestRecordCommandsFailClosedAndAuditRecheckDenial(t *testing.T) {
	for _, op := range []string{"create", "get", "edit"} {
		t.Run(op, func(t *testing.T) {
			invoke := func(c *Commands, credential string) (domain.Record, error) {
				switch op {
				case "create":
					return c.CreateDraft(context.Background(), credential, "dealer", "idempotency-key-01")
				case "get":
					return c.GetRecord(context.Background(), credential, "dealer", "piano")
				default:
					return c.EditRecord(context.Background(), credential, "dealer", "piano", 1, domain.Attributes{StockNumber: "PT-1"})
				}
			}
			c, f, m := commandFixture()
			if _, err := invoke(c, "provider-token"); !errors.Is(err, ports.ErrInvalidCredential) {
				t.Fatal("unauthenticated access")
			}
			f.deniedBudget = true
			if _, err := invoke(c, "opaque"); !errors.Is(err, ports.ErrRateLimited) || len(m.events) != 0 {
				t.Fatal("limiter bypass")
			}
			f.deniedBudget = false
			m.failure = ports.ErrNotFound
			if got, err := invoke(c, "opaque"); !errors.Is(err, ports.ErrNotFound) || got.ID != "" || len(f.events) != 1 || f.events[0].TargetID != "inventory" {
				t.Fatal("missing safe recheck denial audit")
			}
			f.auditFailure = errors.New("audit unavailable")
			if _, err := invoke(c, "opaque"); !errors.Is(err, f.auditFailure) {
				t.Fatal("denial audit failed open")
			}
			m.failure = errors.New("database unavailable")
			if got, err := invoke(c, "opaque"); !errors.Is(err, m.failure) || got.ID != "" {
				t.Fatal("repository failed open")
			}
		})
	}
}

func TestRecordCommandInputsAndMissingDependencies(t *testing.T) {
	c, _, m := commandFixture()
	ctx := context.Background()
	for _, key := range []string{"", "short", "idempotency-key-\n01"} {
		if _, err := c.CreateDraft(ctx, "opaque", "dealer", key); !errors.Is(err, ports.ErrInvalidArgument) {
			t.Fatalf("key accepted: %q", key)
		}
	}
	if len(m.rows) != 0 || len(m.events) != 0 {
		t.Fatal("invalid input persisted")
	}
	c.dependencies.NewID = func() string { return "bad\nidentifier" }
	if _, err := c.CreateDraft(ctx, "opaque", "dealer", "idempotency-key-01"); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal("invalid generated ID")
	}
	c.dependencies.NewID = nil
	if _, err := c.CreateDraft(ctx, "opaque", "dealer", "idempotency-key-01"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal("missing ID dependency")
	}
	c.dependencies.Records = nil
	if _, err := c.GetRecord(ctx, "invalid", "dealer", "piano"); !errors.Is(err, ports.ErrInvalidCredential) {
		t.Fatal("configuration skipped authentication")
	}
	if _, err := c.GetRecord(ctx, "opaque", "dealer", "piano"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal("missing repository")
	}
	c, _, _ = commandFixture()
	if _, err := c.GetRecord(ctx, "opaque", "dealer", " "); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal("invalid record ID")
	}
	for _, revision := range []int64{0, -1, 9007199254740992} {
		if _, err := c.EditRecord(ctx, "opaque", "dealer", "piano", revision, domain.Attributes{}); !errors.Is(err, ports.ErrInvalidArgument) {
			t.Fatal("invalid revision")
		}
	}
	empty := NewCommands(CommandDependencies{})
	if _, err := empty.GetRecord(ctx, "opaque", "dealer", "piano"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal("unconfigured service")
	}
}

func TestInventoryConfiguredCurrencyPolicy(t *testing.T) {
	for _, code := range []string{"USD", "CAD", "EUR", "GBP", "AUD", "NZD", "JPY", "CHF"} {
		if !supportedCurrency(code) {
			t.Fatalf("configured currency rejected: %s", code)
		}
	}
	for _, code := range []string{"", "usd", "ZZZ", "US", "USDD"} {
		if supportedCurrency(code) {
			t.Fatalf("unsupported currency accepted: %s", code)
		}
	}
	c, _, _ := commandFixture()
	c.dependencies.SupportedCurrency = nil
	if _, err := c.GetRecord(context.Background(), "opaque", "dealer", "piano"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal("missing currency policy failed open")
	}
}
