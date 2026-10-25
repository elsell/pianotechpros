package technician

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/technician"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
)

func TestProfileApplicationCreateReadSaveAndReplay(t *testing.T) {
	f, s := profileService(t)
	ctx := context.Background()
	attrs := profileAttributes()
	created, err := s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", attrs)
	if err != nil || created.OwnerUserID != "owner" || created.Revision != 1 || !f.grants[string(created.ID)] {
		t.Fatalf("create: %+v %v", created, err)
	}
	if len(f.pending) != 0 {
		t.Fatal("owner grant not completed")
	}
	got, err := s.GetProfile(ctx, "Bearer valid")
	if err != nil || got.ID != created.ID {
		t.Fatalf("get: %+v %v", got, err)
	}
	attrs.Name = "Updated"
	f.now = f.now.Add(time.Hour)
	got, err = s.SaveProfile(ctx, "Bearer valid", 1, attrs)
	if err != nil || got.Name != "Updated" || got.Revision != 2 {
		t.Fatalf("save: %+v %v", got, err)
	}
	got, err = s.SaveProfile(ctx, "Bearer valid", 2, attrs)
	if err != nil || got.Revision != 2 {
		t.Fatalf("no-op: %+v %v", got, err)
	}
	if _, err = s.SaveProfile(ctx, "Bearer valid", 1, attrs); !errors.Is(err, domain.ErrRevisionConflict) {
		t.Fatalf("stale: %v", err)
	}
	got, err = s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", profileAttributes())
	if err != nil || got.ID != created.ID {
		t.Fatalf("replay: %+v %v", got, err)
	}
	if f.events[len(f.events)-1].Action != audit.ResourceViewed {
		t.Fatal("creation replay lacked read audit")
	}
}
func TestProfileApplicationFailsClosedAtBoundaries(t *testing.T) {
	for _, scenario := range []string{"missing session", "scope", "limited", "foreign owner", "permission denied", "authorizer failed", "audit failed", "repository failed", "missing catalog"} {
		t.Run(scenario, func(t *testing.T) {
			f, s := profileService(t)
			ctx := context.Background()
			created, err := s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", profileAttributes())
			if err != nil {
				t.Fatal(err)
			}
			token := "Bearer valid"
			switch scenario {
			case "missing session":
				token = ""
			case "scope":
				s.Auth = fakeAuthenticator{principal: ports.Principal{UserID: "owner", Scopes: []string{"wrong"}}}
			case "limited":
				f.limited = true
			case "foreign owner":
				f.foreign = true
			case "permission denied":
				delete(f.grants, string(created.ID))
			case "authorizer failed":
				f.checkErr = errors.New("permission unavailable")
			case "audit failed":
				f.auditErr = errors.New("audit unavailable")
			case "repository failed":
				f.readErr = errors.New("storage unavailable")
			case "missing catalog":
				s.Zones = nil
			}
			before := f.entity.Revision
			readsBefore := f.reads
			if got, err := s.GetProfile(ctx, token); err == nil || got.ID != "" {
				t.Fatalf("read boundary returned data: %+v %v", got, err)
			}
			attrs := profileAttributes()
			attrs.Name = "must not persist"
			if got, err := s.SaveProfile(ctx, token, 1, attrs); err == nil || got.ID != "" {
				t.Fatalf("save boundary returned data: %+v %v", got, err)
			}
			if f.entity.Revision != before {
				t.Fatal("denied save mutated state")
			}
			if scenario == "missing session" || scenario == "scope" || scenario == "limited" || scenario == "missing catalog" {
				if f.reads != readsBefore {
					t.Fatal("rejected principal reached profile storage")
				}
			}

		})
	}
}
func TestProfileCreationPendingRetryAndRevocation(t *testing.T) {
	f, s := profileService(t)
	ctx := context.Background()
	f.writeGrantErr = errors.New("SpiceDB unavailable")
	if got, err := s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", profileAttributes()); !errors.Is(err, ports.ErrAuthorizationPending) || got.ID != "" {
		t.Fatalf("pending creation leaked profile: %+v %v", got, err)
	}
	if f.entity.ID == "" || len(f.pending) != 1 {
		t.Fatal("pending durable state lost")
	}
	f.writeGrantErr = nil
	got, err := s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", profileAttributes())
	if err != nil || got.ID != f.entity.ID {
		t.Fatalf("pending retry: %+v %v", got, err)
	}
	delete(f.grants, string(got.ID))
	writes := f.grantWrites
	if got, err := s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", profileAttributes()); !errors.Is(err, ports.ErrNotFound) || got.ID != "" {
		t.Fatalf("revoked retry: %+v %v", got, err)
	}
	if f.grantWrites != writes {
		t.Fatal("retry recreated a revoked grant")
	}
}
func TestProfileTimezoneMetadataIsAuditedAndBoundedByPrincipal(t *testing.T) {
	f, s := profileService(t)
	ctx := context.Background()
	names, err := s.Timezones(ctx, "Bearer valid")
	if err != nil || len(names) != 1 || names[0] != "UTC" || len(f.events) != 1 || f.events[0].TargetID != "timezones" {
		t.Fatalf("metadata: %v %v", names, err)
	}
	f.limited = true
	if names, err := s.Timezones(ctx, "Bearer valid"); !errors.Is(err, ports.ErrRateLimited) || len(names) != 0 {
		t.Fatalf("limited metadata: %v %v", names, err)
	}
	f.limited = false
	f.auditErr = errors.New("audit unavailable")
	if names, err := s.Timezones(ctx, "Bearer valid"); err == nil || len(names) != 0 {
		t.Fatal("unaudited metadata returned")
	}
}

func TestProfileGrantWithoutCompletionAuditRemainsUnavailable(t *testing.T) {
	f, s := profileService(t)
	ctx := context.Background()
	f.completionErr = errors.New("completion audit unavailable")
	if got, err := s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", profileAttributes()); !errors.Is(err, ports.ErrAuthorizationPending) || got.ID != "" {
		t.Fatalf("unaudited grant completion: %+v %v", got, err)
	}
	if !f.grants[string(f.entity.ID)] {
		t.Fatal("test must exercise an already delivered remote grant")
	}
	if got, err := s.GetProfile(ctx, "Bearer valid"); !errors.Is(err, ports.ErrAuthorizationPending) || got.ID != "" {
		t.Fatalf("read bypassed readiness: %+v %v", got, err)
	}
	if got, err := s.SaveProfile(ctx, "Bearer valid", 1, profileAttributes()); !errors.Is(err, ports.ErrAuthorizationPending) || got.ID != "" {
		t.Fatalf("save bypassed readiness: %+v %v", got, err)
	}
	f.completionErr = nil
	if _, err := s.CreateProfile(ctx, "Bearer valid", "technician-create-key-0001", profileAttributes()); err != nil {
		t.Fatalf("recovery: %v", err)
	}
}

func TestProfileCreationCanonicalWorkSelectionsReplayExactly(t *testing.T) {
	f, s := profileService(t)
	attrs := profileAttributes()
	attrs.Services = []string{"tuning", "repair"}
	attrs.Forms = []string{"upright", "grand"}
	attrs.Availability = []domain.WeeklyRule{{Key: "friday", Kind: "available", Recurrence: "weekly", Weekday: 4, Start: "09:00", End: "17:00", Timezone: "UTC"}, {Key: "monday", Kind: "unavailable", Recurrence: "weekly", Weekday: 0, Start: "10:00", End: "11:00", Timezone: "UTC"}}
	created, err := s.CreateProfile(context.Background(), "Bearer valid", "technician-canonical-key", attrs)
	if err != nil {
		t.Fatal(err)
	}
	attrs.Services = []string{"repair", "tuning"}
	attrs.Forms = []string{"grand", "upright"}
	attrs.Availability[0], attrs.Availability[1] = attrs.Availability[1], attrs.Availability[0]
	got, err := s.CreateProfile(context.Background(), "Bearer valid", "technician-canonical-key", attrs)
	if err != nil || got.ID != created.ID || f.grantWrites != 1 {
		t.Fatalf("canonical replay: %+v %v writes=%d", got, err, f.grantWrites)
	}
	attrs.Availability[0].End = "12:00"
	if got, err := s.CreateProfile(context.Background(), "Bearer valid", "technician-canonical-key", attrs); !errors.Is(err, ports.ErrIdempotencyConflict) || got.ID != "" {
		t.Fatalf("changed rule reused reservation: %+v %v", got, err)
	}
}
