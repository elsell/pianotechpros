package dealerstore

import (
	"context"
	"crypto/sha256"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inquiry/routes"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/ratelimit"
	application "github.com/elsell/pianotechpros/apps/api/internal/app"
	inquiry "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
)

type inquiryClock struct{}

func (inquiryClock) Now() time.Time { return testTime }

type inquirySourceBudget struct{ limiter *ratelimit.Limiter }

func (b inquirySourceBudget) Allow(ctx context.Context, source string, at time.Time) (bool, error) {
	return b.limiter.AllowContext(ctx, "inquiry:"+source, at)
}
func TestPublicInquiryHTTPCommitsBeforeSuccess(t *testing.T) {
	repository, admin, profile, state, event := publicFixture(t)
	global, err := ratelimit.New(repository.DB, "request", 300, time.Minute, 10000)
	if err != nil {
		t.Fatal(err)
	}
	submissions, err := ratelimit.New(repository.DB, "request", 5, time.Minute, 10000)
	if err != nil {
		t.Fatal(err)
	}
	id := string(profile.ID) + "-http"
	service := inquiry.New(inquiry.Dependencies{Repository: repository, Limiter: inquirySourceBudget{submissions}, Clock: inquiryClock{}, NewID: func() string { return id }, ChallengePolicy: inquiry.ChallengeDisabled})
	handler, _ := httpserver.New(application.App{}, nil, httpserver.Options{Clock: inquiryClock{}, RequestRateLimiter: global, DomainRegistrations: []func(huma.API){func(api huma.API) { routes.Register(api, service) }}})
	source := sha256.Sum256([]byte(profile.ID))
	remote := net.JoinHostPort(net.IP(source[:16]).String(), "123")
	path := "/v1/showrooms/" + profile.Slug + "/pianos/" + state.Record.ID + "/inquiries"
	submit := func() *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"name":"Buyer","email":"buyer@example.com","message":"Please arrange a visit"}`))
		request.Header.Set("Content-Type", "application/json")
		request.RemoteAddr = remote
		handler.ServeHTTP(response, request)
		return response
	}
	response := submit()
	if response.Code != 204 || response.Body.Len() != 0 {
		t.Fatalf("submission %d %s", response.Code, response.Body.String())
	}
	var row inquiryModel
	if err := admin.Where("id=?", id).Take(&row).Error; err != nil {
		t.Fatal("success without persistence", err)
	}
	if row.DealerID != string(profile.ID) || row.RecordID != state.Record.ID || row.Message != "Please arrange a visit" {
		t.Fatal("wrong persisted contact or context")
	}
	event.ID += "-http-unpublish"
	if _, err := repository.UnpublishRecord(context.Background(), event.ActorUserID, string(profile.ID), state.Record.ID, state.Record.Revision, event); err != nil {
		t.Fatal(err)
	}
	id += "-hidden"
	response = submit()
	if response.Code != 404 {
		t.Fatalf("hidden status %d %s", response.Code, response.Body.String())
	}
	var count int64
	if err := admin.Table("buyer_inquiries").Where("id=?", id).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("hidden persisted", err)
	}
}
