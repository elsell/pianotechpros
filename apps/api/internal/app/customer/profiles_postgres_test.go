package customer_test

import (
	"context"
	"flag"
	"testing"
	"time"

	platformstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
	customerstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/spicedb"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/timezones"
	app "github.com/elsell/pianotechpros/apps/api/internal/app/customer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/customer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var policyDSN = flag.String("customer-database-dsn", "", "isolated customer policy PostgreSQL DSN")
var policyEndpoint = flag.String("customer-spicedb-endpoint", "", "isolated customer runtime proxy endpoint")
var policyToken = flag.String("customer-spicedb-token", "", "isolated customer runtime credential")

type policyClock struct{ instant time.Time }

func (c *policyClock) Now() time.Time { return c.instant }

type policyAuth struct{ actor string }

func (a policyAuth) Authenticate(_ context.Context, credential string) (ports.Principal, error) {
	if credential != "Bearer fixture" {
		return ports.Principal{}, ports.ErrInvalidCredential
	}
	return ports.Principal{UserID: a.actor, Scopes: []string{"api:user"}}, nil
}

type policyBudget struct{}

func (policyBudget) Allow(string, time.Time) bool { return true }
func policyDatabase(t *testing.T, role string) *gorm.DB {
	t.Helper()
	config, err := pgx.ParseConfig(*policyDSN)
	if err != nil {
		t.Fatal(err)
	}
	if role != "" {
		config.RuntimeParams["role"] = role
	}
	sql := stdlib.OpenDB(*config)
	t.Cleanup(func() { _ = sql.Close() })
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sql}), &gorm.Config{TranslateError: true, Logger: logger.Discard})
	if err != nil {
		t.Fatal(err)
	}
	return db
}
func TestCustomerPolicyWithRealPersistenceAndAuthorization(t *testing.T) {
	if *policyDSN == "" || *policyEndpoint == "" {
		t.Skip("isolated PostgreSQL and SpiceDB endpoints are required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	clock := &policyClock{instant: time.Now().UTC()}
	actor := uuid.NewString()
	admin := policyDatabase(t, "")
	user := struct {
		ID, Email, DisplayName, Status string
		CreatedAt, UpdatedAt           time.Time
	}{actor, actor + "@example.invalid", "Customer fixture", "active", clock.instant, clock.instant}
	if err := admin.WithContext(ctx).Table("user_models").Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	runtime := policyDatabase(t, "app")
	store := &platformstore.Store{DB: runtime}
	zones, err := timezones.New()
	if err != nil {
		t.Fatal(err)
	}
	authorizer, err := spicedb.New(*policyEndpoint, *policyToken, true)
	if err != nil {
		t.Fatal(err)
	}
	service := app.NewProfiles(app.Dependencies{Auth: policyAuth{actor}, Authorizer: authorizer, AuthorizationOutbox: store, AuthorizationSerializer: store, Repository: customerstore.New(runtime, zones), Audits: store, AuditRateLimiter: policyBudget{}, Clock: clock, NewID: uuid.NewString, AuthorizationWorker: "customer-policy-fixture", AuthorizationLease: time.Minute}, zones)
	attrs := domain.Attributes{Name: "Customer", Email: "customer@example.invalid", Locations: []domain.Location{{Key: "home", Label: "Home", Street1: "1 Example Street", City: "Example", Region: "NY", PostalCode: "10001", Timezone: "America/New_York"}}}
	key := uuid.NewString()
	created, err := service.CreateProfile(ctx, "Bearer fixture", key, attrs)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := authorizer.DeleteRelationship(cleanup, "customer", string(created.ID), "owner", "user", actor); err != nil {
			t.Error(err)
		}
	})
	got, err := service.GetProfile(ctx, "Bearer fixture")
	if err != nil || got.ID != created.ID {
		t.Fatalf("read: %+v %v", got, err)
	}
	clock.instant = clock.instant.Add(time.Second)
	attrs.Name = "Edited customer"
	saved, err := service.SaveProfile(ctx, "Bearer fixture", 1, attrs)
	if err != nil || saved.Revision != 2 || saved.Name != attrs.Name {
		t.Fatalf("save: %+v %v", saved, err)
	}
	clock.instant = clock.instant.Add(time.Second)
	same, err := service.SaveProfile(ctx, "Bearer fixture", 2, attrs)
	if err != nil || same.Revision != 2 || !same.UpdatedAt.Equal(saved.UpdatedAt) {
		t.Fatalf("no-op: %+v %v", same, err)
	}
	attrs.Name = "Customer"
	replay, err := service.CreateProfile(ctx, "Bearer fixture", key, attrs)
	if err != nil || replay.ID != created.ID || replay.Revision != 2 {
		t.Fatalf("replay: %+v %v", replay, err)
	}
	var events int64
	if err := runtime.Table("audit_event_models").Where("owner_user_id=? AND target_type='customer' AND target_id=?", actor, created.ID).Count(&events).Error; err != nil || events != 6 {
		t.Fatalf("interaction audit count: %d %v", events, err)
	}
	if err := authorizer.DeleteRelationship(ctx, "customer", string(created.ID), "owner", "user", actor); err != nil {
		t.Fatal(err)
	}
	if got, err := service.GetProfile(ctx, "Bearer fixture"); err == nil || got.ID != "" {
		t.Fatalf("revoked read: %+v %v", got, err)
	}
	if got, err := service.CreateProfile(ctx, "Bearer fixture", key, attrs); err == nil || got.ID != "" {
		t.Fatalf("revoked replay: %+v %v", got, err)
	}
	if allowed, err := authorizer.Check(ctx, "customer", string(created.ID), "view", actor); err != nil || allowed {
		t.Fatalf("replay restored permission: %v %v", allowed, err)
	}
}
