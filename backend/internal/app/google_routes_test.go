package app

import (
	"github.com/bms-del112/wuzz-chat/internal/testutil/pgtest"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/shared/config"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func newGoogleTestRouter(t *testing.T, clientIDs []string) http.Handler {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "google_routes.db")
	if pg, ok := pgtest.NewDSN(t); ok {
		dsn = pg
		prepareProductionShape(t, pg)
	}
	t.Setenv("DATABASE_URL", dsn)
	t.Setenv("DB_DRIVER", "")

	app, err := New(&config.Config{
		Port:               "8080",
		CORSAllowedOrigins: "*",
		JWTSecret:          "test_secret",
		UploadDir:          t.TempDir(),
		MediaRetentionDays: 7,
		AuthRateLimitIP:    100,
		AuthRateLimitUser:  100,

		GoogleOAuthClientIDs: clientIDs,
	})
	if err != nil {
		t.Fatalf("gagal membuat aplikasi: %v", err)
	}
	t.Cleanup(func() { app.Close() })
	return app.setupRouter()
}

func doJSON(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "10.1.1.1:5555"
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestGoogleRoutes_DisabledWithoutClientIDs(t *testing.T) {
	r := newGoogleTestRouter(t, nil)
	for _, p := range []string{"/api/auth/google", "/api/auth/google/register", "/api/auth/google/link"} {
		rr := doJSON(r, http.MethodPost, p, `{"id_token":"x"}`)
		if rr.Code != http.StatusServiceUnavailable || !strings.Contains(rr.Body.String(), "GOOGLE_NOT_CONFIGURED") {
			t.Fatalf("%s tanpa client ID harus 503 GOOGLE_NOT_CONFIGURED, dapat %d %s", p, rr.Code, rr.Body.String())
		}
	}
}

func TestGoogleRoutes_EnabledWithClientIDs(t *testing.T) {
	r := newGoogleTestRouter(t, []string{"test-client.apps.googleusercontent.com"})

	// Token sampah ditolak sebelum ada permintaan jaringan ke Google.
	rr := doJSON(r, http.MethodPost, "/api/auth/google", `{"id_token":"bukan-token"}`)
	if rr.Code != http.StatusUnauthorized || !strings.Contains(rr.Body.String(), "GOOGLE_TOKEN_INVALID") {
		t.Fatalf("token sampah harus 401 GOOGLE_TOKEN_INVALID, dapat %d %s", rr.Code, rr.Body.String())
	}
	// Link token palsu.
	rr = doJSON(r, http.MethodPost, "/api/auth/google/register", `{"link_token":"abc","username":"alice"}`)
	if rr.Code != http.StatusUnauthorized || !strings.Contains(rr.Body.String(), "LINK_TOKEN_INVALID") {
		t.Fatalf("link token palsu harus 401 LINK_TOKEN_INVALID, dapat %d %s", rr.Code, rr.Body.String())
	}
	// Pengelolaan tautan butuh JWT.
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		if rr := doJSON(r, m, "/api/auth/me/google", `{}`); rr.Code != http.StatusUnauthorized {
			t.Fatalf("%s /api/auth/me/google tanpa JWT harus 401, dapat %d", m, rr.Code)
		}
	}
}

// Jalur password lama harus tetap berfungsi penuh lewat router (register, login, me, hapus akun dengan password).
func TestGoogleRoutes_PasswordFlowUnaffected(t *testing.T) {
	r := newGoogleTestRouter(t, []string{"test-client.apps.googleusercontent.com"})

	rr := doJSON(r, http.MethodPost, "/api/auth/register", `{"username":"legacy_user","display_name":"Legacy","password":"password123","device_id":"d1"}`)
	if rr.Code != http.StatusCreated {
		t.Fatalf("register password harus 201, dapat %d %s", rr.Code, rr.Body.String())
	}
	rr = doJSON(r, http.MethodPost, "/api/auth/login", `{"username":"legacy_user","password":"password123","device_id":"d1"}`)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"token"`) {
		t.Fatalf("login password harus 200, dapat %d %s", rr.Code, rr.Body.String())
	}
	rr = doJSON(r, http.MethodPost, "/api/auth/login", `{"username":"legacy_user","password":"salah","device_id":"d1"}`)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("login password salah harus 401, dapat %d", rr.Code)
	}
}

// prepareProductionShape membuat tabel users lebih dulu dengan skema produksi (metadata JSONB) supaya migrasi aplikasi
// berjalan pada bentuk tabel yang sama seperti Postgres produksi.
func prepareProductionShape(t *testing.T, dsn string) {
	t.Helper()
	ms, err := store.NewSQLMessageStore("postgres", dsn)
	if err != nil {
		t.Fatalf("gagal menyiapkan skema: %v", err)
	}
	defer ms.Close()
	pgtest.ProductionShape(t, ms.DB())
}
