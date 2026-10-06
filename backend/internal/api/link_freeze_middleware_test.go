package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type freezeEnv struct {
	oauth     *store.SQLOAuthStore
	frozenTok string
	linkedTok string
	b2bTok    string
	frozenID  string
	mkHandler func(enabled bool, deadline time.Time) (http.Handler, *authz.LinkFreezePolicy)
}

func setupFreezeEnv(t *testing.T) *freezeEnv {
	t.Helper()
	ms, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "freeze.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ms.Close() })
	users := store.NewSQLUserStore(ms.DB(), ms.DriverName())
	oauth := store.NewSQLOAuthStore(ms.DB(), ms.DriverName())

	legacy, err := users.Register("legacy", "Legacy", "password123")
	if err != nil {
		t.Fatal(err)
	}
	linkedID, err := oauth.CreateUserWithOAuth(context.Background(), "gonly", "G Only", "google", "sub-g", "g@example.com")
	if err != nil {
		t.Fatal(err)
	}
	b2b, err := users.RegisterWithContext(tenantshared.WithTenant(context.Background(), "acme"), "b2buser", "B2B", "password123")
	if err != nil {
		t.Fatal(err)
	}
	mk := func(id, name, tenant string) string {
		tok, _, err := auth.GenerateTokenDetailedWithTenant(id, name, name, tenant)
		if err != nil {
			t.Fatal(err)
		}
		return tok
	}
	e := &freezeEnv{oauth: oauth, frozenID: legacy.ID,
		frozenTok: mk(legacy.ID, "legacy", "default"), linkedTok: mk(linkedID, "gonly", "default"), b2bTok: mk(b2b.ID, "b2buser", "acme")}
	e.mkHandler = func(enabled bool, deadline time.Time) (http.Handler, *authz.LinkFreezePolicy) {
		p := authz.NewLinkFreezePolicy(enabled, deadline, oauth)
		next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
		return api.NewLinkFreezeMiddleware(p).Middleware(next), p
	}
	return e
}

func doFreeze(h http.Handler, method, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

var pastDeadline = time.Now().Add(-time.Hour)

func TestLinkFreezeMiddleware_FrozenAccount(t *testing.T) {
	e := setupFreezeEnv(t)
	h, _ := e.mkHandler(true, pastDeadline)

	// Diblokir: semua fitur layanan, termasuk upgrade WebSocket (token lewat query) dan metode yang salah pada rute yang diizinkan.
	blocked := []struct{ method, path string }{
		{"GET", "/api/chats"}, {"POST", "/api/messages"}, {"GET", "/api/users/search"}, {"GET", "/api/feed"},
		{"GET", "/api/calls/ice-servers"}, {"POST", "/api/auth/change-password"}, {"POST", "/api/auth/verify-password"},
		{"PUT", "/api/auth/me"}, {"GET", "/api/auth/me/google"}, {"DELETE", "/api/auth/me/google"}, {"PUT", "/api/auth/me/google"},
		{"GET", "/api/auth/logout"}, {"GET", "/api/auth/sessions"}, {"POST", "/api/user/public-key/reset"},
	}
	for _, c := range blocked {
		w := doFreeze(h, c.method, c.path, e.frozenTok)
		if w.Code != http.StatusForbidden {
			t.Errorf("%s %s harus 403 untuk akun beku, dapat %d", c.method, c.path, w.Code)
			continue
		}
		var body map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		if body["code"] != api.CodeGoogleLinkRequired || body["error"] != api.CodeGoogleLinkRequired || body["message"] == "" {
			t.Errorf("%s %s: bentuk 403 salah: %s", c.method, c.path, w.Body.String())
		}
	}

	// WebSocket: token lewat query, tanpa header.
	req := httptest.NewRequest("GET", "/ws?token="+e.frozenTok+"&device_id=d1", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Errorf("upgrade /ws akun beku harus 403, dapat %d", w.Code)
	}

	// Diizinkan: keluar dari keadaan beku (lihat status, tautkan Google, keluar, perpanjang sesi, HAPUS AKUN) dan rute publik.
	allowed := []struct{ method, path string }{
		{"GET", "/api/auth/me"}, {"DELETE", "/api/auth/me"}, {"POST", "/api/auth/me/google"},
		{"POST", "/api/auth/logout"}, {"POST", "/api/auth/refresh"},
		{"GET", "/health"}, {"GET", api.VersionInfoPath}, {"GET", "/api/config"}, {"GET", "/api/docs"},
		{"POST", "/api/auth/google"}, {"POST", "/api/auth/google/register"}, {"POST", "/api/auth/google/link"},
		{"OPTIONS", "/api/chats"},
	}
	for _, c := range allowed {
		if w := doFreeze(h, c.method, c.path, e.frozenTok); w.Code != http.StatusOK {
			t.Errorf("%s %s harus tetap diizinkan untuk akun beku, dapat %d", c.method, c.path, w.Code)
		}
	}
}

func TestLinkFreezeMiddleware_PassThrough(t *testing.T) {
	e := setupFreezeEnv(t)
	h, _ := e.mkHandler(true, pastDeadline)

	cases := map[string]string{
		"akun sudah tertaut":          e.linkedTok,
		"tenant B2B":                  e.b2bTok,
		"tanpa token":                 "",
		"token palsu":                 "bukan-jwt",
		"token penautan (bukan sesi)": func() string { tk, _, _ := auth.GenerateLinkToken("google", "s", ""); return tk }(),
	}
	for name, tok := range cases {
		if w := doFreeze(h, "GET", "/api/chats", tok); w.Code != http.StatusOK {
			t.Errorf("%s: harus dilewatkan (handler yang menjawab 401 bila perlu), dapat %d", name, w.Code)
		}
	}

	// Sebelum tenggat dan saklar mati: akun belum tertaut tidak disentuh sama sekali.
	before, _ := e.mkHandler(true, time.Now().Add(24*time.Hour))
	if w := doFreeze(before, "GET", "/api/chats", e.frozenTok); w.Code != http.StatusOK {
		t.Errorf("sebelum tenggat harus lewat, dapat %d", w.Code)
	}
	off, _ := e.mkHandler(false, pastDeadline)
	if w := doFreeze(off, "GET", "/api/chats", e.frozenTok); w.Code != http.StatusOK {
		t.Errorf("saklar mati harus lewat walau tenggat lewat, dapat %d", w.Code)
	}
	var nilPolicy http.Handler = api.NewLinkFreezeMiddleware(nil).Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	if w := doFreeze(nilPolicy, "GET", "/api/chats", e.frozenTok); w.Code != http.StatusOK {
		t.Errorf("policy nil harus pass-through, dapat %d", w.Code)
	}
}

func TestLinkFreezeMiddleware_LinkingUnfreezesImmediately(t *testing.T) {
	e := setupFreezeEnv(t)
	h, policy := e.mkHandler(true, pastDeadline)

	if w := doFreeze(h, "GET", "/api/chats", e.frozenTok); w.Code != http.StatusForbidden {
		t.Fatalf("awalnya beku, dapat %d", w.Code)
	}
	if err := e.oauth.LinkOAuth(context.Background(), e.frozenID, "google", "sub-new", "x"); err != nil {
		t.Fatal(err)
	}
	policy.Invalidate(e.frozenID) // dipanggil handler penautan
	if w := doFreeze(h, "GET", "/api/chats", e.frozenTok); w.Code != http.StatusOK {
		t.Fatalf("setelah menautkan Google dan Invalidate, harus langsung bebas, dapat %d", w.Code)
	}
}
