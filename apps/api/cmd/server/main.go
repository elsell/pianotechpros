package main

import (
	"context"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/observability"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/oidcauth"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/photoprocessor"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/ratelimit"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/sessionauth"
	spice "github.com/elsell/pianotechpros/apps/api/internal/adapters/spicedb"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/inventoryphotos"
	"github.com/elsell/pianotechpros/apps/api/internal/config"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/identity"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"github.com/google/uuid"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

type systemClock struct{}

func (systemClock) Now() time.Time { return time.Now() }
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load()
	if err != nil {
		slog.Error("configuration invalid", "error", err)
		os.Exit(1)
	}
	store, err := gormstore.Open("postgres", cfg.DatabaseDSN)
	if err != nil {
		panic(err)
	}
	if err := store.ConfigurePool(cfg.DatabaseMaxOpenConns, cfg.DatabaseMaxIdleConns, time.Duration(cfg.DatabaseConnMaxLifetime)*time.Second, time.Duration(cfg.DatabaseConnMaxIdleTime)*time.Second); err != nil {
		panic(err)
	}
	verifier, err := oidcauth.New(ctx, cfg.OIDCIssuer, cfg.OIDCBackchannelURL, cfg.OIDCAudiences, cfg.OIDCInsecure)
	if err != nil {
		panic(err)
	}
	authorizationURL, tokenURL := verifier.Endpoints()
	discoveryURL := cfg.OIDCIssuer
	if cfg.OIDCBackchannelURL != "" {
		discoveryURL = cfg.OIDCBackchannelURL
	}
	authorizer, err := spice.New(cfg.SpiceDBEndpoint, cfg.SpiceDBToken, cfg.SpiceDBInsecure)
	if err != nil {
		panic(err)
	}
	clock := systemClock{}
	auditLimiter, err := ratelimit.New(store.DB, "audit", cfg.AuditEventsPerMinute, time.Minute, cfg.AuditLimiterPrincipals)
	if err != nil {
		panic(err)
	}
	requestLimiter, err := ratelimit.New(store.DB, "request", cfg.RequestsPerMinute, time.Minute, cfg.RequestLimiterSources)
	if err != nil {
		panic(err)
	}
	sessions := sessionauth.New(store, clock)
	metrics := observability.NewMetrics(cfg.MetricsBearerToken)
	probe := observability.Fanout{observability.StructuredLog{Logger: slog.New(slog.NewJSONHandler(os.Stdout, nil))}, metrics}
	if cfg.OTLPHTTPEndpoint != "" {
		telemetry, err := observability.NewOpenTelemetry(ctx, cfg.OTLPHTTPEndpoint, cfg.OTelServiceName, cfg.OTLPInsecure)
		if err != nil {
			panic(err)
		}
		probe = append(probe, telemetry)
		defer func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = telemetry.Shutdown(shutdownCtx)
		}()
	}
	invitedEmails := make(map[string]struct{}, len(cfg.AccountInvitedEmails))
	for _, email := range cfg.AccountInvitedEmails {
		invitedEmails[email] = struct{}{}
	}
	invitationAdmins := make(map[string]struct{}, len(cfg.InvitationAdminIdentities))
	invitationAdminUsers := make(map[string]struct{}, len(cfg.InvitationAdminIdentities))
	for _, configured := range cfg.InvitationAdminIdentities {
		invitationAdmins[configured] = struct{}{}
		separator := strings.LastIndex(configured, "#")
		invitationAdminUsers[identity.UserID(configured[:separator], configured[separator+1:])] = struct{}{}
	}
	application := app.App{Auth: sessions, IdentityVerifier: verifier, Sessions: sessions, SessionTTL: time.Duration(cfg.SessionTTLMinutes) * time.Minute, SessionAbsoluteTTL: time.Duration(cfg.SessionAbsoluteTTLMinutes) * time.Minute, AuthorizationMaxAttempts: cfg.AuthorizationMaxAttempts, AllowAccountProvisioning: cfg.AccountProvisioningMode == "open", InvitedEmails: invitedEmails, InvitationAdmins: invitationAdmins, InvitationAdminUsers: invitationAdminUsers, Invitations: store, AllowAccountDeactivation: cfg.AccountSelfDeactivationEnabled, Users: store, Authorizer: authorizer, Resources: store, Audits: store, AuditRateLimiter: auditLimiter, AuthorizationOutbox: store, AuthorizationSerializer: store, Clock: clock, Dependencies: []ports.HealthChecker{store, authorizer}, CursorSigningKey: []byte(cfg.CursorSigningKey), Probe: probe}
	go reconcile(ctx, application, uuid.NewString())
	domainDependencies := generated.Dependencies{DB: store.DB, Auth: sessions, Authorizer: authorizer, AuthorizationOutbox: store, AuthorizationSerializer: store, Audits: store, AuditRateLimiter: auditLimiter, Clock: clock, Probe: probe, NewID: uuid.NewString, AuthorizationWorker: uuid.NewString(), AuthorizationLease: 30 * time.Second, CursorSigningKey: []byte(cfg.CursorSigningKey)}
	registrations := append(generated.Registrations(domainDependencies), inventoryphotos.Registration(domainDependencies, photoprocessor.New()))
	handler, _ := httpserver.New(application, generated.Domains, httpserver.Options{OIDCIssuer: cfg.OIDCIssuer, OIDCDiscoveryURL: discoveryURL, OIDCAuthorizationURL: authorizationURL, OIDCTokenURL: tokenURL, OIDCDocsClientID: cfg.OIDCDocsClientID, OIDCDocsRedirectURI: cfg.OIDCDocsRedirectURI, PublicBaseURL: cfg.PublicBaseURL, CORSAllowedOrigins: cfg.CORSAllowedOrigins, TrustedProxyCIDRs: cfg.TrustedProxyCIDRs, DisableDocs: cfg.ScalarDocsDisabled, RequestRateLimiter: requestLimiter, Clock: clock, Probe: probe, MetricsHandler: metrics, DomainRegistrations: registrations})
	server := &http.Server{Addr: cfg.HTTPAddr, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
func reconcile(ctx context.Context, application app.App, worker string) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		if err := application.ReconcileAuthorization(ctx, worker, 25); err != nil {
			slog.Error("authorization reconciliation failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
