package httpserver

import "context"

type requestLimitKey struct{}
type limitedRequest struct{ source string }

// RequestLimitApplied is server-owned evidence, never a client-supplied header.
// Anonymous public read routes use it to fail closed if composition omits the
// coordinated source limiter or clock.
func RequestLimitApplied(ctx context.Context) bool { return RequestSource(ctx) != "" }

// RequestSource is the normalized identity charged by the request middleware.
// An empty value means no trusted rate-limit evidence is present.
func RequestSource(ctx context.Context) string {
	value, _ := ctx.Value(requestLimitKey{}).(limitedRequest)
	return value.source
}

func markRequestLimited(ctx context.Context, source string) context.Context {
	return context.WithValue(ctx, requestLimitKey{}, limitedRequest{source: source})
}
