package inquiry

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
)

func fixture(t *testing.T) (showroom.Showroom, inventory.Publication) {
	t.Helper()
	d, err := dealer.New("shop", "owner", dealer.Attributes{Name: "Piano Shop", Slug: "piano-shop", Email: "shop@example.com", AccentColor: "#245346"})
	if err != nil {
		t.Fatal(err)
	}
	d.ShowroomPublished = true
	s, err := showroom.New(d)
	if err != nil {
		t.Fatal(err)
	}
	p, err := inventory.RestorePublication(inventory.PublicationState{Visible: true, AppliedRevision: 2, Snapshot: inventory.PublicListing{ID: "piano", DealerID: "shop", PublicationRevision: 2, Status: inventory.Available, StockNumber: "P1", Title: "Grand", Form: inventory.Grand, Condition: inventory.Used, Photos: []inventory.PublicPhoto{{ID: "photo", AltText: "Front"}}}})
	if err != nil {
		t.Fatal(err)
	}
	return s, p
}
func TestContactValidation(t *testing.T) {
	valid := Contact{Name: " Buyer ", Email: "buyer@example.com", Message: "Hello\nI would like to visit."}
	got, err := ValidateContact(valid)
	if err != nil || got.Name != "Buyer" || got.Preference != Email {
		t.Fatalf("%+v %v", got, err)
	}
	for _, change := range []func(*Contact){func(c *Contact) { c.Name = "" }, func(c *Contact) { c.Email = "Buyer <buyer@example.com>" }, func(c *Contact) { c.Email = "bad\r\n@example.com" }, func(c *Contact) { c.Message = strings.Repeat("🎹", 4001) }, func(c *Contact) { c.Phone = "\x00" }, func(c *Contact) { c.Name = string([]byte{255}) }, func(c *Contact) { c.Preference = Phone }, func(c *Contact) { c.Preference = "sms" }} {
		bad := valid
		change(&bad)
		if _, err := ValidateContact(bad); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid contact: %v", err)
		}
	}
}
func TestSnapshotAndReadStateAreDefensive(t *testing.T) {
	s, p := fixture(t)
	at := time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)
	entry, err := New("inquiry", s, p, Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Please contact me"}, at)
	if err != nil {
		t.Fatal(err)
	}
	state := entry.State()
	state.Piano.Photos[0].AltText = "modified"
	if entry.State().Piano.Photos[0].AltText != "Front" {
		t.Fatal("snapshot alias")
	}
	next, err := entry.MarkRead("staff", at.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if entry.State().ReadAt != nil || next.State().ReadBy != "staff" || next.State().Revision != 2 {
		t.Fatal("invalid acknowledgment")
	}
	again, err := next.MarkRead("other", at.Add(2*time.Minute))
	if err != nil || again.State().ReadBy != "staff" {
		t.Fatal("replaced first acknowledgment")
	}
	copied := next.State()
	*copied.ReadAt = at
	if !next.State().ReadAt.Equal(at.Add(time.Minute)) {
		t.Fatal("time alias")
	}
	if _, err := entry.MarkRead("staff", at.Add(-time.Second)); !errors.Is(err, ErrInvalid) {
		t.Fatal("accepted backward time")
	}
	if _, err := entry.MarkRead("", at); !errors.Is(err, ErrInvalid) {
		t.Fatal("accepted absent actor")
	}
}
func TestHiddenForeignOrCorruptSnapshotsFailClosed(t *testing.T) {
	s, p := fixture(t)
	at := time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)
	contact := Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Hello"}
	for _, change := range []func(*inventory.PublicationState){func(v *inventory.PublicationState) { v.Visible = false }, func(v *inventory.PublicationState) { v.Snapshot.DealerID = "other" }} {
		state := p.State()
		change(&state)
		other, err := inventory.RestorePublication(state)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := New("inquiry", s, other, contact, at); err == nil {
			t.Fatal("accepted inaccessible listing")
		}
	}
	entry, err := New("inquiry", s, p, contact, at)
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*State){func(v *State) { v.Contact.Name = " Buyer " }, func(v *State) { v.Piano.Title = "" }, func(v *State) { v.ReadBy = "staff" }, func(v *State) { v.Revision = 2 }, func(v *State) { v.ID = "\n" }, func(v *State) { v.CreatedAt = time.Time{} }} {
		state := entry.State()
		change(&state)
		if _, err := Restore(state); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted corrupt state: %v", err)
		}
	}
}

func TestExistingPublicDealerNameRemainsCompatible(t *testing.T) {
	_, p := fixture(t)
	d, err := dealer.New("shop", "owner", dealer.Attributes{Name: "Piano\nShop", Slug: "piano-shop", Email: "shop@example.com", AccentColor: "#245346"})
	if err != nil {
		t.Fatal(err)
	}
	d.ShowroomPublished = true
	s, err := showroom.New(d)
	if err != nil {
		t.Fatal(err)
	}
	entry, err := New("inquiry", s, p, Contact{Name: "Buyer", Email: "buyer@example.com", Message: "Hello"}, time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC))
	if err != nil || entry.State().DealerName != d.Name {
		t.Fatalf("existing public profile rejected: %v", err)
	}
}
