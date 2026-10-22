package inventory

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
	"time"
)

type accessFixture struct {
	principalOverride                                 *ports.Principal
	authFailure                                       error
	now                                               time.Time
	account                                           DealerAccess
	permissions                                       map[string]bool
	events                                            []audit.Event
	deniedBudget                                      bool
	membershipFailure, authorityFailure, auditFailure error
}

func (f *accessFixture) Authenticate(_ context.Context, credential string) (ports.Principal, error) {
	if f.authFailure != nil {
		return ports.Principal{}, f.authFailure
	}
	if credential != "opaque" {
		return ports.Principal{}, ports.ErrInvalidCredential
	}
	if f.principalOverride != nil {
		return *f.principalOverride, nil
	}
	return ports.Principal{UserID: "actor", Scopes: []string{"api:user"}}, nil
}
func (f *accessFixture) DealerAccess(_ context.Context, actor, id string) (DealerAccess, error) {
	if f.membershipFailure != nil {
		return DealerAccess{}, f.membershipFailure
	}
	if actor != "actor" || id != "dealer" {
		return DealerAccess{}, ports.ErrNotFound
	}
	return f.account, nil
}
func (f *accessFixture) Check(_ context.Context, kind, id, permission, actor string) (bool, error) {
	if f.authorityFailure != nil {
		return false, f.authorityFailure
	}
	return kind == "dealer" && id == "dealer" && actor == "actor" && f.permissions[permission], nil
}
func (f *accessFixture) WriteRelationship(context.Context, string, string, string, string, string) error {
	return errors.New("unused write")
}
func (f *accessFixture) DeleteRelationship(context.Context, string, string, string, string, string) error {
	return errors.New("unused delete")
}
func (f *accessFixture) AppendAuditEvent(_ context.Context, e audit.Event) error {
	if f.auditFailure != nil {
		return f.auditFailure
	}
	f.events = append(f.events, e)
	return nil
}
func (f *accessFixture) Allow(string, time.Time) bool { return !f.deniedBudget }
func (f *accessFixture) Now() time.Time               { return f.now }
func policyFixture() (*AccessPolicy, *accessFixture) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	f := &accessFixture{now: now, account: DealerAccess{OwnerUserID: "owner", UserActive: true, Membership: dealer.Membership{DealerID: "dealer", UserID: "actor", Role: dealer.RoleEditor, Active: true, Revision: 2, GrantedRevision: 2, CreatedAt: now, UpdatedAt: now}}, permissions: map[string]bool{"view": true, "manage_inventory": true, "publish_inventory": true}}
	return NewAccessPolicy(AccessDependencies{Auth: f, Memberships: f, Authorizer: f, Audits: f, Limiter: f, Clock: f}), f
}
func TestInventoryRoleAndPermissionIntersection(t *testing.T) {
	for _, role := range []dealer.Role{dealer.RoleOwner, dealer.RoleEditor, dealer.RoleViewer} {
		for _, operation := range []Operation{Read, Write, Publish} {
			p, f := policyFixture()
			f.account.Membership.Role = role
			if role == dealer.RoleOwner {
				f.account.OwnerUserID = "actor"
			}
			grant, err := p.Require(context.Background(), "opaque", "dealer", operation)
			allowed := role != dealer.RoleViewer || operation == Read
			if allowed {
				if err != nil || grant.ActorID != "actor" || grant.OwnerUserID != f.account.OwnerUserID {
					t.Fatalf("legitimate access denied: %s %s %v", role, operation, err)
				}
			} else if !errors.Is(err, ports.ErrNotFound) || len(f.events) != 1 {
				t.Fatal("viewer granted write")
			}
		}
	}
	p, f := policyFixture()
	f.permissions["view"] = false
	if _, err := p.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, ports.ErrNotFound) || len(f.events) != 1 {
		t.Fatal("local role bypassed remote denial")
	}
}
func TestInventoryDenialsAndDependencyFailures(t *testing.T) {
	cases := []func(*accessFixture){func(f *accessFixture) { f.account.UserActive = false }, func(f *accessFixture) { f.account.Membership.Active = false }, func(f *accessFixture) { f.account.Membership.GrantedRevision = 1 }, func(f *accessFixture) { f.account.Membership.UserID = "other" }, func(f *accessFixture) { f.account.Membership.DealerID = "other" }, func(f *accessFixture) { f.account.Membership.Role = dealer.RoleOwner }}
	for _, change := range cases {
		p, f := policyFixture()
		change(f)
		if _, err := p.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, ports.ErrNotFound) || len(f.events) != 1 {
			t.Fatal("local boundary bypass")
		}
	}
	failure := errors.New("unavailable")
	for _, change := range []func(*accessFixture){func(f *accessFixture) { f.membershipFailure = failure }, func(f *accessFixture) { f.authorityFailure = failure }} {
		p, f := policyFixture()
		change(f)
		if _, err := p.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, failure) || len(f.events) != 1 || f.events[0].Outcome != audit.Failed {
			t.Fatal("dependency failure did not fail closed")
		}
	}
	p, f := policyFixture()
	f.permissions["view"] = false
	f.auditFailure = failure
	if _, err := p.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, failure) {
		t.Fatal("audit failure ignored")
	}
}
func TestInventoryAuthenticationLimiterAndAuditSafety(t *testing.T) {
	p, f := policyFixture()
	if _, err := p.Require(context.Background(), "bad-token", "dealer", Read); !errors.Is(err, ports.ErrInvalidCredential) || len(f.events) != 0 {
		t.Fatal("invalid credential accepted or audited unsafely")
	}
	f.deniedBudget = true
	if _, err := p.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, ports.ErrRateLimited) || len(f.events) != 0 {
		t.Fatal("unbounded audit writes")
	}
	f.deniedBudget = false
	if _, err := p.Require(context.Background(), "opaque", "other-dealer", Read); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("cross-dealer access")
	}
	e := f.events[0]
	if e.TargetID != "inventory" || e.OwnerUserID != "actor" || e.ActorUserID != "actor" || !e.Valid() {
		t.Fatalf("unsafe audit: %+v", e)
	}
	missing := NewAccessPolicy(AccessDependencies{Auth: f})
	if _, err := missing.Require(context.Background(), "bad-token", "dealer", Read); !errors.Is(err, ports.ErrInvalidCredential) {
		t.Fatal("did not authenticate first")
	}
	if _, err := missing.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, ports.ErrAuthorizationPolicyNotConfigured) {
		t.Fatal("missing dependencies allowed")
	}
}

func TestInventoryScopesAndExactPermissions(t *testing.T) {
	for _, principal := range []ports.Principal{{UserID: "actor"}, {UserID: "actor", Scopes: []string{"other"}}, {UserID: "\nactor", Scopes: []string{"api:user"}}} {
		p, f := policyFixture()
		f.principalOverride = &principal
		if _, err := p.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, ports.ErrInvalidCredential) || len(f.events) != 0 {
			t.Fatal("invalid session authority accepted")
		}
	}
	for operation, permission := range map[Operation]string{Read: "view", Write: "manage_inventory", Publish: "publish_inventory"} {
		p, f := policyFixture()
		f.permissions = map[string]bool{permission: true}
		if _, err := p.Require(context.Background(), "opaque", "dealer", operation); err != nil {
			t.Fatalf("wrong permission for %s: %v", operation, err)
		}
		f.permissions[permission] = false
		if _, err := p.Require(context.Background(), "opaque", "dealer", operation); !errors.Is(err, ports.ErrNotFound) {
			t.Fatal("remote denial bypassed")
		}
	}
	p, f := policyFixture()
	failure := errors.New("auth unavailable")
	f.authFailure = failure
	if _, err := p.Require(context.Background(), "opaque", "dealer", Read); !errors.Is(err, failure) || len(f.events) != 0 {
		t.Fatal("authentication failure bypassed")
	}
}
