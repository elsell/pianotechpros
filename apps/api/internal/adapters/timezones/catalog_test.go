package timezones

import (
	"slices"
	"testing"
)

func TestPinnedCatalogContainsIANANamesWithoutLocalEnvironment(t *testing.T) {
	catalog, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Australia/Sydney", "CET", "GMT", "US/Eastern"} {
		if !catalog.Contains(name) {
			t.Fatalf("missing supported zone %q", name)
		}
	}
	for _, name := range []string{"Local", "localtime", "../UTC", "America//New_York", "America/Unknown", "+01:00", " UTC", "utc"} {
		if catalog.Contains(name) {
			t.Fatalf("unsafe/unknown zone %q", name)
		}
	}
	names := catalog.Names()
	if len(names) < 500 || len(names) > 1000 || !slices.IsSorted(names) {
		t.Fatal("invalid catalog shape")
	}
	original := names[0]
	names[0] = "changed"
	if catalog.Names()[0] != original || !catalog.Contains(original) || catalog.Contains("changed") {
		t.Fatal("caller mutated catalog")
	}
}
func TestCatalogRejectsCorruptedEmbeddedData(t *testing.T) {
	if _, err := parse([]byte("UTC\nUTC\n")); err == nil {
		t.Fatal("unverified catalog accepted")
	}
	var absent *Catalog
	if absent.Contains("UTC") || len(absent.Names()) != 0 {
		t.Fatal("nil catalog grants membership")
	}
}
