package dealer

import (
	"strings"
	"testing"
)

func profile() Attributes {
	return Attributes{Name: "Piano Workshop", Slug: "piano-workshop", Email: "shop@example.com", AccentColor: "#176b5b"}
}

func TestProfileAllowsOptionalFieldsAndTrimsInput(t *testing.T) {
	a := profile()
	a.Name = "  Piano Workshop  "
	a.Phone = "  "
	got, err := New("dealer-id", "owner-id", a)
	if err != nil || got.Name != "Piano Workshop" || got.Phone != "" || got.OwnerUserID != "owner-id" {
		t.Fatalf("optional profile rejected: %+v %v", got, err)
	}
}

func TestProfileRejectsInvalidFields(t *testing.T) {
	cases := map[string]func(*Attributes){
		"empty name":           func(a *Attributes) { a.Name = " " },
		"long unicode name":    func(a *Attributes) { a.Name = strings.Repeat("鍵", 201) },
		"invalid utf8":         func(a *Attributes) { a.Description = string([]byte{0xff}) },
		"uppercase slug":       func(a *Attributes) { a.Slug = "Piano" },
		"leading hyphen":       func(a *Attributes) { a.Slug = "-piano" },
		"repeated hyphen":      func(a *Attributes) { a.Slug = "piano--shop" },
		"long slug":            func(a *Attributes) { a.Slug = strings.Repeat("a", 81) },
		"empty slug":           func(a *Attributes) { a.Slug = "" },
		"display email":        func(a *Attributes) { a.Email = "Shop <shop@example.com>" },
		"invalid email":        func(a *Attributes) { a.Email = "shop" },
		"insecure website":     func(a *Attributes) { a.WebsiteUrl = "http://example.com" },
		"script website":       func(a *Attributes) { a.WebsiteUrl = "javascript:alert(1)" },
		"credentialed website": func(a *Attributes) { a.WebsiteUrl = "https://user:secret@example.com" },
		"no website host":      func(a *Attributes) { a.WebsiteUrl = "https:///page" },
		"accent":               func(a *Attributes) { a.AccentColor = "red" },
		"long phone":           func(a *Attributes) { a.Phone = strings.Repeat("1", 33) },
		"long note":            func(a *Attributes) { a.WarrantyNote = strings.Repeat("a", 2001) },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			a := profile()
			mutate(&a)
			if _, err := New("d", "u", a); err != ErrInvalidFields {
				t.Fatalf("wanted invalid fields, got %v", err)
			}
		})
	}
}

func TestProfilePreservesUnicodeAndWebsite(t *testing.T) {
	a := profile()
	a.Name = strings.Repeat("鍵", 200)
	a.WebsiteUrl = "https://example.com/showroom?q=piano"
	a.ShowroomPublished = true
	got, err := New("d", "u", a)
	if err != nil || got.Attributes != a {
		t.Fatalf("valid profile changed: %+v %v", got, err)
	}
	for _, identity := range [][2]string{{"", "u"}, {"d", ""}, {" ", "u"}} {
		if _, err := New(ID(identity[0]), identity[1], a); err != ErrInvalidFields {
			t.Fatal("empty identity accepted")
		}
	}
}
