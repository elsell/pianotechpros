package inquiry

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type inboxSession struct {
	principal ports.Principal
	err       error
}

func (s inboxSession) Authenticate(context.Context, string) (ports.Principal, error) {
	return s.principal, s.err
}

type inboxMemberships struct {
	entries map[string]DealerAccess
	failure error
}

func (m *inboxMemberships) InquiryAccess(_ context.Context, actor, shop string) (DealerAccess, error) {
	if m.failure != nil {
		return DealerAccess{}, m.failure
	}
	entry, ok := m.entries[shop+"/"+actor]
	if !ok {
		return DealerAccess{}, ports.ErrNotFound
	}
	return entry, nil
}

type inboxPermissions struct {
	grants  map[string]bool
	failure error
	checks  int
}

func (p *inboxPermissions) Check(_ context.Context, kind, id, permission, actor string) (bool, error) {
	p.checks++
	return p.grants[kind+":"+id+"#"+permission+"@"+actor], p.failure
}

type inboxAudit struct {
	events  []audit.Event
	failure error
}

func (a *inboxAudit) AppendAuditEvent(_ context.Context, e audit.Event) error {
	if a.failure != nil {
		return a.failure
	}
	a.events = append(a.events, e)
	return nil
}

type inboxBudget struct{ remaining int }

func (b *inboxBudget) Allow(string, time.Time) bool {
	if b.remaining == 0 {
		return false
	}
	b.remaining--
	return true
}

type inboxClock struct{}

func (inboxClock) Now() time.Time { return time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC) }
func TestInboxAccessRequiresLocalAndRemoteAuthority(t *testing.T) {
	outage := errors.New("dependency outage")
	for _, test := range []struct {
		name                           string
		role                           dealer.Role
		active                         bool
		revision, granted              int64
		owner, memberActor, memberShop string
		remote                         bool
		membershipErr, remoteErr       error
		want                           error
	}{
		{"owner", dealer.RoleOwner, true, 1, 1, "actor", "actor", "shop", true, nil, nil, nil},
		{"editor", dealer.RoleEditor, true, 1, 1, "owner", "actor", "shop", true, nil, nil, nil},
		{"viewer", dealer.RoleViewer, true, 1, 1, "owner", "actor", "shop", true, nil, nil, ports.ErrNotFound},
		{"revoked", dealer.RoleEditor, false, 2, 2, "owner", "actor", "shop", true, nil, nil, ports.ErrNotFound},
		{"pending grant", dealer.RoleEditor, true, 2, 1, "owner", "actor", "shop", true, nil, nil, ports.ErrNotFound},
		{"wrong owner", dealer.RoleOwner, true, 1, 1, "owner", "actor", "shop", true, nil, nil, ports.ErrNotFound},
		{"wrong actor", dealer.RoleEditor, true, 1, 1, "owner", "other", "shop", true, nil, nil, ports.ErrNotFound},
		{"wrong dealer", dealer.RoleEditor, true, 1, 1, "owner", "actor", "other", true, nil, nil, ports.ErrNotFound},
		{"remote denial", dealer.RoleEditor, true, 1, 1, "owner", "actor", "shop", false, nil, nil, ports.ErrNotFound},
		{"membership outage", dealer.RoleEditor, true, 1, 1, "owner", "actor", "shop", true, outage, nil, outage},
		{"remote outage", dealer.RoleEditor, true, 1, 1, "owner", "actor", "shop", true, nil, outage, outage},
	} {
		t.Run(test.name, func(t *testing.T) {
			at := inboxClock{}.Now()
			member := dealer.Membership{DealerID: dealer.ID(test.memberShop), UserID: test.memberActor, Role: test.role, Active: test.active, Revision: test.revision, GrantedRevision: test.granted, CreatedAt: at, UpdatedAt: at}
			local := &inboxMemberships{entries: map[string]DealerAccess{"shop/actor": {OwnerUserID: test.owner, UserActive: true, Membership: member}}, failure: test.membershipErr}
			remote := &inboxPermissions{grants: map[string]bool{"dealer:shop#manage_inquiries@actor": test.remote}, failure: test.remoteErr}
			audits := &inboxAudit{}
			policy := NewInboxAccessPolicy(InboxAccessDependencies{Auth: inboxSession{principal: ports.Principal{UserID: "actor", Scopes: []string{"api:user"}}}, Memberships: local, Authorizer: remote, Audits: audits, Limiter: &inboxBudget{remaining: 1}, Clock: inboxClock{}})
			access, err := policy.Require(context.Background(), "application-session", "shop")
			if !errors.Is(err, test.want) {
				t.Fatalf("err=%v want=%v", err, test.want)
			}
			if test.want == nil {
				if access.ActorID != "actor" || access.DealerID != "shop" || access.OwnerUserID != test.owner {
					t.Fatal("access context invalid")
				}
				if len(audits.events) != 0 {
					t.Fatal("success preflight audited before actual read")
				}
			} else {
				if len(audits.events) != 1 {
					t.Fatal("decision not audited")
				}
				event := audits.events[0]
				if event.ActorUserID != "actor" || event.OwnerUserID != "actor" || event.TargetType != "inquiry" || event.TargetID != "inquiry" {
					t.Fatal("decision leaked scope")
				}
			}
		})
	}
}

func TestInboxAccessFailsClosedBeforeDataAndAuditsDenials(t *testing.T) {
	denied := errors.New("session rejected")
	auditFailure := errors.New("audit unavailable")
	at := inboxClock{}.Now()
	for _, test := range []struct {
		name      string
		change    func(*InboxAccessDependencies, *inboxMemberships, *inboxPermissions, *inboxAudit)
		want      error
		decisions int
	}{
		{"missing authenticator", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Auth = nil
		}, ports.ErrAuthorizationPolicyNotConfigured, 0},
		{"rejected session", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Auth = inboxSession{err: denied}
		}, denied, 0},
		{"wrong scope", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Auth = inboxSession{principal: ports.Principal{UserID: "actor", Scopes: []string{"admin"}}}
		}, ports.ErrInvalidCredential, 0},
		{"invalid principal", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Auth = inboxSession{principal: ports.Principal{UserID: " actor", Scopes: []string{"api:user"}}}
		}, ports.ErrInvalidCredential, 0},
		{"missing memberships", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Memberships = nil
		}, ports.ErrAuthorizationPolicyNotConfigured, 0},
		{"missing authorizer", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Authorizer = nil
		}, ports.ErrAuthorizationPolicyNotConfigured, 0},
		{"missing audit", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Audits = nil
		}, ports.ErrAuthorizationPolicyNotConfigured, 0},
		{"missing limiter", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Limiter = nil
		}, ports.ErrAuthorizationPolicyNotConfigured, 0},
		{"missing clock", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Clock = nil
		}, ports.ErrAuthorizationPolicyNotConfigured, 0},
		{"exhausted audit quota", func(d *InboxAccessDependencies, _ *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			d.Limiter = &inboxBudget{}
		}, ports.ErrRateLimited, 0},
		{"cross dealer", func(_ *InboxAccessDependencies, m *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			delete(m.entries, "shop/actor")
		}, ports.ErrNotFound, 1},
		{"inactive user", func(_ *InboxAccessDependencies, m *inboxMemberships, _ *inboxPermissions, _ *inboxAudit) {
			entry := m.entries["shop/actor"]
			entry.UserActive = false
			m.entries["shop/actor"] = entry
		}, ports.ErrNotFound, 1},
		{"audit failure overrides denial", func(_ *InboxAccessDependencies, m *inboxMemberships, _ *inboxPermissions, a *inboxAudit) {
			delete(m.entries, "shop/actor")
			a.failure = auditFailure
		}, auditFailure, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			local := &inboxMemberships{entries: map[string]DealerAccess{"shop/actor": {OwnerUserID: "owner", UserActive: true, Membership: dealer.Membership{DealerID: "shop", UserID: "actor", Role: dealer.RoleEditor, Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: at, UpdatedAt: at}}}}
			remote := &inboxPermissions{grants: map[string]bool{"dealer:shop#manage_inquiries@actor": true}}
			audits := &inboxAudit{}
			deps := InboxAccessDependencies{Auth: inboxSession{principal: ports.Principal{UserID: "actor", Scopes: []string{"api:user"}}}, Memberships: local, Authorizer: remote, Audits: audits, Limiter: &inboxBudget{remaining: 1}, Clock: inboxClock{}}
			test.change(&deps, local, remote, audits)
			access, err := NewInboxAccessPolicy(deps).Require(context.Background(), "application-session", "shop")
			if !errors.Is(err, test.want) || access != (InboxAccess{}) {
				t.Fatalf("access=%+v err=%v", access, err)
			}
			if remote.checks != 0 || len(audits.events) != test.decisions {
				t.Fatalf("checks=%d audits=%d", remote.checks, len(audits.events))
			}
		})
	}
}
