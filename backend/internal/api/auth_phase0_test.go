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

func setupPhase0TestEnv(t *testing.T) (*store.SQLUserStore, *store.SQLTokenStore, *api.AuthHandler, func()) {
	t.Helper()
	tmpDB := filepath.Join(t.TempDir(), "test_phase0.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	tokenStore := store.NewSQLTokenStore(sqlStore.DB(), sqlStore.DriverName())
	auth.SetTokenChecker(tokenStore)

	authHandler := api.NewAuthHandler(userStore)
	authHandler.SetTokenStore(tokenStore)

	cleanup := func() {
		auth.SetTokenChecker(nil)
		sqlStore.Close()
	}

	return userStore, tokenStore, authHandler, cleanup
}

func TestPhase0_JWTRevocationOnLogout(t *testing.T) {
	userStore, tokenStore, authHandler, cleanup := setupPhase0TestEnv(t)
	defer cleanup()

	user, err := userStore.Register("revocation_user", "Revocation User", "secret123")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// 1. Verifikasi token valid sebelum logout
	reqMe := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMe.Header.Set("Authorization", "Bearer "+token)
	wMe := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMe, reqMe)
	if wMe.Code != http.StatusOK {
		t.Fatalf("expected 200 before logout, got %d: %s", wMe.Code, wMe.Body.String())
	}

	// 2. Eksekusi logout
	reqLogout := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	reqLogout.Header.Set("Authorization", "Bearer "+token)
	wLogout := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Logout)).ServeHTTP(wLogout, reqLogout)
	if wLogout.Code != http.StatusOK {
		t.Fatalf("expected 200 on logout, got %d: %s", wLogout.Code, wLogout.Body.String())
	}

	// 3. Verifikasi token yang sama LANGSUNG DITOLAK (401 Unauthorized) setelah logout
	reqMeAfter := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMeAfter.Header.Set("Authorization", "Bearer "+token)
	wMeAfter := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMeAfter, reqMeAfter)
	if wMeAfter.Code != http.StatusUnauthorized {
		t.Fatalf("CRITICAL SECURITY: expected 401 for revoked token after logout, got %d: %s", wMeAfter.Code, wMeAfter.Body.String())
	}

	var errResp map[string]string
	_ = json.Unmarshal(wMeAfter.Body.Bytes(), &errResp)
	if errResp["error"] != "Token telah dicabut atau kadaluarsa" {
		t.Errorf("expected error message 'Token telah dicabut atau kadaluarsa', got: %s", errResp["error"])
	}

	// 4. Pastikan token baru untuk user yang sama tetap berfungsi normal
	newToken, err := auth.GenerateToken(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate new token: %v", err)
	}
	reqMeNew := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMeNew.Header.Set("Authorization", "Bearer "+newToken)
	wMeNew := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMeNew, reqMeNew)
	if wMeNew.Code != http.StatusOK {
		t.Fatalf("expected 200 for new token, got %d: %s", wMeNew.Code, wMeNew.Body.String())
	}

	_ = tokenStore
}

func TestPhase0_VerifyPasswordEndpoint(t *testing.T) {
	userStore, _, authHandler, cleanup := setupPhase0TestEnv(t)
	defer cleanup()

	user, err := userStore.Register("verify_user", "Verify User", "mysecurepass")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// 1. Request tanpa password -> 400
	reqEmpty := httptest.NewRequest(http.MethodPost, "/api/auth/verify-password", bytes.NewReader([]byte(`{"password":""}`)))
	reqEmpty.Header.Set("Authorization", "Bearer "+token)
	wEmpty := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.VerifyPassword)).ServeHTTP(wEmpty, reqEmpty)
	if wEmpty.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty password, got %d", wEmpty.Code)
	}

	// 2. Request password salah -> 401
	reqWrong := httptest.NewRequest(http.MethodPost, "/api/auth/verify-password", bytes.NewReader([]byte(`{"password":"wrong_password"}`)))
	reqWrong.Header.Set("Authorization", "Bearer "+token)
	wWrong := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.VerifyPassword)).ServeHTTP(wWrong, reqWrong)
	if wWrong.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong password, got %d", wWrong.Code)
	}

	// 3. Request password benar -> 200 OK
	reqValid := httptest.NewRequest(http.MethodPost, "/api/auth/verify-password", bytes.NewReader([]byte(`{"password":"mysecurepass"}`)))
	reqValid.Header.Set("Authorization", "Bearer "+token)
	wValid := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.VerifyPassword)).ServeHTTP(wValid, reqValid)
	if wValid.Code != http.StatusOK {
		t.Fatalf("expected 200 for correct password, got %d: %s", wValid.Code, wValid.Body.String())
	}

	var resp map[string]interface{}
	_ = json.Unmarshal(wValid.Body.Bytes(), &resp)
	if resp["verified"] != true {
		t.Errorf("expected verified == true, got %v", resp["verified"])
	}
}

func TestPhase0_ChangePasswordAndGlobalInvalidation(t *testing.T) {
	userStore, _, authHandler, cleanup := setupPhase0TestEnv(t)
	defer cleanup()

	user, err := userStore.Register("chgpass_user", "Chgpass User", "oldpassword123")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	// Buat token lama (Token A)
	tokenA, err := auth.GenerateToken(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate token A: %v", err)
	}

	// Tunggu sejenak agar timestamp token A lebih awal daripada waktu ganti password
	time.Sleep(10 * time.Millisecond)

	// 1. Coba ganti password dengan password lama salah -> 401
	bodyWrongOld, _ := json.Marshal(map[string]string{
		"old_password": "incorrect_pass",
		"new_password": "newpassword456",
	})
	reqWrongOld := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(bodyWrongOld))
	reqWrongOld.Header.Set("Authorization", "Bearer "+tokenA)
	wWrongOld := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.ChangePassword)).ServeHTTP(wWrongOld, reqWrongOld)
	if wWrongOld.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong old password, got %d", wWrongOld.Code)
	}

	// 2. Coba ganti password dengan password baru terlalu pendek -> 400
	bodyShort, _ := json.Marshal(map[string]string{
		"old_password": "oldpassword123",
		"new_password": "123",
	})
	reqShort := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(bodyShort))
	reqShort.Header.Set("Authorization", "Bearer "+tokenA)
	wShort := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.ChangePassword)).ServeHTTP(wShort, reqShort)
	if wShort.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for too short password, got %d", wShort.Code)
	}

	// 3. Ganti password berhasil
	bodySuccess, _ := json.Marshal(map[string]string{
		"old_password": "oldpassword123",
		"new_password": "newpassword456",
	})
	reqSuccess := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(bodySuccess))
	reqSuccess.Header.Set("Authorization", "Bearer "+tokenA)
	wSuccess := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.ChangePassword)).ServeHTTP(wSuccess, reqSuccess)
	if wSuccess.Code != http.StatusOK {
		t.Fatalf("expected 200 on change password, got %d: %s", wSuccess.Code, wSuccess.Body.String())
	}

	// 4. Login dengan password lama harus GAGAL
	_, err = userStore.Authenticate("chgpass_user", "oldpassword123")
	if err == nil {
		t.Fatalf("expected authentication with old password to fail, but succeeded")
	}

	// 5. Login dengan password baru harus BERHASIL
	authUser, err := userStore.Authenticate("chgpass_user", "newpassword456")
	if err != nil {
		t.Fatalf("expected authentication with new password to succeed, got %v", err)
	}

	// 6. Token A yang diterbitkan SEBELUM ganti password HARUS DITOLAK (401 Unauthorized)
	reqMeA := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMeA.Header.Set("Authorization", "Bearer "+tokenA)
	wMeA := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMeA, reqMeA)
	if wMeA.Code != http.StatusUnauthorized {
		t.Fatalf("CRITICAL SECURITY: expected 401 for token A after password change, got %d: %s", wMeA.Code, wMeA.Body.String())
	}

	// 7. Token baru (Token B) yang diterbitkan SETELAH ganti password HARUS DITERIMA (200 OK)
	time.Sleep(1100 * time.Millisecond)
	tokenB, err := auth.GenerateToken(authUser.ID, authUser.Username, authUser.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate token B: %v", err)
	}
	reqMeB := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMeB.Header.Set("Authorization", "Bearer "+tokenB)
	wMeB := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(wMeB, reqMeB)
	if wMeB.Code != http.StatusOK {
		t.Fatalf("expected 200 for token B, got %d: %s", wMeB.Code, wMeB.Body.String())
	}
}

func TestPhase0_TokenStoreCleanup(t *testing.T) {
	_, tokenStore, _, cleanup := setupPhase0TestEnv(t)
	defer cleanup()

	// Insert token yang kedaluwarsa 1 jam lalu
	pastExpiry := time.Now().Add(-1 * time.Hour)
	if err := tokenStore.RevokeToken("jti_expired_1", "user_1", pastExpiry); err != nil {
		t.Fatalf("failed to insert expired revoked token: %v", err)
	}

	// Insert token yang masih aktif (kedaluwarsa besok)
	futureExpiry := time.Now().Add(24 * time.Hour)
	if err := tokenStore.RevokeToken("jti_active_1", "user_1", futureExpiry); err != nil {
		t.Fatalf("failed to insert active revoked token: %v", err)
	}

	cleaned, err := tokenStore.CleanupExpiredTokens()
	if err != nil {
		t.Fatalf("CleanupExpiredTokens failed: %v", err)
	}
	if cleaned != 1 {
		t.Errorf("expected 1 cleaned token, got %d", cleaned)
	}

	// Pastikan token expired sudah tidak ada
	revoked, err := tokenStore.IsTokenRevoked("jti_expired_1")
	if err != nil || revoked {
		t.Errorf("expected jti_expired_1 to be gone, revoked=%v, err=%v", revoked, err)
	}

	// Pastikan token active masih tercatat
	revokedActive, err := tokenStore.IsTokenRevoked("jti_active_1")
	if err != nil || !revokedActive {
		t.Errorf("expected jti_active_1 to still be revoked, revoked=%v, err=%v", revokedActive, err)
	}
}
