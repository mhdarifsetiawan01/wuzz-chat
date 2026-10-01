package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/shared/ratelimit"
)

func TestIsBlockedUploadExt(t *testing.T) {
	for _, e := range []string{".html", ".HTM", ".js", ".exe", ".jar", ".xhtml"} {
		if !isBlockedUploadExt(e) {
			t.Fatalf("%s should be blocked", e)
		}
	}
	// Tipe sah yang dipakai klien lama harus tetap lolos
	for _, e := range []string{".jpg", ".png", ".pdf", ".docx", ".zip", ".m4a", ".webm", ".mp4", ".svg", ".apk", ".txt", ".bin", ""} {
		if isBlockedUploadExt(e) {
			t.Fatalf("%s must stay allowed (backward compat)", e)
		}
	}
}

func TestValidateFeedImage(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
	jpg := []byte("\xff\xd8\xff\xe0\x00\x10JFIF")
	html := []byte("<html><script>alert(1)</script></html>")
	if !validateFeedImage(".png", png) || !validateFeedImage(".JPG", jpg) {
		t.Fatal("valid images rejected")
	}
	if validateFeedImage(".png", html) {
		t.Fatal("html disguised as png accepted")
	}
	if validateFeedImage(".svg", png) || validateFeedImage(".html", html) || validateFeedImage(".bin", png) {
		t.Fatal("non-allowlisted ext accepted")
	}
	if !validateFeedImage(".heic", []byte("\x00\x00\x00\x18ftypheic\x00\x00")) {
		t.Fatal("heic rejected")
	}
}

func TestUploadsSecurityHeaders(t *testing.T) {
	h := UploadsSecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/a.jpg", nil))
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" || rec.Header().Get("Content-Disposition") != "" {
		t.Fatalf("image headers wrong: %v", rec.Header())
	}

	for _, p := range []string{"/x.html", "/x.SVG"} {
		rec = httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", p, nil))
		if rec.Header().Get("Content-Disposition") != "attachment" || rec.Header().Get("Content-Security-Policy") == "" {
			t.Fatalf("%s must be attachment+sandbox: %v", p, rec.Header())
		}
	}
}

func TestUserRateLimit(t *testing.T) {
	h := UserRateLimit(ratelimit.NewIPRateLimiter(2, time.Minute))(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	codes := []int{}
	for i := 0; i < 3; i++ {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("POST", "/x", nil))
		codes = append(codes, rec.Code)
	}
	if codes[0] != 200 || codes[1] != 200 || codes[2] != 429 {
		t.Fatalf("unexpected codes: %v", codes)
	}
}
