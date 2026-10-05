package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/bms-del112/wuzz-chat/internal/testutil/pgtest"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/authz/google"
	"github.com/bms-del112/wuzz-chat/internal/authz/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type stubVerifier map[string]*google.Identity

func (s stubVerifier) Verify(_ context.Context, tok string) (*google.Identity, error) {
	if id, ok := s[tok]; ok {
		cp := *id
		return &cp, nil
	}
	return nil, google.ErrInvalidIDToken
}

func (s stubVerifier) give(tok, sub string, age time.Duration) {
	s[tok] = &google.Identity{Subject: sub, Email: sub + "@example.com", EmailVerified: true, IssuedAt: time.Now().Add(-age)}
}

type googleHTTPEnv struct {
	h        *api.AuthHandler
	users    *store.SQLUserStore
	verifier stubVerifier
}

func setupGoogleHTTP(t *testing.T, configured bool) *googleHTTPEnv {
	t.Helper()
	driver, target := "sqlite", filepath.Join(t.TempDir(), "google_http.db")
	if dsn, ok := pgtest.NewDSN(t); ok {
		driver, target = "postgres", dsn
	}
	sqlStore, err := store.NewSQLMessageStore(driver, target)
	if err != nil {
		t.Fatalf("init store (%s): %v", driver, err)
	}
	t.Cleanup(func() { sqlStore.Close() })
	if driver == "postgres" {
		pgtest.ProductionShape(t, sqlStore.DB())
	}
	db, drv := sqlStore.DB(), sqlStore.DriverName()

	users := store.NewSQLUserStore(db, drv)
	users.SetCredentialStore(store.NewSQLCredentialStore(db, drv))
	devices := store.NewSQLDeviceStore(db, drv)
	sessions := store.NewSQLSessionStore(db, drv)
	tokens := store.NewSQLTokenStore(db, drv)
	auth.SetTokenChecker(tokens)
	t.Cleanup(func() { auth.SetTokenChecker(nil) })

	svc := authz.NewAuthService(infra.NewSQLAuthRepository(users, sessions, devices, tokens, nil), nil)
	v := stubVerifier{}
	if configured {
		svc.SetGoogleAuth(v, store.NewSQLOAuthStore(db, drv))
	}
	h := api.NewAuthHandlerWithService(svc, users)
	h.SetTokenStore(tokens)
	h.SetSessionStore(sessions)
	h.SetDeviceStore(devices)
	h.SetAccountEraser(store.NewSQLAccountEraser(db, drv))
	return &googleHTTPEnv{h: h, users: users, verifier: v}
}

func post(t *testing.T, fn http.HandlerFunc, method, body, bearer string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "/x", bytes.NewReader([]byte(body)))
	req.RemoteAddr = "10.0.0.1:1234"
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	if bearer != "" {
		auth.RequireJWT()(fn).ServeHTTP(w, req)
	} else {
		fn.ServeHTTP(w, req)
	}
	return w
}

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("respons bukan JSON: %v (%s)", err, w.Body.String())
	}
	return m
}

// signup menjalankan sign-in (belum tertaut) lalu register; mengembalikan token sesi dan user id.
func (e *googleHTTPEnv) signup(t *testing.T, tok, sub, username string) (string, string) {
	t.Helper()
	e.verifier.give(tok, sub, 0)
	w := post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"`+tok+`","device_id":"dev-`+username+`"}`, "")
	m := decode(t, w)
	if w.Code != http.StatusOK || m["code"] != "GOOGLE_NOT_LINKED" || m["link_token"] == "" {
		t.Fatalf("sign-in awal harus 200 GOOGLE_NOT_LINKED, dapat %d %s", w.Code, w.Body.String())
	}
	body, _ := json.Marshal(map[string]string{"link_token": m["link_token"].(string), "username": username, "device_id": "dev-" + username})
	w = post(t, e.h.GoogleRegister, http.MethodPost, string(body), "")
	if w.Code != http.StatusCreated {
		t.Fatalf("register harus 201, dapat %d %s", w.Code, w.Body.String())
	}
	res := decode(t, w)
	user := res["user"].(map[string]any)
	return res["token"].(string), user["id"].(string)
}

func TestGoogleHTTP_NotConfigured(t *testing.T) {
	e := setupGoogleHTTP(t, false)
	for name, fn := range map[string]http.HandlerFunc{"signin": e.h.GoogleSignIn, "register": e.h.GoogleRegister, "link": e.h.GoogleLinkExisting} {
		w := post(t, fn, http.MethodPost, `{}`, "")
		if w.Code != http.StatusServiceUnavailable || decode(t, w)["code"] != "GOOGLE_NOT_CONFIGURED" {
			t.Fatalf("%s tanpa konfigurasi harus 503 GOOGLE_NOT_CONFIGURED, dapat %d %s", name, w.Code, w.Body.String())
		}
	}
}

func TestGoogleHTTP_NewAccountLifecycle(t *testing.T) {
	e := setupGoogleHTTP(t, true)
	token, userID := e.signup(t, "tok-a", "sub-a", "alice")

	// Sign-in ulang langsung login.
	w := post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"tok-a","device_id":"dev-alice"}`, "")
	if w.Code != http.StatusOK || decode(t, w)["token"] == nil {
		t.Fatalf("sign-in kedua harus 200 dengan token, dapat %d %s", w.Code, w.Body.String())
	}

	// /me menunjukkan akun Google-only.
	w = post(t, e.h.Me, http.MethodGet, ``, token)
	me := decode(t, w)
	if w.Code != http.StatusOK || me["google_linked"] != true || me["has_password"] != false || me["username"] != "alice" || me["id"] != userID {
		t.Fatalf("/me salah: %d %s", w.Code, w.Body.String())
	}

	// Hash tidak pernah bocor.
	if bytes.Contains(w.Body.Bytes(), []byte("password_hash")) {
		t.Fatal("password_hash tidak boleh muncul di respons /me")
	}
}

func TestGoogleHTTP_ErrorMapping(t *testing.T) {
	e := setupGoogleHTTP(t, true)
	e.signup(t, "tok-a", "sub-a", "alice")

	cases := []struct {
		name   string
		fn     http.HandlerFunc
		body   string
		status int
		code   string
	}{
		{"token Google tak valid", e.h.GoogleSignIn, `{"id_token":"palsu"}`, 401, "GOOGLE_TOKEN_INVALID"},
		{"payload rusak", e.h.GoogleSignIn, `{bukan json`, 400, "VALIDATION_ERROR"},
		{"link token palsu (register)", e.h.GoogleRegister, `{"link_token":"abc","username":"bob"}`, 401, "LINK_TOKEN_INVALID"},
		{"link token palsu (link)", e.h.GoogleLinkExisting, `{"link_token":"abc","username":"bob","password":"x"}`, 401, "LINK_TOKEN_INVALID"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := post(t, c.fn, http.MethodPost, c.body, "")
			if w.Code != c.status || decode(t, w)["code"] != c.code {
				t.Fatalf("want %d %s, dapat %d %s", c.status, c.code, w.Code, w.Body.String())
			}
		})
	}

	// Method salah ditolak.
	if w := post(t, e.h.GoogleSignIn, http.MethodGet, ``, ""); w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET harus 405, dapat %d", w.Code)
	}

	// Validasi username & username bentrok.
	e.verifier.give("tok-b", "sub-b", 0)
	m := decode(t, post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"tok-b"}`, ""))
	link := m["link_token"].(string)
	if w := post(t, e.h.GoogleRegister, http.MethodPost, `{"link_token":"`+link+`","username":"admin"}`, ""); w.Code != 400 || decode(t, w)["code"] != "VALIDATION_ERROR" {
		t.Fatalf("username terlarang harus 400 VALIDATION_ERROR, dapat %d %s", w.Code, w.Body.String())
	}
	if w := post(t, e.h.GoogleRegister, http.MethodPost, `{"link_token":"`+link+`","username":"ALICE"}`, ""); w.Code != 409 || decode(t, w)["code"] != "USERNAME_TAKEN" {
		t.Fatalf("username bentrok harus 409 USERNAME_TAKEN, dapat %d %s", w.Code, w.Body.String())
	}
}

func TestGoogleHTTP_LinkExistingAccount(t *testing.T) {
	e := setupGoogleHTTP(t, true)
	if _, err := e.users.Register("legacy", "Legacy", "password123"); err != nil {
		t.Fatal(err)
	}
	e.verifier.give("tok-L", "sub-L", 0)
	m := decode(t, post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"tok-L"}`, ""))
	link := m["link_token"].(string)

	w := post(t, e.h.GoogleLinkExisting, http.MethodPost, `{"link_token":"`+link+`","username":"legacy","password":"salah","device_id":"d1"}`, "")
	if w.Code != 401 || decode(t, w)["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("password salah harus 401 INVALID_CREDENTIALS, dapat %d %s", w.Code, w.Body.String())
	}
	w = post(t, e.h.GoogleLinkExisting, http.MethodPost, `{"link_token":"`+link+`","username":"legacy","password":"password123","device_id":"d1"}`, "")
	if w.Code != 200 || decode(t, w)["token"] == nil {
		t.Fatalf("link harus 200 dengan token, dapat %d %s", w.Code, w.Body.String())
	}
	// Sesudahnya /me menunjukkan dua metode login.
	token := decode(t, w)["token"].(string)
	me := decode(t, post(t, e.h.Me, http.MethodGet, ``, token))
	if me["google_linked"] != true || me["has_password"] != true {
		t.Fatalf("akun lama harus punya Google dan password: %v", me)
	}
}

func TestGoogleHTTP_DeviceLimitUses409Shape(t *testing.T) {
	e := setupGoogleHTTP(t, true)
	e.signup(t, "tok-a", "sub-a", "alice") // dev-alice
	if w := post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"tok-a","device_id":"dev-2"}`, ""); w.Code != 200 {
		t.Fatalf("perangkat 2 harus 200, dapat %d %s", w.Code, w.Body.String())
	}
	w := post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"tok-a","device_id":"dev-3"}`, "")
	m := decode(t, w)
	if w.Code != http.StatusConflict || m["code"] != "DEVICE_LIMIT_REACHED" || m["max_devices"] != float64(2) {
		t.Fatalf("perangkat 3 harus 409 DEVICE_LIMIT_REACHED, dapat %d %s", w.Code, w.Body.String())
	}
	if devs, ok := m["active_devices"].([]any); !ok || len(devs) != 2 {
		t.Fatalf("active_devices harus memuat 2 perangkat, dapat %v", m["active_devices"])
	}
	if w := post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"tok-a","device_id":"dev-3","confirm_override":true}`, ""); w.Code != 200 {
		t.Fatalf("override harus 200, dapat %d %s", w.Code, w.Body.String())
	}
}

func TestGoogleHTTP_ManageGoogle(t *testing.T) {
	e := setupGoogleHTTP(t, true)
	legacy, err := e.users.Register("legacy", "Legacy", "password123")
	if err != nil {
		t.Fatal(err)
	}
	token, _ := auth.GenerateToken(legacy.ID, legacy.Username, legacy.DisplayName)

	e.verifier.give("tok-stale", "sub-L", 10*time.Minute)
	if w := post(t, e.h.ManageGoogle, http.MethodPost, `{"id_token":"tok-stale"}`, token); w.Code != 401 || decode(t, w)["code"] != "GOOGLE_REAUTH_STALE" {
		t.Fatalf("token basi harus 401 GOOGLE_REAUTH_STALE, dapat %d %s", w.Code, w.Body.String())
	}
	e.verifier.give("tok-L", "sub-L", 0)
	if w := post(t, e.h.ManageGoogle, http.MethodPost, `{"id_token":"tok-L"}`, token); w.Code != 200 {
		t.Fatalf("tautkan harus 200, dapat %d %s", w.Code, w.Body.String())
	}
	e.verifier.give("tok-M", "sub-M", 0)
	if w := post(t, e.h.ManageGoogle, http.MethodPost, `{"id_token":"tok-M"}`, token); w.Code != 409 || decode(t, w)["code"] != "ACCOUNT_ALREADY_HAS_GOOGLE" {
		t.Fatalf("Google kedua harus 409 ACCOUNT_ALREADY_HAS_GOOGLE, dapat %d %s", w.Code, w.Body.String())
	}
	if w := post(t, e.h.ManageGoogle, http.MethodDelete, `{"password":"salah"}`, token); w.Code != 401 {
		t.Fatalf("unlink password salah harus 401, dapat %d", w.Code)
	}
	if w := post(t, e.h.ManageGoogle, http.MethodDelete, `{"password":"password123"}`, token); w.Code != 200 {
		t.Fatalf("unlink harus 200, dapat %d %s", w.Code, w.Body.String())
	}
	if w := post(t, e.h.ManageGoogle, http.MethodGet, ``, token); w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET harus 405, dapat %d", w.Code)
	}
	if w := post(t, e.h.ManageGoogle, http.MethodPost, `{"id_token":"tok-L"}`, ""); w.Code != 401 {
		t.Fatalf("tanpa JWT harus 401, dapat %d", w.Code)
	}
}

func TestGoogleHTTP_DeleteAccountWithGoogleReauth(t *testing.T) {
	e := setupGoogleHTTP(t, true)
	token, userID := e.signup(t, "tok-a", "sub-a", "alice")

	if w := post(t, e.h.DeleteAccount, http.MethodDelete, `{}`, token); w.Code != 400 {
		t.Fatalf("tanpa bukti harus 400, dapat %d", w.Code)
	}
	// Password tidak bisa dipakai untuk akun tanpa password (hash kosong).
	if w := post(t, e.h.DeleteAccount, http.MethodDelete, `{"password":""}`, token); w.Code != 400 {
		t.Fatalf("password kosong harus 400, dapat %d", w.Code)
	}
	if w := post(t, e.h.DeleteAccount, http.MethodDelete, `{"password":"tebakan"}`, token); w.Code != 401 {
		t.Fatalf("password tebakan pada akun Google-only harus 401, dapat %d", w.Code)
	}
	// Google milik orang lain / basi ditolak, akun utuh.
	e.verifier.give("tok-b", "sub-b", 0)
	if w := post(t, e.h.DeleteAccount, http.MethodDelete, `{"google_id_token":"tok-b"}`, token); w.Code != 401 || decode(t, w)["code"] != "GOOGLE_MISMATCH" {
		t.Fatalf("Google lain harus 401 GOOGLE_MISMATCH, dapat %d %s", w.Code, w.Body.String())
	}
	e.verifier.give("tok-a-basi", "sub-a", 10*time.Minute)
	if w := post(t, e.h.DeleteAccount, http.MethodDelete, `{"google_id_token":"tok-a-basi"}`, token); w.Code != 401 || decode(t, w)["code"] != "GOOGLE_REAUTH_STALE" {
		t.Fatalf("token basi harus 401 GOOGLE_REAUTH_STALE, dapat %d %s", w.Code, w.Body.String())
	}
	if u, err := e.users.GetUserByID(userID); err != nil || u == nil || u.Username != "alice" {
		t.Fatalf("akun harus utuh setelah penolakan, dapat (%v, %v)", u, err)
	}

	// Re-auth Google yang sah menghapus akun, dan Google-nya bebas dipakai lagi.
	e.verifier.give("tok-a-baru", "sub-a", 0)
	if w := post(t, e.h.DeleteAccount, http.MethodDelete, `{"google_id_token":"tok-a-baru"}`, token); w.Code != 200 {
		t.Fatalf("hapus akun dengan Google harus 200, dapat %d %s", w.Code, w.Body.String())
	}
	if u, _ := e.users.GetUserByID(userID); u == nil || u.Username == "alice" {
		t.Fatalf("akun harus berubah menjadi tombstone, dapat %+v", u)
	}
	m := decode(t, post(t, e.h.GoogleSignIn, http.MethodPost, `{"id_token":"tok-a-baru"}`, ""))
	if m["code"] != "GOOGLE_NOT_LINKED" {
		t.Fatalf("setelah akun terhapus, Google harus NOT_LINKED lagi: %v", m)
	}
}

func TestGoogleHTTP_ResetPublicKeyWithGoogleReauth(t *testing.T) {
	e := setupGoogleHTTP(t, true)
	token, _ := e.signup(t, "tok-a", "sub-a", "alice")

	body := func(extra string) string {
		return `{"public_key":"{\"kty\":\"EC\"}","device_id":"dev-alice",` + extra + `}`
	}
	if w := post(t, e.h.ResetPublicKey, http.MethodPost, body(`"x":1`), token); w.Code != 400 {
		t.Fatalf("tanpa bukti harus 400, dapat %d %s", w.Code, w.Body.String())
	}
	e.verifier.give("tok-b", "sub-b", 0)
	if w := post(t, e.h.ResetPublicKey, http.MethodPost, body(`"google_id_token":"tok-b"`), token); w.Code != 401 {
		t.Fatalf("Google lain harus 401, dapat %d %s", w.Code, w.Body.String())
	}
	e.verifier.give("tok-a-baru", "sub-a", 0)
	if w := post(t, e.h.ResetPublicKey, http.MethodPost, body(`"google_id_token":"tok-a-baru"`), token); w.Code != 200 {
		t.Fatalf("reset kunci dengan Google harus 200, dapat %d %s", w.Code, w.Body.String())
	}
}
