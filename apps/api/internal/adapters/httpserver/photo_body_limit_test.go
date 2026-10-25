package httpserver

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOnlyMediaUploadReceivesLargerBodyBudget(t *testing.T) {
	for _, tc := range []struct {
		method, path string
		allow        bool
	}{
		{"POST", "/v1/dealers/shop/inventory/piano/photos", true},
		{"POST", "/v1/dealers/shop/banner", true},
		{"PUT", "/v1/dealers/shop/banner", false},
		{"POST", "/v1/dealers//banner", false},
		{"POST", "/v1/dealers/shop/banner/extra", false},
		{"POST", "/v1/dealers/shop/not-banner", false},
		{"PUT", "/v1/dealers/shop/inventory/piano/photos/order", false},
		{"POST", "/v1/dealers/shop/inventory/piano", false},
		{"POST", "/v1/dealers//inventory/piano/photos", false},
		{"POST", "/v1/dealers/shop/inventory/piano/photos/extra", false},
		{"PATCH", "/v1/dealers/shop/inventory/piano/photos", false},
	} {
		h := withSecurity(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, err := io.ReadAll(r.Body)
			var limit *http.MaxBytesError
			if tc.allow && err != nil {
				t.Fatalf("upload budget: %v", err)
			}
			if !tc.allow && !errors.As(err, &limit) {
				t.Fatalf("expanded unrelated body budget %s %s: %v", tc.method, tc.path, err)
			}
		}))
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(tc.method, tc.path, bytes.NewReader(make([]byte, (1<<20)+1))))
	}
}
