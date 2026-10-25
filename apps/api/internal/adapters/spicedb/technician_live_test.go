package spicedb

import (
	"context"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestTechnicianOwnershipPermissionsAndRevocation(t *testing.T) {
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
	if err := a.WriteRelationship(ctx, "technician", id, "owner", "user", owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := a.DeleteRelationship(cleanup, "technician", id, "owner", "user", owner); err != nil {
			t.Error(err)
		}
	})
	for _, permission := range []string{"view", "update"} {
		if allowed, err := a.Check(ctx, "technician", id, permission, owner); err != nil || !allowed {
			t.Fatalf("owner %s: %v %v", permission, allowed, err)
		}
		for _, pair := range [][2]string{{id, stranger}, {other, owner}} {
			if allowed, err := a.Check(ctx, "technician", pair[0], permission, pair[1]); err != nil || allowed {
				t.Fatalf("foreign %s: %v %v", permission, allowed, err)
			}
		}
	}
	for _, kind := range []string{"dealer", "customer"} {
		if err := a.WriteRelationship(ctx, kind, id, "owner", "user", stranger); err != nil {
			t.Fatal(err)
		}
		defer a.DeleteRelationship(ctx, kind, id, "owner", "user", stranger)
		if allowed, err := a.Check(ctx, "technician", id, "view", stranger); err != nil || allowed {
			t.Fatalf("%s ownership granted technician access: %v %v", kind, allowed, err)
		}
	}
	for _, relation := range []string{"editor", "viewer"} {
		if err := a.WriteRelationship(ctx, "technician", id, relation, "user", stranger); err == nil {
			t.Fatalf("unsupported sharing relation accepted: %s", relation)
		}
	}
	if err := a.DeleteRelationship(ctx, "technician", id, "owner", "user", owner); err != nil {
		t.Fatal(err)
	}
	for _, permission := range []string{"view", "update"} {
		if allowed, err := a.Check(ctx, "technician", id, permission, owner); err != nil || allowed {
			t.Fatalf("revoked %s: %v %v", permission, allowed, err)
		}
	}
}
