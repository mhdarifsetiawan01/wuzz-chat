package api

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
)

func iceRequest(t *testing.T, h *IceHandler, method string, withAuth bool) *httptest.ResponseRecorder {
	t.Helper()
	token, _ := auth.GenerateToken("usr_ice", "ice", "Ice")
	req := httptest.NewRequest(method, "/api/calls/ice-servers", nil)
	if withAuth {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	auth.RequireJWT()(h).ServeHTTP(w, req)
	return w
}

func TestIceHandler_TURNCredentialsMatchCoturnRestAPI(t *testing.T) {
	h := NewIceHandler("s3cret", "turn:1.2.3.4:3478?transport=udp, turn:1.2.3.4:3478?transport=tcp", "stun:stun.example:19302", 10*time.Minute)
	fixed := time.Unix(1_800_000_000, 0)
	h.now = func() time.Time { return fixed }

	w := iceRequest(t, h, http.MethodGet, true)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("kredensial tidak boleh di-cache")
	}
	var res IceServersResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.TTL != 600 || len(res.IceServers) != 2 {
		t.Fatalf("respons tak terduga: %+v", res)
	}
	stun, turn := res.IceServers[0], res.IceServers[1]
	if stun.Username != "" || stun.Credential != "" || stun.URLs[0] != "stun:stun.example:19302" {
		t.Fatalf("STUN tidak boleh membawa kredensial: %+v", stun)
	}
	if len(turn.URLs) != 2 || turn.URLs[1] != "turn:1.2.3.4:3478?transport=tcp" {
		t.Fatalf("URL TURN salah: %+v", turn.URLs)
	}
	wantExp := strconv.FormatInt(fixed.Add(10*time.Minute).Unix(), 10)
	if turn.Username != wantExp+":usr_ice" {
		t.Fatalf("username harus <kedaluwarsa>:<userID>, got %q", turn.Username)
	}
	mac := hmac.New(sha1.New, []byte("s3cret"))
	mac.Write([]byte(turn.Username))
	if turn.Credential != base64.StdEncoding.EncodeToString(mac.Sum(nil)) {
		t.Fatal("credential bukan base64(HMAC-SHA1(secret, username)) seperti yang diminta coturn")
	}
}

func TestIceHandler_WithoutSecretOnlyServesSTUN(t *testing.T) {
	h := NewIceHandler("", "turn:1.2.3.4:3478", "stun:a,stun:b", 0)
	if h.TURNEnabled() {
		t.Fatal("TURN harus nonaktif tanpa secret")
	}
	w := iceRequest(t, h, http.MethodGet, true)
	var res IceServersResponse
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if len(res.IceServers) != 1 || strings.Contains(w.Body.String(), "credential") {
		t.Fatalf("hanya STUN tanpa kredensial yang boleh keluar: %s", w.Body.String())
	}
	if res.TTL != 600 {
		t.Fatalf("ttl default 10 menit, got %d", res.TTL)
	}
}

func TestIceHandler_AuthAndMethod(t *testing.T) {
	h := NewIceHandler("s", "turn:x", "", time.Minute)
	if w := iceRequest(t, h, http.MethodGet, false); w.Code != http.StatusUnauthorized {
		t.Fatalf("tanpa token: want 401, got %d", w.Code)
	}
	if w := iceRequest(t, h, http.MethodPost, true); w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST: want 405, got %d", w.Code)
	}
}
