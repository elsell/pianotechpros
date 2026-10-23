package showroom_test

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/showroom"
)

func dealerFixture(t *testing.T) dealer.Entity {
	t.Helper()
	d, err := dealer.New("dealer", "PRIVATE-OWNER", dealer.Attributes{
		Name: "Piano Shop", Slug: "piano-shop", Email: "shop@example.com", Phone: "+1 555 0100",
		WebsiteUrl: "https://example.com", Tagline: "Fine pianos", Description: "A showroom",
		StreetAddress1: "123 Example Street", StreetAddress2: "Suite 2", City: "Example", Region: "Region", PostalCode: "12345",
		AppointmentNote: "By appointment", DeliveryNote: "Delivery available", WarrantyNote: "Ask about warranty", ServiceNote: "Tuning available",
		BannerAltText: "The showroom", AccentColor: "#123456", ShowroomPublished: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func publicationFixture(t *testing.T, dealerID string, priceVisible bool) (inventory.Record, inventory.Publication) {
	t.Helper()
	r, err := inventory.NewDraft("piano", dealerID, "STOCK-1", time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	r.Title, r.Form, r.Condition = "Published title", inventory.Grand, inventory.Used
	r.Serial, r.PrivateNotes, r.Location = "PRIVATE-SERIAL", "PRIVATE-NOTES", "PRIVATE-LOCATION"
	r.AcquisitionCost = &inventory.Money{MinorUnits: 98765, Currency: "USD"}
	r.AskingPrice = &inventory.Money{MinorUnits: 12345, Currency: "USD"}
	r.PriceVisible = priceVisible
	r.Manufactured = &inventory.ManufacturingDate{Year: 1920}
	next, p, _, err := r.Publish([]inventory.PhotoEvidence{
		{ID: "cover", RecordID: r.ID, DealerID: dealerID, Ready: true, AltText: "Cover"},
		{ID: "detail", RecordID: r.ID, DealerID: dealerID, Ready: true, AltText: "Detail"},
	}, r.Revision, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	return next, p
}

func TestPublishedProfileIsAnExplicitCopy(t *testing.T) {
	d := dealerFixture(t)
	s, err := showroom.New(d)
	if err != nil {
		t.Fatal(err)
	}
	p, err := s.Profile()
	if err != nil {
		t.Fatal(err)
	}
	expected := showroom.Profile{
		ID: "dealer", Name: d.Name, Slug: d.Slug, Email: d.Email, Phone: d.Phone,
		WebsiteURL: d.WebsiteUrl, Tagline: d.Tagline, Description: d.Description,
		StreetAddress1: d.StreetAddress1, StreetAddress2: d.StreetAddress2, City: d.City, Region: d.Region, PostalCode: d.PostalCode,
		AppointmentNote: d.AppointmentNote, DeliveryNote: d.DeliveryNote, WarrantyNote: d.WarrantyNote, ServiceNote: d.ServiceNote,
		BannerAltText: d.BannerAltText, AccentColor: d.AccentColor,
	}
	if !reflect.DeepEqual(p, expected) {
		t.Fatalf("wrong public profile: %#v", p)
	}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"PRIVATE", "Owner", "Revision", "CreatedAt", "UpdatedAt", "ShowroomPublished", "Attributes"} {
		if strings.Contains(string(data), forbidden) {
			t.Fatalf("public profile leaked %s", forbidden)
		}
	}
	d.Name, p.Name = "Private edit", "Consumer edit"
	stable, _ := s.Profile()
	if stable.Name != "Piano Shop" {
		t.Fatal("profile aliases mutable state")
	}
}

func TestProfileVisibilityAndCorruptStorageFailClosed(t *testing.T) {
	d := dealerFixture(t)
	d.ShowroomPublished = false
	if _, err := showroom.New(d); !errors.Is(err, showroom.ErrUnavailable) {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*dealer.Entity){
		"blank ID":        func(d *dealer.Entity) { d.ID = "" },
		"noncanonical ID": func(d *dealer.Entity) { d.ID = " dealer" },
		"control ID":      func(d *dealer.Entity) { d.ID = "dealer\x00" },
		"owner":           func(d *dealer.Entity) { d.OwnerUserID = "" },
		"revision":        func(d *dealer.Entity) { d.Revision = 0 },
		"unsafe revision": func(d *dealer.Entity) { d.Revision = 9007199254740992 },
		"trimmed name":    func(d *dealer.Entity) { d.Name = " Piano Shop" },
		"unsafe website":  func(d *dealer.Entity) { d.WebsiteUrl = "javascript:alert(1)" },
		"slug":            func(d *dealer.Entity) { d.Slug = "../private" },
		"email":           func(d *dealer.Entity) { d.Email = "not-an-email" },
		"invalid UTF8":    func(d *dealer.Entity) { d.Description = string([]byte{0xff}) },
	} {
		t.Run(name, func(t *testing.T) {
			d := dealerFixture(t)
			change(&d)
			if _, err := showroom.New(d); !errors.Is(err, showroom.ErrInvalidProfile) {
				t.Fatalf("accepted corrupt profile: %v", err)
			}
		})
	}
	var zero showroom.Showroom
	if _, err := zero.Profile(); !errors.Is(err, showroom.ErrUnavailable) {
		t.Fatal("zero profile visible")
	}
	_, pub := publicationFixture(t, "dealer", false)
	if _, err := zero.Listing(pub); !errors.Is(err, showroom.ErrUnavailable) {
		t.Fatal("zero showroom exposed listing")
	}
}

func TestListingRequiresBothVisibilityAndDealerScope(t *testing.T) {
	s, _ := showroom.New(dealerFixture(t))
	r, pub := publicationFixture(t, "dealer", false)
	listing, err := s.Listing(pub)
	if err != nil || listing.ID != r.ID || listing.Price != nil {
		t.Fatalf("wrong listing: %v", err)
	}
	data, _ := json.Marshal(listing)
	for _, forbidden := range []string{"PRIVATE", "98765", "12345", "Serial", "PrivateNotes", "AcquisitionCost", "Location", "SalePrice"} {
		if strings.Contains(string(data), forbidden) {
			t.Fatalf("listing leaked %s", forbidden)
		}
	}
	_, foreign := publicationFixture(t, "another-dealer", true)
	_, hidden, _, err := r.Unpublish(pub, r.Revision, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []inventory.Publication{foreign, hidden, {}} {
		if _, err := s.Listing(p); !errors.Is(err, showroom.ErrUnavailable) {
			t.Fatalf("inaccessible listing exposed: %v", err)
		}
		if _, err := s.Photo(p, "cover"); !errors.Is(err, showroom.ErrUnavailable) {
			t.Fatalf("inaccessible photo exposed: %v", err)
		}
	}
}

func TestPublicListingCopiesNestedValuesAndRetainsSaleSnapshot(t *testing.T) {
	s, _ := showroom.New(dealerFixture(t))
	r, pub := publicationFixture(t, "dealer", true)
	draft := r.Attributes
	draft.Title = "PRIVATE-NEW-TITLE"
	edited, _, err := r.Revise(draft, r.Revision, "actor", inventory.Manual, r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	sold, _, err := edited.Transition(inventory.Sold, &inventory.Money{MinorUnits: 10000, Currency: "USD"}, "", edited.Revision, "actor", inventory.Manual, edited.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	pub, err = pub.ApplyLifecycle(sold)
	if err != nil {
		t.Fatal(err)
	}
	first, err := s.Listing(pub)
	if err != nil || first.Status != inventory.Sold || first.Title != "Published title" || first.Price.MinorUnits != 12345 {
		t.Fatalf("sale copied private edits: %#v, %v", first, err)
	}
	first.Price.MinorUnits, first.Manufactured.Year, first.Photos[0].AltText = 1, 2000, "Changed"
	second, _ := s.Listing(pub)
	if second.Price.MinorUnits != 12345 || second.Manufactured.Year != 1920 || second.Photos[0].AltText != "Cover" || second.Photos[1].ID != "detail" {
		t.Fatal("public reads alias")
	}
}

func TestPhotoRequiresCurrentSnapshotMembership(t *testing.T) {
	s, _ := showroom.New(dealerFixture(t))
	r, pub := publicationFixture(t, "dealer", true)
	photo, err := s.Photo(pub, "detail")
	if err != nil || photo.AltText != "Detail" {
		t.Fatal("published photo unavailable")
	}
	for _, id := range []string{"", "unknown", "draft-only", "../detail", " detail"} {
		if _, err := s.Photo(pub, id); !errors.Is(err, showroom.ErrUnavailable) {
			t.Fatalf("exposed %q", id)
		}
	}
	_, replaced, _, err := r.Publish([]inventory.PhotoEvidence{{ID: "new-cover", RecordID: r.ID, DealerID: r.DealerID, Ready: true}}, r.Revision, "actor", r.UpdatedAt)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Photo(replaced, "detail"); !errors.Is(err, showroom.ErrUnavailable) {
		t.Fatal("old snapshot photo exposed after republish")
	}
}
