package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/shared/config"
)

func newFreezeRouter(t *testing.T, deadline time.Time, freeze bool) (*Application, http.Handler) {
	t.Helper()
	t.Setenv("DATABASE_URL", filepath.Join(t.TempDir(), "freeze_routes.db"))
	t.Setenv("DB_DRIVER", "")

	app, err := New(&config.Config{
		Port:               "8080",
		CORSAllowedOrigins: "*",
		JWTSecret:          "test_secret",
		UploadDir:          t.TempDir(),
		MediaRetentionDays: 7,
		AuthRateLimitIP:    100,
		AuthRateLimitUser:  100,

		GoogleOAuthClientIDs: []string{"test-client.apps.googleusercontent.com"},
		GoogleLinkDeadline:   deadline,
		GoogleLinkFreeze:     freeze,
	})
	if err != nil {
		t.Fatalf("gagal membuat aplikasi: %v", err)
	}
	t.Cleanup(func() { app.Close() })
	return app, app.setupRouter()
}

func call(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "10.2.2.2:4444"
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func registerLegacy(t *testing.T, h http.Handler) string {
	t.Helper()
	rr := call(h, http.MethodPost, "/api/auth/register", "", `{"username":"legacy_user","display_name":"Legacy","password":"password123","device_id":"d1"}`)
	if rr.Code != http.StatusCreated {
		t.Fatalf("register harus 201, dapat %d %s", rr.Code, rr.Body.String())
	}
	var res map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	return res["token"].(string)
}

func TestLinkFreeze_EndToEnd_AfterDeadline(t *testing.T) {
	app, h := newFreezeRouter(t, time.Now().Add(-time.Hour), true)
	if app.LinkFreeze == nil || !app.LinkFreeze.Active() {
		t.Fatal("kebijakan pembekuan harus aktif setelah tenggat dengan saklar menyala")
	}
	token := registerLegacy(t, h)

	// Layanan diblokir dengan 403 GOOGLE_LINK_REQUIRED.
	rr := call(h, http.MethodGet, "/api/conversations", token, "")
	if rr.Code != http.StatusForbidden || !strings.Contains(rr.Body.String(), "GOOGLE_LINK_REQUIRED") {
		t.Fatalf("layanan harus 403 GOOGLE_LINK_REQUIRED, dapat %d %s", rr.Code, rr.Body.String())
	}
	if rr := call(h, http.MethodGet, "/ws?token="+token+"&device_id=d1", "", ""); rr.Code != http.StatusForbidden {
		t.Fatalf("WebSocket akun beku harus 403, dapat %d", rr.Code)
	}

	// Yang tetap terbuka: status akun (dengan flag beku), versi, dan kesehatan.
	rr = call(h, http.MethodGet, "/api/auth/me", token, "")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"google_link_frozen":true`) {
		t.Fatalf("/me harus 200 dengan google_link_frozen=true, dapat %d %s", rr.Code, rr.Body.String())
	}
	for _, p := range []string{"/health", "/api/app/version"} {
		if rr := call(h, http.MethodGet, p, token, ""); rr.Code != http.StatusOK {
			t.Fatalf("%s harus tetap 200, dapat %d", p, rr.Code)
		}
	}

	// Login username tetap berhasil (satu-satunya jalan untuk menautkan akun lama) dan memberi tahu klien bahwa akun beku.
	rr = call(h, http.MethodPost, "/api/auth/login", "", `{"username":"legacy_user","password":"password123","device_id":"d1"}`)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"google_link_frozen":true`) {
		t.Fatalf("login harus 200 dengan google_link_frozen=true, dapat %d %s", rr.Code, rr.Body.String())
	}
	var login map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &login)

	// Menghapus akun tetap bisa (syarat Play) walau beku; password salah tetap 401, bukan 403.
	if rr := call(h, http.MethodDelete, "/api/auth/me", login["token"].(string), `{"password":"salah"}`); rr.Code != http.StatusUnauthorized {
		t.Fatalf("hapus akun dengan password salah harus 401 (bukan 403), dapat %d %s", rr.Code, rr.Body.String())
	}
}

func TestLinkFreeze_EndToEnd_Inactive(t *testing.T) {
	// Sebelum tenggat: tidak ada yang dibekukan walau saklar menyala.
	app, h := newFreezeRouter(t, time.Now().Add(48*time.Hour), true)
	if app.LinkFreeze == nil || app.LinkFreeze.Active() {
		t.Fatal("sebelum tenggat kebijakan ada tetapi belum aktif")
	}
	token := registerLegacy(t, h)
	if rr := call(h, http.MethodGet, "/api/conversations", token, ""); rr.Code == http.StatusForbidden {
		t.Fatalf("sebelum tenggat tidak boleh 403, dapat %d", rr.Code)
	}
	if rr := call(h, http.MethodGet, "/api/auth/me", token, ""); strings.Contains(rr.Body.String(), "google_link_frozen") {
		t.Fatalf("flag beku tidak boleh muncul sebelum tenggat: %s", rr.Body.String())
	}

	// Saklar mati: tenggat lewat pun tidak membekukan (kill switch).
	app2, h2 := newFreezeRouter(t, time.Now().Add(-time.Hour), false)
	if app2.LinkFreeze != nil {
		t.Fatal("tanpa saklar tidak boleh ada kebijakan pembekuan")
	}
	token2 := registerLegacy(t, h2)
	if rr := call(h2, http.MethodGet, "/api/conversations", token2, ""); rr.Code == http.StatusForbidden {
		t.Fatalf("saklar mati tidak boleh 403, dapat %d", rr.Code)
	}
}
