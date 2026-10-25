package technician_test

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	platformstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/technician/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/sessionauth"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/spicedb"
	platformapp "github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/technicianprofile"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"github.com/google/uuid"
)

type httpBudget struct{ limited bool }

func (b *httpBudget) Allow(string, time.Time) bool { return !b.limited }

func TestTechnicianHTTPWithRealSessionsPersistenceAndAuthorization(t *testing.T) {
	if *policyDSN == "" || *policyEndpoint == "" {
		t.Skip("isolated PostgreSQL and SpiceDB endpoints are required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	clock := &policyClock{instant: time.Now().UTC().Truncate(time.Microsecond)}
	admin := policyDatabase(t, "")
	runtime := policyDatabase(t, "app")
	store := &platformstore.Store{DB: runtime}
	sessions := sessionauth.New(store, clock)
	event := func(actor string, action audit.Action) audit.Event {
		return audit.Event{ID: uuid.NewString(), OwnerUserID: actor, ActorUserID: actor, Action: action, TargetType: "user", TargetID: actor, Outcome: audit.Succeeded, CorrelationID: "technician-http-fixture", OccurredAt: clock.instant}
	}
	createSession := func() (string, string) {
		actor := uuid.NewString()
		user := struct {
			ID, Email, DisplayName, Status string
			CreatedAt, UpdatedAt           time.Time
		}{actor, actor + "@example.invalid", "HTTP fixture", "active", clock.instant, clock.instant}
		if err := admin.WithContext(ctx).Table("user_models").Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		identityHash := sha256.Sum256([]byte(actor))
		token, err := sessions.CreateSession(ctx, actor, []string{"api:user"}, identityHash[:], clock.instant.Add(time.Hour), clock.instant.Add(2*time.Hour), event(actor, audit.SessionCreated))
		if err != nil {
			t.Fatal(err)
		}
		return actor, "Bearer " + token
	}
	actor, credential := createSession()
	_, foreign := createSession()
	if _, err := sessions.CreateSession(ctx, actor, []string{"other:scope"}, make([]byte, 32), clock.instant.Add(time.Hour), clock.instant.Add(2*time.Hour), event(actor, audit.SessionCreated)); err == nil {
		t.Fatal("session issuer accepted an unsupported scope")
	}
	budget := &httpBudget{}
	authorizer, err := spicedb.New(*policyEndpoint, *policyToken, true)
	if err != nil {
		t.Fatal(err)
	}
	registration, err := technicianprofile.Registration(generated.Dependencies{DB: runtime, Auth: sessions, Authorizer: authorizer, AuthorizationOutbox: store, AuthorizationSerializer: store, Audits: store, AuditRateLimiter: budget, Clock: clock, NewID: uuid.NewString, AuthorizationWorker: uuid.NewString(), AuthorizationLease: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	handler, _ := httpserver.New(platformapp.App{}, nil, httpserver.Options{DomainRegistrations: []func(huma.API){registration}})
	key := uuid.NewString()
	request := func(method, path, auth, body string, status int) string {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", auth)
		req.Header.Set("Idempotency-Key", key)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != status {
			t.Fatalf("%s %s expected %d got %d: %s", method, path, status, res.Code, res.Body.String())
		}
		if res.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("missing no-store")
		}
		if strings.Contains(res.Body.String(), actor) {
			t.Fatal("response leaked owner")
		}
		return res.Body.String()
	}
	const path = "/v1/technician-profile"
	const attrs = `{"name":"Technician","email":"technician@example.invalid","searchable":true,"acceptsRequestsWithoutAvailability":false,"origin":{"label":"Shop","street1":"1 Example","city":"Example","region":"NY","postalCode":"10001","timezone":"CET"},"radiusMiles":25,"drivingMinutes":60,"services":["tuning"],"forms":["grand"],"availability":[{"key":"mon","kind":"available","recurrence":"weekly","weekday":0,"start":"09:00","end":"17:00","timezone":"America/New_York"}]}`
	for _, auth := range []string{"", "Bearer malformed", "Bearer eyJhbGciOiJSUzI1NiJ9.issuer-audience.signature"} {
		request("GET", path, auth, "", 401)
	}
	request("GET", path, credential, "", 404)
	budget.limited = true
	request("GET", path+"/timezones", credential, "", 429)
	request("POST", path, credential, `{"attributes":`+attrs+`}`, 429)
	budget.limited = false
	catalog := request("GET", path+"/timezones", credential, "", 200)
	if !strings.Contains(catalog, `"CET"`) {
		t.Fatal("missing legacy timezone")
	}
	created := request("POST", path, credential, `{"attributes":`+attrs+`}`, 201)
	var item struct {
		Data dto.TechnicianProfileItem `json:"data"`
	}
	if err := json.Unmarshal([]byte(created), &item); err != nil {
		t.Fatal(err)
	}
	id := item.Data.ID
	if id == "" || item.Data.Revision != 1 || len(item.Data.Attributes.Availability) != 1 || item.Data.Attributes.Availability[0].Timezone != "America/New_York" {
		t.Fatal("missing profile aggregate")
	}
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		if err := authorizer.DeleteRelationship(cleanup, "technician", id, "owner", "user", actor); err != nil {
			t.Error(err)
		}
	})
	request("GET", path, credential, "", 200)
	request("GET", path, foreign, "", 404)
	request("PUT", path, foreign, `{"expectedRevision":1,"attributes":`+attrs+`}`, 404)
	changed := strings.Replace(attrs, `"name":"Technician"`, `"name":"Edited"`, 1)
	saved := request("PUT", path, credential, `{"expectedRevision":1,"attributes":`+changed+`}`, 200)
	if err := json.Unmarshal([]byte(saved), &item); err != nil || item.Data.Revision != 2 || item.Data.Attributes.Name != "Edited" {
		t.Fatalf("save: %s", saved)
	}
	stale := request("PUT", path, credential, `{"expectedRevision":1,"attributes":`+attrs+`}`, 409)
	if !strings.Contains(stale, `"code":"conflict"`) {
		t.Fatal(stale)
	}
	replay := request("POST", path, credential, `{"attributes":`+attrs+`}`, 201)
	if err := json.Unmarshal([]byte(replay), &item); err != nil || item.Data.Revision != 2 {
		t.Fatal("replay replaced edited profile")
	}
	if err := authorizer.DeleteRelationship(ctx, "technician", id, "owner", "user", actor); err != nil {
		t.Fatal(err)
	}
	request("GET", path, credential, "", 404)
	request("POST", path, credential, `{"attributes":`+attrs+`}`, 404)
	if allowed, err := authorizer.Check(ctx, "technician", id, "view", actor); err != nil || allowed {
		t.Fatal("replay regranted access")
	}
	if err := sessions.RevokeSession(ctx, credential, event(actor, audit.SessionRevoked)); err != nil {
		t.Fatal(err)
	}
	request("GET", path+"/timezones", credential, "", 401)
	clock.instant = clock.instant.Add(time.Hour)
	request("GET", path+"/timezones", foreign, "", 401)
}
