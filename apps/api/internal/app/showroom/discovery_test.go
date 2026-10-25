package showroom

import (
	"context"
	"errors"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type discoveryMemory struct {
	shops    []DiscoveryShop
	catalogs map[string]DiscoveryCatalog
	hidden   map[string]bool
	failure  error
	reads    int
}

func (m *discoveryMemory) ReadPublicDirectory(context.Context) ([]DiscoveryShop, error) {
	m.reads++
	shops := []DiscoveryShop{}
	for _, shop := range m.shops {
		if !m.hidden[shop.Slug] {
			shops = append(shops, shop)
		}
	}
	return shops, m.failure
}
func (m *discoveryMemory) ReadPublicCatalog(_ context.Context, slug string) (DiscoveryCatalog, error) {
	m.reads++
	catalog, ok := m.catalogs[slug]
	if !ok || m.hidden[slug] {
		return DiscoveryCatalog{}, ports.ErrNotFound
	}
	catalog.Pianos = append([]DiscoveryPiano(nil), catalog.Pianos...)
	return catalog, m.failure
}
func discoveryFixture() *discoveryMemory {
	shop := DiscoveryShop{ID: "shop", Slug: "workshop", Name: "Workshop"}
	return &discoveryMemory{shops: []DiscoveryShop{shop}, catalogs: map[string]DiscoveryCatalog{"workshop": {Shop: shop, Pianos: []DiscoveryPiano{{ID: "piano", DealerID: "shop", Title: "Published piano"}}}}, hidden: map[string]bool{}}
}
func TestDiscoveryReadsCurrentPublicProjectionAndClearsFailures(t *testing.T) {
	ctx := context.Background()
	repo := discoveryFixture()
	s := NewDiscovery(repo, nil)
	shops, err := s.Directory(ctx)
	if err != nil || len(shops) != 1 {
		t.Fatalf("directory: %v %v", shops, err)
	}
	catalog, err := s.Catalog(ctx, "workshop")
	if err != nil || len(catalog.Pianos) != 1 || catalog.Pianos[0].Title != "Published piano" {
		t.Fatalf("catalog: %v %v", catalog, err)
	}
	repo.hidden["workshop"] = true
	shops, err = s.Directory(ctx)
	if err != nil || len(shops) != 0 {
		t.Fatal("unpublished shop retained")
	}
	if value, err := s.Catalog(ctx, "workshop"); !errors.Is(err, ports.ErrNotFound) || value.Shop.ID != "" {
		t.Fatal("unpublished catalog retained")
	}
	repo.hidden["workshop"] = false
	repo.failure = errors.New("storage unavailable")
	if value, err := s.Directory(ctx); err == nil || len(value) != 0 {
		t.Fatal("partial directory leaked on failure")
	}
	if value, err := s.Catalog(ctx, "workshop"); err == nil || value.Shop.ID != "" || len(value.Pianos) != 0 {
		t.Fatal("partial catalog leaked on failure")
	}
}
func TestDiscoveryRejectsCorruptScopeDuplicateIdentityAndCapacity(t *testing.T) {
	for _, change := range []func(*discoveryMemory){
		func(m *discoveryMemory) { m.shops = append(m.shops, m.shops[0]) },
		func(m *discoveryMemory) { m.shops[0].Slug = "../private" },
		func(m *discoveryMemory) { m.shops[0].Name = "" },
		func(m *discoveryMemory) { m.shops = make([]DiscoveryShop, DiscoveryLimit+1) },
	} {
		repo := discoveryFixture()
		change(repo)
		if value, err := NewDiscovery(repo, nil).Directory(context.Background()); err == nil || len(value) != 0 {
			t.Fatal("invalid directory accepted")
		}
	}
	for _, change := range []func(*DiscoveryCatalog){
		func(c *DiscoveryCatalog) { c.Shop.Slug = "other" },
		func(c *DiscoveryCatalog) { c.Pianos[0].DealerID = "other" },
		func(c *DiscoveryCatalog) { c.Pianos[0].ID = "../private" },
		func(c *DiscoveryCatalog) { c.Pianos = append(c.Pianos, c.Pianos[0]) },
		func(c *DiscoveryCatalog) { c.Pianos = make([]DiscoveryPiano, DiscoveryLimit+1) },
	} {
		repo := discoveryFixture()
		c := repo.catalogs["workshop"]
		change(&c)
		repo.catalogs["workshop"] = c
		if value, err := NewDiscovery(repo, nil).Catalog(context.Background(), "workshop"); err == nil || value.Shop.ID != "" {
			t.Fatal("invalid catalog accepted")
		}
	}
}
func TestDiscoveryRejectsMissingDependencyAndInvalidSlugBeforeRead(t *testing.T) {
	ctx := context.Background()
	if _, err := NewDiscovery(nil, nil).Directory(ctx); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal(err)
	}
	if _, err := NewDiscovery(nil, nil).Catalog(ctx, "workshop"); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal(err)
	}
	repo := discoveryFixture()
	for _, slug := range []string{"", "../private", "workshop?secret=x", "workshop\n"} {
		if _, err := NewDiscovery(repo, nil).Catalog(ctx, slug); err == nil {
			t.Fatal("invalid slug accepted")
		}
	}
	if repo.reads != 0 {
		t.Fatal("invalid input reached repository")
	}
}
