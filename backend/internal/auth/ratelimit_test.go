package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestIPRateLimiter(t *testing.T) {
	limiter := NewIPRateLimiter(3, 100*time.Millisecond)

	ip := "192.168.1.100"

	// 3 request pertama harus diizinkan
	if !limiter.Allow(ip) {
		t.Errorf("request 1 should be allowed")
	}
	if !limiter.Allow(ip) {
		t.Errorf("request 2 should be allowed")
	}
	if !limiter.Allow(ip) {
		t.Errorf("request 3 should be allowed")
	}

	// Request ke-4 dalam window harus ditolak (false)
	if limiter.Allow(ip) {
		t.Errorf("request 4 should be rejected")
	}

	// Tunggu window habis
	time.Sleep(150 * time.Millisecond)

	// Sekarang harus diizinkan lagi
	if !limiter.Allow(ip) {
		t.Errorf("request after window expiry should be allowed")
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	limiter := NewIPRateLimiter(2, 200*time.Millisecond)
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	wrapped := RateLimitMiddleware(limiter)(dummyHandler)

	req := httptest.NewRequest("POST", "/api/auth/login", nil)
	req.RemoteAddr = "10.0.0.1:12345"

	// Req 1 -> 200 OK
	w1 := httptest.NewRecorder()
	wrapped.ServeHTTP(w1, req)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200, got: %d", w1.Code)
	}

	// Req 2 -> 200 OK
	w2 := httptest.NewRecorder()
	wrapped.ServeHTTP(w2, req)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got: %d", w2.Code)
	}

	// Req 3 -> 429 Too Many Requests
	w3 := httptest.NewRecorder()
	wrapped.ServeHTTP(w3, req)
	if w3.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 Too Many Requests, got: %d", w3.Code)
	}
}
