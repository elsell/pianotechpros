package spicedb

import (
	"context"
	"flag"
	"github.com/google/uuid"
	"testing"
	"time"
)

var (
	liveEndpoint = flag.String("spicedb-endpoint", "", "SpiceDB integration test endpoint")
	liveToken    = flag.String("spicedb-token", "", "SpiceDB integration test token")
	liveInsecure = flag.Bool("spicedb-insecure", false, "use plaintext transport for the SpiceDB integration test")
)

func TestRuntimeCredentialReadsRequiredSchemaButCannotRewriteIt(t *testing.T) {
	if *liveEndpoint == "" {
		t.Skip("-spicedb-endpoint is required for live SpiceDB integration")
	}
	authorizer, err := New(*liveEndpoint, *liveToken, *liveInsecure)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := authorizer.Health(ctx); err != nil {
		t.Fatalf("required schema was not healthy: %v", err)
	}
	if err := authorizer.WriteSchema(ctx, "definition user {}"); err == nil {
		t.Fatal("runtime credential rewrote the authorization schema")
	}
}

func TestDealerRolePermissionsAndRevocation(t *testing.T) {
	if *liveEndpoint == "" {
		t.Skip("-spicedb-endpoint is required for live SpiceDB integration")
	}
	a, err := New(*liveEndpoint, *liveToken, *liveInsecure)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	dealerID := "dealer-" + uuid.NewString()
	otherID := "dealer-" + uuid.NewString()
	permissions := []string{"view", "manage_profile", "manage_members", "manage_inventory", "publish_inventory", "manage_inquiries"}
	for _, role := range []string{"owner", "editor", "viewer"} {
		t.Run(role, func(t *testing.T) {
			user := uuid.NewString()
			if err := a.WriteRelationship(ctx, "dealer", dealerID, role, "user", user); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := a.DeleteRelationship(cleanup, "dealer", dealerID, role, "user", user); err != nil {
					t.Error(err)
				}
			})
			for _, permission := range permissions {
				want := role == "owner" || permission == "view" || (role == "editor" && permission != "manage_profile" && permission != "manage_members")
				got, err := a.Check(ctx, "dealer", dealerID, permission, user)
				if err != nil || got != want {
					t.Fatalf("%s: got %v, %v; want %v", permission, got, err, want)
				}
				if got, err := a.Check(ctx, "dealer", otherID, permission, user); err != nil || got {
					t.Fatalf("cross-dealer %s: %v, %v", permission, got, err)
				}
			}
			if err := a.DeleteRelationship(ctx, "dealer", dealerID, role, "user", user); err != nil {
				t.Fatal(err)
			}
			for _, permission := range permissions {
				if got, err := a.Check(ctx, "dealer", dealerID, permission, user); err != nil || got {
					t.Fatalf("revoked %s: %v, %v", permission, got, err)
				}
			}
		})
	}
	user := uuid.NewString()
	if err := a.WriteRelationship(ctx, "resource", dealerID, "owner", "user", user); err != nil {
		t.Fatal(err)
	}
	defer a.DeleteRelationship(ctx, "resource", dealerID, "owner", "user", user)
	if got, err := a.Check(ctx, "dealer", dealerID, "view", user); err != nil || got {
		t.Fatalf("generic resource ownership leaked into dealer access: %v, %v", got, err)
	}
}

func TestCustomerOwnershipPermissionsAndRevocation(t *testing.T) {
	if *liveEndpoint == "" {
		t.Skip("-spicedb-endpoint is required")
	}
	a, err := New(*liveEndpoint, *liveToken, *liveInsecure)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	id, other, owner, stranger := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	if err := a.WriteRelationship(ctx, "customer", id, "owner", "user", owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := a.DeleteRelationship(cleanup, "customer", id, "owner", "user", owner); err != nil {
			t.Error(err)
		}
	})
	for _, permission := range []string{"view", "update"} {
		if allowed, err := a.Check(ctx, "customer", id, permission, owner); err != nil || !allowed {
			t.Fatalf("owner %s: %v %v", permission, allowed, err)
		}
		for _, pair := range [][2]string{{id, stranger}, {other, owner}} {
			if allowed, err := a.Check(ctx, "customer", pair[0], permission, pair[1]); err != nil || allowed {
				t.Fatalf("foreign %s: %v %v", permission, allowed, err)
			}
		}
	}
	if err := a.WriteRelationship(ctx, "dealer", id, "owner", "user", stranger); err != nil {
		t.Fatal(err)
	}
	defer a.DeleteRelationship(ctx, "dealer", id, "owner", "user", stranger)
	if allowed, err := a.Check(ctx, "customer", id, "view", stranger); err != nil || allowed {
		t.Fatalf("dealer ownership granted customer access: %v %v", allowed, err)
	}
	for _, relation := range []string{"editor", "viewer"} {
		if err := a.WriteRelationship(ctx, "customer", id, relation, "user", stranger); err == nil {
			t.Fatalf("unsupported sharing relation accepted: %s", relation)
		}
	}
	if err := a.DeleteRelationship(ctx, "customer", id, "owner", "user", owner); err != nil {
		t.Fatal(err)
	}
	for _, permission := range []string{"view", "update"} {
		if allowed, err := a.Check(ctx, "customer", id, permission, owner); err != nil || allowed {
			t.Fatalf("revoked %s: %v %v", permission, allowed, err)
		}
	}
}
