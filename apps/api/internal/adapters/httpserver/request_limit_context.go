package httpserver

import "context"

type requestLimitKey struct{}

// RequestLimitApplied is server-owned evidence, never a client-supplied header.
// Anonymous public read routes use it to fail closed if composition omits the
// coordinated source limiter or clock.
func RequestLimitApplied(ctx context.Context) bool { return ctx.Value(requestLimitKey{}) == true }

func markRequestLimited(ctx context.Context) context.Context {
	return context.WithValue(ctx, requestLimitKey{}, true)
}
