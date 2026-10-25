package routes_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	shared "github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	inquiry "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

type inboxIdentity struct{}

func (inboxIdentity) Authenticate(_ context.Context, credential string) (ports.Principal, error) {
	if credential == "Bearer good" {
		return ports.Principal{UserID: "owner", Scopes: []string{"api:user"}}, nil
	}
	return ports.Principal{}, ports.ErrInvalidCredential
}

type inboxStore struct {
	entry  domain.Inquiry
	role   dealer.Role
	allow  bool
	events []audit.Event
	reads  int
}

func (s *inboxStore) InquiryAccess(_ context.Context, actor, shop string) (inquiry.DealerAccess, error) {
	if shop != "shop" || actor != "owner" {
		return inquiry.DealerAccess{}, ports.ErrNotFound
	}
	owner := "owner"
	if s.role != dealer.RoleOwner {
		owner = "founder"
	}
	at := clock{}.Now()
	return inquiry.DealerAccess{OwnerUserID: owner, UserActive: true, Membership: dealer.Membership{DealerID: "shop", UserID: actor, Role: s.role, Active: true, Revision: 1, GrantedRevision: 1, CreatedAt: at, UpdatedAt: at}}, nil
}
func (s *inboxStore) Check(_ context.Context, kind, id, permission, actor string) (bool, error) {
	return s.allow && kind == "dealer" && id == "shop" && permission == "manage_inquiries" && actor == "owner", nil
}
func (s *inboxStore) AppendAuditEvent(_ context.Context, event audit.Event) error {
	s.events = append(s.events, event)
	return nil
}
func (s *inboxStore) GetInboxInquiry(_ context.Context, actor, shop, id string, event audit.Event) (domain.Inquiry, error) {
	s.reads++
	if actor != "owner" || shop != "shop" || id != "inquiry" {
		return domain.Inquiry{}, ports.ErrNotFound
	}
	s.events = append(s.events, event)
	return s.entry, nil
}
func (s *inboxStore) ListInboxInquiries(_ context.Context, actor, shop string, _ domain.ListQuery, event audit.Event) (domain.Page, error) {
	s.reads++
	if actor != "owner" || shop != "shop" {
		return domain.Page{}, ports.ErrNotFound
	}
	s.events = append(s.events, event)
	return domain.Page{Inquiries: []domain.Inquiry{s.entry}}, nil
}
func (s *inboxStore) MarkInboxInquiryRead(ctx context.Context, actor, shop, id string, revision int64, event audit.Event) (domain.Inquiry, error) {
	if revision != s.entry.State().Revision {
		return domain.Inquiry{}, ports.ErrConflict
	}
	entry, err := s.GetInboxInquiry(ctx, actor, shop, id, event)
	if err != nil {
		return domain.Inquiry{}, err
	}
	entry, err = entry.MarkRead(actor, event.OccurredAt)
	if err == nil {
		s.entry = entry
	}
	return entry, err
}
func TestInboxHTTPAuthorizationAndContactPrivacy(t *testing.T) {
	for _, test := range []struct {
		name, method, path, credential, body string
		role                                 dealer.Role
		allow                                bool
		budget, status                       int
	}{
		{"read", "GET", "/v1/dealers/shop/inquiries/inquiry", "Bearer good", "", dealer.RoleOwner, true, 10, 200},
		{"list", "GET", "/v1/dealers/shop/inquiries", "Bearer good", "", dealer.RoleEditor, true, 10, 200},
		{"mark", "POST", "/v1/dealers/shop/inquiries/inquiry/read", "Bearer good", `{"revision":1}`, dealer.RoleOwner, true, 10, 200},
		{"unauthenticated", "GET", "/v1/dealers/shop/inquiries/inquiry", "", "", dealer.RoleOwner, true, 10, 401},
		{"provider token", "GET", "/v1/dealers/shop/inquiries", "Bearer provider.jwt.token", "", dealer.RoleOwner, true, 10, 401},
		{"viewer", "GET", "/v1/dealers/shop/inquiries/inquiry", "Bearer good", "", dealer.RoleViewer, true, 10, 404},
		{"viewer mark", "POST", "/v1/dealers/shop/inquiries/inquiry/read", "Bearer good", `{"revision":1}`, dealer.RoleViewer, true, 10, 404},
		{"denied list", "GET", "/v1/dealers/shop/inquiries", "Bearer good", "", dealer.RoleOwner, false, 10, 404},
		{"foreign shop", "GET", "/v1/dealers/other/inquiries/inquiry", "Bearer good", "", dealer.RoleOwner, true, 10, 404},
		{"missing inquiry", "GET", "/v1/dealers/shop/inquiries/missing", "Bearer good", "", dealer.RoleOwner, true, 10, 404},
		{"principal limit", "GET", "/v1/dealers/shop/inquiries", "Bearer good", "", dealer.RoleOwner, true, 0, 429},
		{"bad cursor", "GET", "/v1/dealers/shop/inquiries?cursor=invalid", "Bearer good", "", dealer.RoleOwner, true, 10, 400},
		{"invalid revision", "POST", "/v1/dealers/shop/inquiries/inquiry/read", "Bearer good", `{"revision":3}`, dealer.RoleOwner, true, 10, 422},
	} {
		t.Run(test.name, func(t *testing.T) {
			entry, err := domain.Restore(domain.State{ID: "inquiry", DealerName: "Shop", DealerSlug: "shop", Piano: inventory.PublicListing{ID: "piano", DealerID: "shop", PublicationRevision: 2, Status: inventory.Available, StockNumber: "P1", Title: "Piano", Form: inventory.Grand, Condition: inventory.Used, Photos: []inventory.PublicPhoto{{ID: "photo", AltText: "Front"}}}, Contact: domain.Contact{Name: "PRIVATE BUYER", Email: "private@example.com", Message: "PRIVATE MESSAGE", Preference: domain.Email}, CreatedAt: clock{}.Now().Add(-time.Minute), Revision: 1})
			if err != nil {
				t.Fatal(err)
			}
			store := &inboxStore{entry: entry, role: test.role, allow: test.allow}
			service := inquiry.NewInbox(inquiry.InboxDependencies{Access: inquiry.InboxAccessDependencies{Auth: inboxIdentity{}, Memberships: store, Authorizer: store, Audits: store, Limiter: &quota{remaining: test.budget}, Clock: clock{}}, Repository: store, CursorSigningKey: []byte(strings.Repeat("k", 32))})
			handler, _ := shared.New(app.App{}, nil, shared.Options{Clock: clock{}, RequestRateLimiter: &quota{remaining: 100}, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.RegisterInbox(api, service) }}})
			request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
			request.Header.Set("Authorization", test.credential)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("status=%d want=%d %s", response.Code, test.status, response.Body.String())
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("missing no-store")
			}
			if test.status == 200 {
				if !strings.Contains(response.Body.String(), "PRIVATE BUYER") || len(store.events) != 1 {
					t.Fatal("authorized detail or audit missing")
				}
			} else {
				for _, private := range []string{"PRIVATE BUYER", "PRIVATE MESSAGE", "private@example.com"} {
					if strings.Contains(response.Body.String(), private) {
						t.Fatal("private response leaked")
					}
				}
			}
		})
	}
}
