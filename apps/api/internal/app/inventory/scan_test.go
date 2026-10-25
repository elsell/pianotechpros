package inventory

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
	"time"
)

const scanFixtureToken = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"

type scanMemory struct {
	labels  map[string]domain.ScanLabel
	events  []audit.Event
	failure error
}

func (m *scanMemory) EnsureScanLabel(_ context.Context, actor string, candidate domain.ScanLabel, event audit.Event) (domain.ScanLabel, bool, error) {
	if m.failure != nil {
		return domain.ScanLabel{}, false, m.failure
	}
	if actor != "actor" || candidate.DealerID != "dealer" || candidate.RecordID != "piano" {
		return domain.ScanLabel{}, false, ports.ErrNotFound
	}
	prior, exists := m.labels[candidate.RecordID]
	if exists {
		event.Action = audit.ResourceViewed
	} else {
		prior = candidate
		m.labels[candidate.RecordID] = candidate
	}
	m.events = append(m.events, event)
	return prior, exists, nil
}
func (m *scanMemory) ResolveScanLabel(_ context.Context, actor, dealer string, token domain.ScanToken, event audit.Event) (domain.ScanLabel, error) {
	if m.failure != nil {
		return domain.ScanLabel{}, m.failure
	}
	if actor != "actor" || dealer != "dealer" {
		return domain.ScanLabel{}, ports.ErrNotFound
	}
	for _, label := range m.labels {
		if label.Token == token {
			event.TargetID = label.RecordID
			m.events = append(m.events, event)
			return label, nil
		}
	}
	return domain.ScanLabel{}, ports.ErrNotFound
}

type scanSource struct{ failure error }

func (s scanSource) NewScanToken() (domain.ScanToken, error) {
	if s.failure != nil {
		return domain.ScanToken{}, s.failure
	}
	return domain.ParseScanToken(scanFixtureToken)
}
func scanFixture() (*Commands, *accessFixture, *scanMemory) {
	c, f, _ := commandFixture()
	m := &scanMemory{labels: map[string]domain.ScanLabel{}}
	c.dependencies.Scans = m
	c.dependencies.ScanTokens = scanSource{}
	return c, f, m
}
func TestScanApplicationStableIdentityAndFreshPolicy(t *testing.T) {
	c, f, m := scanFixture()
	f.now = f.now.Add(123456789 * time.Nanosecond)
	label, err := c.EnsureScanLabel(context.Background(), "opaque", "dealer", "piano")
	if err != nil || label.Token.Encoded() != scanFixtureToken || label.CreatedAt.Nanosecond() != 123456000 {
		t.Fatal("label failed", err)
	}
	again, err := c.EnsureScanLabel(context.Background(), "opaque", "dealer", "piano")
	if err != nil || again != label {
		t.Fatal("label unstable", err)
	}
	got, err := c.ResolveScanLabel(context.Background(), "opaque", "dealer", scanFixtureToken)
	if err != nil || got != label {
		t.Fatal("resolve failed", err)
	}
	if len(m.events) != 3 || m.events[0].TargetType != "inventory_scan" || m.events[0].OwnerUserID != "owner" || m.events[1].Action != audit.ResourceViewed || m.events[2].TargetID != "piano" {
		t.Fatal("missing scoped audit")
	}
	f.permissions["view"] = false
	if got, err := c.ResolveScanLabel(context.Background(), "opaque", "dealer", scanFixtureToken); err == nil || got.Token.Valid() {
		t.Fatal("token bypassed revocation")
	}
}
func TestScanApplicationFailuresReleaseNothing(t *testing.T) {
	for _, change := range []func(*Commands, *accessFixture, *scanMemory){
		func(c *Commands, f *accessFixture, m *scanMemory) { f.permissions["view"] = false },
		func(c *Commands, f *accessFixture, m *scanMemory) { f.account.Membership.Active = false },
		func(c *Commands, f *accessFixture, m *scanMemory) { f.authorityFailure = errors.New("unavailable") },
		func(c *Commands, f *accessFixture, m *scanMemory) { f.deniedBudget = true },
		func(c *Commands, f *accessFixture, m *scanMemory) { c.dependencies.Scans = nil },
		func(c *Commands, f *accessFixture, m *scanMemory) { m.failure = errors.New("audit unavailable") },
	} {
		c, f, m := scanFixture()
		change(c, f, m)
		if got, err := c.EnsureScanLabel(context.Background(), "opaque", "dealer", "piano"); err == nil || got.Token.Valid() || len(m.events) > 0 {
			t.Fatal("failed ensure exposed label")
		}
		if got, err := c.ResolveScanLabel(context.Background(), "opaque", "dealer", scanFixtureToken); err == nil || got.Token.Valid() || len(m.events) > 0 {
			t.Fatal("failed resolve exposed label")
		}
	}
	c, _, m := scanFixture()
	c.dependencies.ScanTokens = scanSource{failure: errors.New(scanFixtureToken)}
	if got, err := c.EnsureScanLabel(context.Background(), "opaque", "dealer", "piano"); !errors.Is(err, ErrScanUnavailable) || got.Token.Valid() || len(m.events) > 0 {
		t.Fatal("entropy failure not sanitized")
	}
	c, f, m := scanFixture()
	m.failure = ports.ErrNotFound
	if _, err := c.EnsureScanLabel(context.Background(), "opaque", "dealer", "piano"); !errors.Is(err, ports.ErrNotFound) || len(f.events) != 1 {
		t.Fatal("post-preflight denial unaudited", err)
	}
}

func TestScanRejectsMisScopedRepositoryData(t *testing.T) {
	c, _, m := scanFixture()
	label, err := c.EnsureScanLabel(context.Background(), "opaque", "dealer", "piano")
	if err != nil {
		t.Fatal(err)
	}
	label.DealerID = "foreign"
	m.labels["piano"] = label
	if got, err := c.EnsureScanLabel(context.Background(), "opaque", "dealer", "piano"); !errors.Is(err, ErrScanUnavailable) || got.Token.Valid() {
		t.Fatal("mis-scoped label exposed")
	}
	if got, err := c.ResolveScanLabel(context.Background(), "opaque", "dealer", scanFixtureToken); !errors.Is(err, ErrScanUnavailable) || got.Token.Valid() {
		t.Fatal("mis-scoped resolution exposed")
	}
}
