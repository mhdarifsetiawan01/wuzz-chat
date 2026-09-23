package ratelimit

import (
	"bytes"
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

func TestDualTierRateLimiter(t *testing.T) {
	// IP limit: 5, User limit: 2
	limiter := NewDualTierRateLimiter(5, 2, 150*time.Millisecond)
	ip := "203.0.113.10"

	// User "alice" kirim 2 request -> OK
	ok, _ := limiter.Allow(ip, "alice")
	if !ok {
		t.Errorf("alice req 1 should be allowed")
	}
	ok, _ = limiter.Allow(ip, "alice")
	if !ok {
		t.Errorf("alice req 2 should be allowed")
	}

	// User "alice" kirim request ke-3 -> Tolak (alasan: user)
	ok, reason := limiter.Allow(ip, "alice")
	if ok || reason != "user" {
		t.Errorf("alice req 3 should be rejected by user limit, got: ok=%v, reason=%s", ok, reason)
	}

	// User "bob" dari IP yang sama -> Masih diizinkan (karena IP baru 3 req, user limit bob masih 0)
	ok, _ = limiter.Allow(ip, "bob")
	if !ok {
		t.Errorf("bob req 1 from same IP should be allowed")
	}
	ok, _ = limiter.Allow(ip, "bob")
	if !ok {
		t.Errorf("bob req 2 from same IP should be allowed")
	}

	// Request ke-6 dari IP (user charlie) -> Tolak karena IP limit (5) tercapai
	ok, reason = limiter.Allow(ip, "charlie")
	if ok || reason != "ip" {
		t.Errorf("charlie req should be rejected by IP limit, got: ok=%v, reason=%s", ok, reason)
	}
}

func TestDualRateLimitMiddleware(t *testing.T) {
	limiter := NewDualTierRateLimiter(10, 2, 200*time.Millisecond)

	var receivedUsernames []string
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username := ExtractUsernameFromBody(r)
		receivedUsernames = append(receivedUsernames, username)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	wrapped := DualRateLimitMiddleware(limiter)(handler)

	makeReq := func(username string) *httptest.ResponseRecorder {
		body := []byte(`{"username":"` + username + `","password":"password123"}`)
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "192.168.1.50:54321"
		w := httptest.NewRecorder()
		wrapped.ServeHTTP(w, req)
		return w
	}

	// User "john" 2 req sukses
	w1 := makeReq("john")
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w1.Code)
	}
	w2 := makeReq("john")
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w2.Code)
	}

	// User "john" req 3 ditolak 429
	w3 := makeReq("john")
	if w3.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", w3.Code, w3.Body.String())
	}

	// User "sarah" di IP sama tetap sukses
	w4 := makeReq("sarah")
	if w4.Code != http.StatusOK {
		t.Fatalf("expected 200 for sarah, got %d: %s", w4.Code, w4.Body.String())
	}

	// Verifikasi bahwa body stream tetap terbaca utuh di dalam downstream handler
	if len(receivedUsernames) < 3 || receivedUsernames[0] != "john" || receivedUsernames[2] != "sarah" {
		t.Fatalf("downstream handler failed to read preserved body stream: %v", receivedUsernames)
	}
}
