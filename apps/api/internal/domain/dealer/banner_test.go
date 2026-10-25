package dealer

import (
	"strings"
	"testing"
	"time"
)

func TestBannerEvidenceScopeAndPublicProjection(t *testing.T) {
	now := time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)
	b, err := NewBanner("shop", "image", 1600, 900, strings.Repeat("a", 64), now)
	if err != nil || !b.ValidFor("shop") || b.ValidFor("other") {
		t.Fatalf("scoped evidence: %+v %v", b, err)
	}
	p := b.Public()
	if p.ID != "image" || p.Width != 1600 || p.Height != 900 {
		t.Fatalf("public dimensions: %+v", p)
	}
	p.ID = "changed"
	if b.ID != "image" {
		t.Fatal("public projection mutates private evidence")
	}
}

func TestBannerRejectsCorruptEvidence(t *testing.T) {
	now := time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)
	good, _ := NewBanner("shop", "image", 1600, 900, strings.Repeat("a", 64), now)
	cases := []func(*Banner){
		func(b *Banner) { b.ID = "" }, func(b *Banner) { b.ID = " padded" },
		func(b *Banner) { b.ID = "bad\n" }, func(b *Banner) { b.DealerID = "" },
		func(b *Banner) { b.Width = 0 }, func(b *Banner) { b.Height = -1 },
		func(b *Banner) { b.Width = 10001 }, func(b *Banner) { b.Width = 10000; b.Height = 10000 },
		func(b *Banner) { b.SHA256 = strings.Repeat("A", 64) }, func(b *Banner) { b.SHA256 = "secret" },
		func(b *Banner) { b.CreatedAt = time.Time{} },
	}
	for i, change := range cases {
		b := good
		change(&b)
		if b.ValidFor("shop") {
			t.Errorf("accepted corrupt evidence %d", i)
		}
	}
	if (Banner{}).ValidFor("") {
		t.Fatal("absent evidence is not a valid asset")
	}
}

func TestBannerStateRequiresCanonicalScopedProfile(t *testing.T) {
	entity, err := New("shop", "owner", profile())
	if err != nil {
		t.Fatal(err)
	}
	entity.Revision = 1
	state := BannerState{Dealer: entity}
	if !state.ValidFor("shop") || state.ValidFor("other") {
		t.Fatal("invalid absent-banner scope")
	}
	banner, _ := NewBanner("shop", "image", 3, 2, strings.Repeat("a", 64), time.Now())
	state.Banner = &banner
	if !state.ValidFor("shop") {
		t.Fatal("valid current banner rejected")
	}
	for name, change := range map[string]func(*BannerState){
		"revision missing":     func(s *BannerState) { s.Dealer.Revision = 0 },
		"revision overflow":    func(s *BannerState) { s.Dealer.Revision = 9007199254740992 },
		"noncanonical profile": func(s *BannerState) { s.Dealer.Name = " padded " },
		"missing owner":        func(s *BannerState) { s.Dealer.OwnerUserID = "" },
		"foreign asset":        func(s *BannerState) { b := *s.Banner; b.DealerID = "other"; s.Banner = &b },
	} {
		t.Run(name, func(t *testing.T) {
			s := state
			change(&s)
			if s.ValidFor("shop") {
				t.Fatal("corrupt state accepted")
			}
		})
	}
}
