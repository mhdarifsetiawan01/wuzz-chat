package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func setupSessionTestEnv(t *testing.T) (*store.SQLUserStore, *store.SQLTokenStore, *store.SQLSessionStore, *api.AuthHandler, func()) {
	t.Helper()
	tmpDB := filepath.Join(t.TempDir(), "test_session.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	tokenStore := store.NewSQLTokenStore(sqlStore.DB(), sqlStore.DriverName())
	sessionStore := store.NewSQLSessionStore(sqlStore.DB(), sqlStore.DriverName())
	auth.SetTokenChecker(tokenStore)

	authHandler := api.NewAuthHandler(userStore)
	authHandler.SetTokenStore(tokenStore)
	authHandler.SetSessionStore(sessionStore)

	cleanup := func() {
		auth.SetTokenChecker(nil)
		sqlStore.Close()
	}

	return userStore, tokenStore, sessionStore, authHandler, cleanup
}

func TestSession_CreationOnLoginAndRegister(t *testing.T) {
	_, _, sessionStore, authHandler, cleanup := setupSessionTestEnv(t)
	defer cleanup()

	// 1. Registrasi user baru dengan device_id
	regBody, _ := json.Marshal(api.RegisterRequest{
		Username:    "alice_sess",
		DisplayName: "Alice Session",
		Password:    "supersecret123",
		DeviceID:    "dev_phone_123",
	})
	reqReg := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regBody))
	reqReg.Header.Set("User-Agent", "WuzzAndroid/1.0")
	reqReg.RemoteAddr = "192.168.1.10:12345"
	wReg := httptest.NewRecorder()
	authHandler.Register(wReg, reqReg)

	if wReg.Code != http.StatusCreated {
		t.Fatalf("expected 201 on register, got %d: %s", wReg.Code, wReg.Body.String())
	}

	var resReg api.AuthResponse
	if err := json.NewDecoder(wReg.Body).Decode(&resReg); err != nil {
		t.Fatalf("failed to decode register response: %v", err)
	}

	// Verifikasi sesi awal tercatat
	sessions, err := sessionStore.GetActiveSessions(resReg.User.ID, "")
	if err != nil {
		t.Fatalf("failed to get active sessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].DeviceID != "dev_phone_123" {
		t.Errorf("expected device_id 'dev_phone_123', got '%s'", sessions[0].DeviceID)
	}
	if sessions[0].UserAgent != "WuzzAndroid/1.0" {
		t.Errorf("expected user_agent 'WuzzAndroid/1.0', got '%s'", sessions[0].UserAgent)
	}
	if sessions[0].IPAddress != "192.168.1.10" {
		t.Errorf("expected IP '192.168.1.10', got '%s'", sessions[0].IPAddress)
	}

	// 2. Login dari perangkat kedua
	loginBody, _ := json.Marshal(api.LoginRequest{
		Username: "alice_sess",
		Password: "supersecret123",
		DeviceID: "dev_laptop_456",
	})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody))
	reqLogin.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
	reqLogin.Header.Set("CF-Connecting-IP", "203.0.113.195")
	wLogin := httptest.NewRecorder()
	authHandler.Login(wLogin, reqLogin)

	if wLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 on login, got %d: %s", wLogin.Code, wLogin.Body.String())
	}

	// Verifikasi kini ada 2 sesi aktif
	sessionsAfter, err := sessionStore.GetActiveSessions(resReg.User.ID, "")
	if err != nil {
		t.Fatalf("failed to get active sessions after login: %v", err)
	}
	if len(sessionsAfter) != 2 {
		t.Fatalf("expected 2 active sessions, got %d", len(sessionsAfter))
	}
}

func TestSession_GetActiveSessions_IsCurrentMarker(t *testing.T) {
	userStore, _, _, authHandler, cleanup := setupSessionTestEnv(t)
	defer cleanup()

	user, err := userStore.Register("bob_sess", "Bob Sess", "pass12345")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	// Login device 1
	b1, _ := json.Marshal(api.LoginRequest{Username: "bob_sess", Password: "pass12345", DeviceID: "dev_phone"})
	r1 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b1))
	w1 := httptest.NewRecorder()
	authHandler.Login(w1, r1)
	var res1 api.AuthResponse
	_ = json.NewDecoder(w1.Body).Decode(&res1)

	// Login device 2
	b2, _ := json.Marshal(api.LoginRequest{Username: "bob_sess", Password: "pass12345", DeviceID: "dev_desktop"})
	r2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b2))
	w2 := httptest.NewRecorder()
	authHandler.Login(w2, r2)
	var res2 api.AuthResponse
	_ = json.NewDecoder(w2.Body).Decode(&res2)

	// Panggil GET /api/auth/sessions menggunakan token device 2
	reqList := httptest.NewRequest(http.MethodGet, "/api/auth/sessions", nil)
	reqList.Header.Set("Authorization", "Bearer "+res2.Token)
	wList := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.GetActiveSessions)).ServeHTTP(wList, reqList)

	if wList.Code != http.StatusOK {
		t.Fatalf("expected 200 on get sessions, got %d: %s", wList.Code, wList.Body.String())
	}

	var bodyMap struct {
		Sessions []store.Session `json:"sessions"`
	}
	if err := json.NewDecoder(wList.Body).Decode(&bodyMap); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(bodyMap.Sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(bodyMap.Sessions))
	}

	var currentCount int
	for _, s := range bodyMap.Sessions {
		if s.IsCurrent {
			currentCount++
			if s.DeviceID != "dev_desktop" {
				t.Errorf("expected is_current on dev_desktop, got on %s", s.DeviceID)
			}
		}
	}
	if currentCount != 1 {
		t.Errorf("expected exactly 1 current session, got %d", currentCount)
	}
	_ = user
}

func TestSession_RevokeSessionRemote(t *testing.T) {
	_, _, sessionStore, authHandler, cleanup := setupSessionTestEnv(t)
	defer cleanup()

	// 1. Registrasi device 1 (phone)
	b1, _ := json.Marshal(api.RegisterRequest{Username: "charlie_sess", DisplayName: "Charlie", Password: "password123", DeviceID: "dev_phone"})
	r1 := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(b1))
	w1 := httptest.NewRecorder()
	authHandler.Register(w1, r1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("failed to register charlie: %d %s", w1.Code, w1.Body.String())
	}
	var resPhone api.AuthResponse
	_ = json.NewDecoder(w1.Body).Decode(&resPhone)

	// 2. Login device 2 (laptop)
	b2, _ := json.Marshal(api.LoginRequest{Username: "charlie_sess", Password: "password123", DeviceID: "dev_laptop"})
	r2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b2))
	w2 := httptest.NewRecorder()
	authHandler.Login(w2, r2)
	var resLaptop api.AuthResponse
	_ = json.NewDecoder(w2.Body).Decode(&resLaptop)

	// Ambil session id phone
	sessions, _ := sessionStore.GetActiveSessions(resPhone.User.ID, "")
	var phoneSessionID string
	for _, s := range sessions {
		if s.DeviceID == "dev_phone" {
			phoneSessionID = s.ID
		}
	}
	if phoneSessionID == "" {
		t.Fatalf("phoneSessionID not found")
	}

	// 3. Dari laptop, cabut sesi phone: DELETE /api/auth/sessions/:id
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/auth/sessions/"+phoneSessionID, nil)
	reqDel.Header.Set("Authorization", "Bearer "+resLaptop.Token)
	wDel := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.RevokeSession)).ServeHTTP(wDel, reqDel)

	if wDel.Code != http.StatusOK {
		t.Fatalf("expected 200 on revoke session, got %d: %s", wDel.Code, wDel.Body.String())
	}

	// 4. Verifikasi token phone DITOLAK oleh RequireJWT
	reqMePhone := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMePhone.Header.Set("Authorization", "Bearer "+resPhone.Token)
	wMePhone := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMePhone, reqMePhone)
	if wMePhone.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for revoked phone session token, got %d", wMePhone.Code)
	}

	// 5. Verifikasi token laptop MASIH SAH (200 OK)
	reqMeLaptop := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMeLaptop.Header.Set("Authorization", "Bearer "+resLaptop.Token)
	wMeLaptop := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMeLaptop, reqMeLaptop)
	if wMeLaptop.Code != http.StatusOK {
		t.Fatalf("expected 200 for active laptop session, got %d: %s", wMeLaptop.Code, wMeLaptop.Body.String())
	}
}

func TestSession_RevokeAllOtherSessions(t *testing.T) {
	_, _, sessionStore, authHandler, cleanup := setupSessionTestEnv(t)
	defer cleanup()

	// Device 1 (Register)
	b1, _ := json.Marshal(api.RegisterRequest{Username: "dave_sess", DisplayName: "Dave", Password: "password123", DeviceID: "dev_1"})
	r1 := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(b1))
	w1 := httptest.NewRecorder()
	authHandler.Register(w1, r1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("failed to register dave: %d %s", w1.Code, w1.Body.String())
	}
	var res1 api.AuthResponse
	_ = json.NewDecoder(w1.Body).Decode(&res1)

	// Device 2 (Login)
	b2, _ := json.Marshal(api.LoginRequest{Username: "dave_sess", Password: "password123", DeviceID: "dev_2"})
	r2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b2))
	w2 := httptest.NewRecorder()
	authHandler.Login(w2, r2)
	var res2 api.AuthResponse
	_ = json.NewDecoder(w2.Body).Decode(&res2)

	// Device 3 (Login)
	b3, _ := json.Marshal(api.LoginRequest{Username: "dave_sess", Password: "password123", DeviceID: "dev_3"})
	r3 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b3))
	w3 := httptest.NewRecorder()
	authHandler.Login(w3, r3)
	var res3 api.AuthResponse
	_ = json.NewDecoder(w3.Body).Decode(&res3)

	// Device 2 memanggil RevokeAllOtherSessions
	reqRevokeOthers := httptest.NewRequest(http.MethodPost, "/api/auth/sessions/revoke-others", nil)
	reqRevokeOthers.Header.Set("Authorization", "Bearer "+res2.Token)
	wRevokeOthers := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.RevokeAllOtherSessions)).ServeHTTP(wRevokeOthers, reqRevokeOthers)

	if wRevokeOthers.Code != http.StatusOK {
		t.Fatalf("expected 200 on revoke-others, got %d: %s", wRevokeOthers.Code, wRevokeOthers.Body.String())
	}

	// Device 1 dan 3 harus tertolak 401
	rMe1 := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rMe1.Header.Set("Authorization", "Bearer "+res1.Token)
	wMe1 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMe1, rMe1)
	if wMe1.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for dev_1, got %d", wMe1.Code)
	}

	rMe3 := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rMe3.Header.Set("Authorization", "Bearer "+res3.Token)
	wMe3 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMe3, rMe3)
	if wMe3.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for dev_3, got %d", wMe3.Code)
	}

	// Device 2 harus tetap 200 OK
	rMe2 := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rMe2.Header.Set("Authorization", "Bearer "+res2.Token)
	wMe2 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMe2, rMe2)
	if wMe2.Code != http.StatusOK {
		t.Errorf("expected 200 for dev_2, got %d", wMe2.Code)
	}

	// Sesi aktif di database hanya tinggal 1
	activeList, err := sessionStore.GetActiveSessions(res1.User.ID, "")
	if err != nil {
		t.Fatalf("failed to query active sessions: %v", err)
	}
	if len(activeList) != 1 {
		t.Fatalf("expected 1 active session remaining, got %d", len(activeList))
	}
	if activeList[0].DeviceID != "dev_2" {
		t.Errorf("expected dev_2 remaining, got %s", activeList[0].DeviceID)
	}
}

func TestSession_CleanupExpiredSessions(t *testing.T) {
	_, _, sessionStore, _, cleanup := setupSessionTestEnv(t)
	defer cleanup()

	// Buat 1 sesi sudah kedaluwarsa dan 1 sesi masih aktif
	expiredSess := &store.Session{
		ID:           "sess_expired_1",
		UserID:       "user_test_exp",
		ExpiresAt:    time.Now().Add(-1 * time.Hour),
		CreatedAt:    time.Now().Add(-2 * time.Hour),
		LastActiveAt: time.Now().Add(-2 * time.Hour),
	}
	if err := sessionStore.CreateSession(expiredSess); err != nil {
		t.Fatalf("failed to create expired session: %v", err)
	}

	activeSess := &store.Session{
		ID:           "sess_active_1",
		UserID:       "user_test_exp",
		ExpiresAt:    time.Now().Add(24 * time.Hour),
		CreatedAt:    time.Now(),
		LastActiveAt: time.Now(),
	}
	if err := sessionStore.CreateSession(activeSess); err != nil {
		t.Fatalf("failed to create active session: %v", err)
	}

	cleaned, err := sessionStore.CleanupExpiredSessions()
	if err != nil {
		t.Fatalf("failed to cleanup expired sessions: %v", err)
	}
	if cleaned != 1 {
		t.Errorf("expected 1 session cleaned, got %d", cleaned)
	}

	remaining, err := sessionStore.GetActiveSessions("user_test_exp", "")
	if err != nil {
		t.Fatalf("failed to get active sessions: %v", err)
	}
	if len(remaining) != 1 || remaining[0].ID != "sess_active_1" {
		t.Errorf("expected only sess_active_1 remaining, got %+v", remaining)
	}
}
