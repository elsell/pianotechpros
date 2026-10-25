package inquiry

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/ratelimit"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var databaseDSN = flag.String("database-dsn", "", "isolated PostgreSQL fixture")

type clock struct{}

func (clock) Now() time.Time { return time.Now().UTC() }

type requestBudget struct{}

func (requestBudget) Allow(string, time.Time) bool { return true }
func TestUnconfiguredSubmissionIsUnavailable(t *testing.T) {
	registration, err := Registration(nil, config.Config{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	handler, _ := httpserver.New(app.App{}, nil, httpserver.Options{Clock: clock{}, RequestRateLimiter: requestBudget{}, DomainRegistrations: []func(huma.API){registration}})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/showrooms/shop/pianos/piano/inquiries", strings.NewReader(`{}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != 503 {
		t.Fatal(response.Code)
	}
}
func TestBootstrapRejectsIncompleteSubmissionConfiguration(t *testing.T) {
	for _, cfg := range []config.Config{
		{InquiryChallengePolicy: "invalid"}, {InquiryChallengePolicy: "enabled"},
		{InquiryChallengePolicy: "disabled"}, {TurnstileSecret: "secret"},
		{InquiryChallengePolicy: "disabled", TurnstileSecret: "secret"},
		{InquiryChallengePolicy: "enabled", TurnstileSecret: "secret", TurnstileHostname: "https://wrong.example"},
	} {
		if _, err := Registration(nil, cfg, clock{}, func() string { return "id" }, nil); err == nil {
			t.Fatal("incomplete config accepted")
		}
	}
}
func TestPostgresInquiryBudgetCoordinatesInstances(t *testing.T) {
	if *databaseDSN == "" {
		t.Skip("-database-dsn is required")
	}
	db, err := gorm.Open(postgres.Open(*databaseDSN), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	first, err := ratelimit.New(db, "request", 5, time.Minute, 10000)
	if err != nil {
		t.Fatal(err)
	}
	second, _ := ratelimit.New(db, "request", 5, time.Minute, 10000)
	general, _ := ratelimit.New(db, "request", 300, time.Minute, 10000)
	source := fmt.Sprintf("inquiry-test-%d", time.Now().UnixNano())
	at := time.Now().UTC()
	// General requests do not spend the stricter submission budget.
	for range 10 {
		if !general.Allow(source, at) {
			t.Fatal("general request rejected")
		}
	}
	results := make(chan bool, 20)
	var wg sync.WaitGroup
	budgets := []sourceBudget{{first}, {second}}
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := budgets[i%2].Allow(context.Background(), source, at)
			if err != nil {
				t.Error(err)
			}
			results <- ok
		}()
	}
	wg.Wait()
	close(results)
	count := 0
	for ok := range results {
		if ok {
			count++
		}
	}
	if count != 5 {
		t.Fatalf("accepted %d want 5", count)
	}
	if ok, err := budgets[0].Allow(context.Background(), source, at.Add(time.Minute)); !ok || err != nil {
		t.Fatal("new window rejected", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
	if ok, err := budgets[0].Allow(context.Background(), source, at); ok || err == nil {
		t.Fatal("database failure hidden")
	}
}
