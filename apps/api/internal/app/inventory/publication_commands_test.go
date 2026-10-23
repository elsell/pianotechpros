package inventory

import (
	"context"
	"errors"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

// publicationMemory is a scoped stateful fake; domain commands run before its
// atomic commit, and simulated persistence/audit failure leaves all state intact.
type publicationMemory struct {
	state   PublicationState
	photos  []domain.PhotoEvidence
	events  []audit.Event
	failure error
}

func (m *publicationMemory) check(actor, dealer, id string) error {
	if m.failure != nil {
		return m.failure
	}
	if actor != "actor" || m.state.Record.ID != id || m.state.Record.DealerID != dealer {
		return ports.ErrNotFound
	}
	return nil
}
func (m *publicationMemory) commit(record domain.Record, pub *domain.Publication, event audit.Event, err error) (PublicationState, error) {
	if err != nil {
		return PublicationState{}, err
	}
	m.state = PublicationState{Record: record, Publication: pub}
	m.events = append(m.events, event)
	return m.state, nil
}
func (m *publicationMemory) GetPublication(_ context.Context, actor, dealer, id string, event audit.Event) (PublicationState, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return PublicationState{}, err
	}
	m.events = append(m.events, event)
	return m.state, nil
}
func (m *publicationMemory) PublishRecord(_ context.Context, actor, dealer, id string, expected int64, event audit.Event) (PublicationState, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return PublicationState{}, err
	}
	record, pub, _, err := m.state.Record.Publish(m.photos, expected, actor, event.OccurredAt)
	return m.commit(record, &pub, event, err)
}
func (m *publicationMemory) UnpublishRecord(_ context.Context, actor, dealer, id string, expected int64, event audit.Event) (PublicationState, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return PublicationState{}, err
	}
	if m.state.Publication == nil {
		return PublicationState{}, domain.ErrNoChange
	}
	record, pub, _, err := m.state.Record.Unpublish(*m.state.Publication, expected, actor, event.OccurredAt)
	return m.commit(record, &pub, event, err)
}
func (m *publicationMemory) TransitionRecord(_ context.Context, actor, dealer, id string, expected int64, status domain.Status, price *domain.Money, reason string, event audit.Event) (PublicationState, error) {
	if err := m.check(actor, dealer, id); err != nil {
		return PublicationState{}, err
	}
	record, _, err := m.state.Record.Transition(status, price, reason, expected, actor, domain.Manual, event.OccurredAt)
	if err != nil {
		return PublicationState{}, err
	}
	pub := m.state.Publication
	if pub != nil {
		next, err := pub.ApplyLifecycle(record)
		if err != nil {
			return PublicationState{}, err
		}
		pub = &next
	}
	return m.commit(record, pub, event, nil)
}
func publicationFixture(t *testing.T) (*Commands, *accessFixture, *publicationMemory) {
	t.Helper()
	c, f, _ := commandFixture()
	record, err := domain.NewDraft("piano", "dealer", "PT-1", f.now)
	if err != nil {
		t.Fatal(err)
	}
	record.Title = "Piano"
	record.Form = domain.Grand
	record.Condition = domain.Used
	record.PrivateNotes = "PRIVATE-NOTES"
	m := &publicationMemory{state: PublicationState{Record: record}, photos: []domain.PhotoEvidence{{ID: "photo", RecordID: "piano", DealerID: "dealer", Ready: true}}}
	c.dependencies.Publications = m
	return c, f, m
}
func TestPublicationCommandsRequireExactOperationPolicy(t *testing.T) {
	for _, operation := range []string{"read", "publish", "unpublish", "lifecycle"} {
		t.Run(operation, func(t *testing.T) {
			invoke := func(c *Commands, credential string) (PublicationState, error) {
				switch operation {
				case "read":
					return c.GetPublication(context.Background(), credential, "dealer", "piano")
				case "publish":
					return c.PublishRecord(context.Background(), credential, "dealer", "piano", 1)
				case "unpublish":
					return c.UnpublishRecord(context.Background(), credential, "dealer", "piano", 1)
				default:
					return c.TransitionRecord(context.Background(), credential, "dealer", "piano", 1, domain.Sold, &domain.Money{MinorUnits: 100, Currency: "USD"}, "")
				}
			}
			c, f, m := publicationFixture(t)
			for _, credential := range []string{"", "malformed", "expired", "wrong-issuer", "wrong-audience", "provider-token"} {
				if _, err := invoke(c, credential); !errors.Is(err, ports.ErrInvalidCredential) {
					t.Fatal("invalid session accepted", err)
				}
			}
			f.deniedBudget = true
			if _, err := invoke(c, "opaque"); !errors.Is(err, ports.ErrRateLimited) {
				t.Fatal("limiter bypass", err)
			}
			f.deniedBudget = false
			permission := "publish_inventory"
			if operation == "read" {
				permission = "view"
			}
			if operation == "lifecycle" {
				permission = "manage_inventory"
			}
			f.permissions[permission] = false
			if _, err := invoke(c, "opaque"); !errors.Is(err, ports.ErrNotFound) {
				t.Fatal("permission bypass", err)
			}
			f.permissions[permission] = true
			f.authorityFailure = errors.New("dependency failure")
			if _, err := invoke(c, "opaque"); err == nil {
				t.Fatal("authority failure ignored")
			}
			f.authorityFailure = nil
			m.failure = ports.ErrNotFound
			before := len(f.events)
			if _, err := invoke(c, "opaque"); !errors.Is(err, ports.ErrNotFound) || len(f.events) != before+1 {
				t.Fatal("repository denial not audited", err)
			}
			m.failure = errors.New("write failure")
			if _, err := invoke(c, "opaque"); err == nil {
				t.Fatal("failed repository returned success")
			}
			if len(m.events) != 0 || m.state.Record.Revision != 1 {
				t.Fatal("denied operation reached commit")
			}
			c.dependencies.Publications = nil
			if _, err := invoke(c, "opaque"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
				t.Fatal("missing repository not closed", err)
			}
		})
	}
}
func TestPublicationCommandsJourneyAndCurrencyValidation(t *testing.T) {
	c, _, m := publicationFixture(t)
	ctx := context.Background()
	for _, revision := range []int64{0, -1, 9007199254740992} {
		if _, err := c.PublishRecord(ctx, "opaque", "dealer", "piano", revision); !errors.Is(err, ports.ErrInvalidArgument) {
			t.Fatal("unsafe revision accepted", err)
		}
	}
	if _, err := c.TransitionRecord(ctx, "opaque", "dealer", "piano", 1, domain.Sold, &domain.Money{MinorUnits: 1, Currency: "ZZZ"}, ""); !errors.Is(err, ports.ErrInvalidArgument) {
		t.Fatal("unsupported sale currency", err)
	}
	state, err := c.PublishRecord(ctx, "opaque", "dealer", "piano", 1)
	if err != nil || state.Record.Revision != 2 {
		t.Fatal(err)
	}
	if _, err := c.PublishRecord(ctx, "opaque", "dealer", "piano", 1); !errors.Is(err, ports.ErrConflict) {
		t.Fatal("stale revision accepted", err)
	}
	state, err = c.TransitionRecord(ctx, "opaque", "dealer", "piano", 2, domain.Sold, &domain.Money{MinorUnits: 100, Currency: "USD"}, "")
	if err != nil || state.Record.Status != domain.Sold {
		t.Fatal(err)
	}
	state, err = c.UnpublishRecord(ctx, "opaque", "dealer", "piano", 3)
	if err != nil || state.Publication.State().Visible {
		t.Fatal(err)
	}
	state, err = c.GetPublication(ctx, "opaque", "dealer", "piano")
	if err != nil || state.Record.Revision != 4 {
		t.Fatal(err)
	}
	if len(m.events) != 4 || m.events[3].Action != audit.ResourceViewed {
		t.Fatal("wrong audit sequence")
	}
	for _, event := range m.events {
		if event.ActorUserID != "actor" || event.OwnerUserID != "owner" || event.TargetID != "piano" {
			t.Fatal("wrong audit scope")
		}
	}
}
