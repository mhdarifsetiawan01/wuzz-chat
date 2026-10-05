package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/shared/ratelimit"
)

func TestUserRateLimitMsg_PerUserQuotaAnd429Contract(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	h := auth.RequireJWT()(UserRateLimitMsg(ratelimit.NewIPRateLimiter(3, time.Minute), "kuota habis", 900)(ok))

	do := func(tok string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		return w
	}
	tokA, _ := auth.GenerateToken("usr_a", "a", "A")
	tokB, _ := auth.GenerateToken("usr_b", "b", "B")

	for i := 0; i < 3; i++ {
		if w := do(tokA); w.Code != http.StatusOK {
			t.Fatalf("request %d dalam kuota harus 200, got %d", i+1, w.Code)
		}
	}
	w := do(tokA)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("melebihi kuota harus 429, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") != "900" {
		t.Fatalf("Retry-After harus 900, got %q", w.Header().Get("Retry-After"))
	}
	if got := w.Body.String(); got != `{"error":"kuota habis"}` {
		t.Fatalf("badan 429 tak terduga: %s", got)
	}
	// kuota per pengguna: user lain tidak ikut terblokir
	if w := do(tokB); w.Code != http.StatusOK {
		t.Fatalf("user lain harus tetap 200, got %d", w.Code)
	}
}
