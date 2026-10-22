package dealer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/dealer/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type staffStore struct {
	*readStore
	staff   map[string]domain.Membership
	audits  *readAudits
	changes []string
}

func (r *staffStore) mutate(ctx context.Context, actor string, id domain.ID, user string, revision int64, remove bool, role domain.Role, deleteID, touchID string, event audit.Event) (domain.Membership, error) {
	entity, err := r.Get(ctx, actor, id)
	if err != nil {
		return domain.Membership{}, err
	}
	if entity.OwnerUserID != actor {
		return domain.Membership{}, ports.ErrNotFound
	}
	key := domain.MembershipKey(id, user)
	member, ok := r.staff[key]
	if !ok {
		return domain.Membership{}, ports.ErrNotFound
	}
	var next domain.Membership
	if remove {
		next, err = member.Revoke(revision, event.OccurredAt)
	} else {
		next, err = member.ChangeRole(role, revision, event.OccurredAt)
	}
	if errors.Is(err, domain.ErrRevisionConflict) {
		err = ports.ErrConflict
	}
	if err != nil {
		return domain.Membership{}, err
	}
	if r.audits.err != nil {
		return domain.Membership{}, r.audits.err
	}
	r.staff[key] = next
	r.audits.events = append(r.audits.events, event)
	r.changes = append(r.changes, deleteID)
	if !remove {
		r.changes = append(r.changes, touchID)
	}
	return next, nil
}
func (r *staffStore) RevokeMembership(ctx context.Context, actor string, id domain.ID, user string, rev int64, change string, event audit.Event) (domain.Membership, error) {
	return r.mutate(ctx, actor, id, user, rev, true, "", change, "", event)
}
func (r *staffStore) ChangeMembershipRole(ctx context.Context, actor string, id domain.ID, user string, role domain.Role, rev int64, del, touch string, event audit.Event) (domain.Membership, error) {
	return r.mutate(ctx, actor, id, user, rev, false, role, del, touch, event)
}
func staffFixture() (*Service, *staffStore, *readPermissions, *readAudits) {
	s, r, p, a := profileFixture()
	member, _ := domain.NewStaffMembership("a", "staff", domain.RoleEditor, s.Clock.Now())
	member.GrantedRevision = 1
	store := &staffStore{readStore: r.readStore, staff: map[string]domain.Membership{domain.MembershipKey("a", "staff"): member}, audits: a}
	s.Repository = store
	p.grants["dealer:a:manage_members:reader"] = true
	sequence := 0
	s.NewID = func() string { sequence++; return fmt.Sprintf("change-%d", sequence) }
	return s, store, p, a
}
func TestStaffRoleAndRevocationCommands(t *testing.T) {
	s, r, _, a := staffFixture()
	ctx := context.Background()
	member, err := s.ChangeMembershipRole(ctx, "Bearer valid", "a", "staff", domain.RoleViewer, 1)
	if err != nil || member.Revision != 2 || member.Allows(domain.View) || len(r.changes) != 2 {
		t.Fatalf("change: %+v %v", member, err)
	}
	if len(a.events) != 1 || a.events[0].TargetID != domain.MembershipKey("a", "staff") {
		t.Fatalf("audit: %+v", a.events)
	}
	if _, err := s.RevokeMembership(ctx, "Bearer valid", "a", "staff", 1); !errors.Is(err, ports.ErrConflict) {
		t.Fatalf("stale remove: %v", err)
	}
	member, err = s.RevokeMembership(ctx, "Bearer valid", "a", "staff", 2)
	if err != nil || member.Active || member.Revision != 3 || len(r.changes) != 3 || len(a.events) != 2 {
		t.Fatalf("remove: %+v %v", member, err)
	}
}
func TestStaffCommandsFailClosed(t *testing.T) {
	for _, remove := range []bool{false, true} {
		for _, scenario := range []string{"unauthenticated", "wrong-scope", "local-denial", "permission-denial", "non-owner", "permission-failure", "audit-failure", "rate-limit", "missing-id-generator", "unknown-subject"} {
			t.Run(fmt.Sprintf("%t/%s", remove, scenario), func(t *testing.T) {
				s, r, p, a := staffFixture()
				credential := "Bearer valid"
				subject := "staff"
				switch scenario {
				case "unauthenticated":
					credential = ""
				case "wrong-scope":
					s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "reader"}}
				case "local-denial":
					delete(r.members["reader"], "a")
				case "permission-denial":
					delete(p.grants, "dealer:a:manage_members:reader")
				case "non-owner":
					item := r.rows["a"]
					item.OwnerUserID = "someone-else"
					r.rows["a"] = item
				case "permission-failure":
					p.err = errors.New("unavailable")
				case "audit-failure":
					a.err = errors.New("unavailable")
				case "rate-limit":
					s.AuditRateLimiter = &readBudget{}
				case "missing-id-generator":
					s.NewID = nil
				case "unknown-subject":
					subject = "unknown"
				}
				var err error
				if remove {
					_, err = s.RevokeMembership(context.Background(), credential, "a", subject, 1)
				} else {
					_, err = s.ChangeMembershipRole(context.Background(), credential, "a", subject, domain.RoleViewer, 1)
				}
				if err == nil {
					t.Fatal("denied mutation succeeded")
				}
				if len(r.changes) != 0 || r.staff[domain.MembershipKey("a", "staff")].Revision != 1 {
					t.Fatal("denied mutation changed state")
				}
				for _, event := range a.events {
					if event.Action != audit.ResourceAccessDenied {
						t.Fatalf("unexpected success audit: %+v", event)
					}
				}
				if scenario == "local-denial" || scenario == "permission-denial" || scenario == "non-owner" || scenario == "permission-failure" || scenario == "unknown-subject" {
					if len(a.events) != 1 {
						t.Fatalf("missing denial audit: %+v", a.events)
					}
				}
			})
		}
	}
}

func TestStaffHTTPCommands(t *testing.T) {
	for _, command := range []string{"role", "revoke"} {
		for _, scenario := range []string{"success", "unauthenticated", "malformed", "permission-denial", "permission-failure", "audit-failure", "rate-limit", "stale", "unknown", "invalid-role"} {
			t.Run(command+"/"+scenario, func(t *testing.T) {
				s, r, p, a := staffFixture()
				credential := "Bearer valid"
				subject := "staff"
				revision := 1
				role := "viewer"
				status := 200
				switch scenario {
				case "unauthenticated":
					credential = ""
					status = 401
				case "malformed":
					credential = "Basic invalid"
					status = 401
				case "permission-denial":
					p.grants = map[string]bool{}
					status = 404
				case "permission-failure":
					p.err = errors.New("unavailable")
					status = 500
				case "audit-failure":
					a.err = errors.New("unavailable")
					status = 500
				case "rate-limit":
					s.AuditRateLimiter = &readBudget{}
					status = 429
				case "stale":
					revision = 2
					status = 409
				case "unknown":
					subject = "unknown"
					status = 404
				case "invalid-role":
					if command == "revoke" {
						t.Skip("role applies only to role command")
					}
					role = "owner"
					status = 422
				}
				method := http.MethodPut
				body := fmt.Sprintf(`{"expectedRevision":%d,"role":%q}`, revision, role)
				if command == "revoke" {
					method = http.MethodPost
					body = fmt.Sprintf(`{"expectedRevision":%d}`, revision)
				}
				handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, s) }}})
				req := httptest.NewRequest(method, "/v1/dealers/a/staff/"+subject+"/"+command, strings.NewReader(body))
				req.Header.Set("Authorization", credential)
				req.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, req)
				if response.Code != status {
					t.Fatalf("status=%d want=%d body=%s", response.Code, status, response.Body.String())
				}
				if status == 200 {
					var envelope struct {
						Data struct {
							Revision     int64  `json:"revision"`
							Active       bool   `json:"active"`
							GrantPending bool   `json:"grantPending"`
							Role         string `json:"role"`
						}
					}
					if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
						t.Fatal(err)
					}
					if envelope.Data.Revision != 2 || envelope.Data.Active != (command == "role") || envelope.Data.GrantPending != (command == "role") {
						t.Fatalf("incorrect response: %s", response.Body.String())
					}
				} else if len(r.changes) != 0 {
					t.Fatal("failed HTTP command mutated state")
				}
			})
		}
	}
}
