package ratelimit

import (
	"context"
	"gorm.io/gorm"
	"testing"
	"time"
)

func TestContextLimiterCancellationFailsClosed(t *testing.T) {
	limiter, _ := New(&gorm.DB{}, "request", 5, time.Minute, 10000)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if ok, err := limiter.AllowContext(ctx, "source", time.Now()); ok || err != context.Canceled {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
}
