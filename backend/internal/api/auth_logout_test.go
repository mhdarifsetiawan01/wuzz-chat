package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestAuthHandler_LogoutAndDeviceReleaseFlow(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_api_auth_logout.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	authHandler := api.NewAuthHandler(userStore)

	user, err := userStore.Register("alice_test", "Alice Test", "password123")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// 1. Logout tanpa token -> 401 Unauthorized
	reqUnauth := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	wUnauth := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Logout)).ServeHTTP(wUnauth, reqUnauth)
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated logout, got: %d", wUnauth.Code)
	}

	// 2. Alice login di Device 1 (device_laptop) dan registrasi public key
	key1 := `{"kty":"EC","crv":"P-256","x":"key1-x","y":"key1-y"}`
	reqBody1, _ := json.Marshal(map[string]string{
		"public_key": key1,
		"device_id":  "device_laptop",
	})
	req1 := httptest.NewRequest(http.MethodPut, "/api/users/public-key", bytes.NewReader(reqBody1))
	req1.Header.Set("Authorization", "Bearer "+token)
	w1 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 for Device 1 initial key, got %d: %s", w1.Code, w1.Body.String())
	}

	// Verifikasi di DB bahwa active_device_id == "device_laptop"
	_, _, activeDev, err := userStore.GetE2EEInfo(user.ID)
	if err != nil {
		t.Fatalf("failed to get E2EE info: %v", err)
	}
	if activeDev != "device_laptop" {
		t.Fatalf("expected active_device_id 'device_laptop', got: %s", activeDev)
	}

	// 3. Sebelum logout, Device 2 (device_mobile) coba registrasi kunci -> HARUS 409 Conflict
	key2 := `{"kty":"EC","crv":"P-256","x":"key2-x","y":"key2-y"}`
	reqBody2, _ := json.Marshal(map[string]string{
		"public_key": key2,
		"device_id":  "device_mobile",
	})
	reqConflict := httptest.NewRequest(http.MethodPut, "/api/users/public-key", bytes.NewReader(reqBody2))
	reqConflict.Header.Set("Authorization", "Bearer "+token)
	wConflict := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(wConflict, reqConflict)
	if wConflict.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict for Device 2 before logout, got: %d", wConflict.Code)
	}

	// 3b. Device 2 membatalkan login dan memanggil POST /api/auth/logout dengan device_id "device_mobile"
	// -> Proteksi Device-Aware Logout HARUS menjaga active_device_id tetap "device_laptop"!
	reqLogoutDev2 := httptest.NewRequest(http.MethodPost, "/api/auth/logout", bytes.NewReader([]byte(`{"device_id":"device_mobile"}`)))
	reqLogoutDev2.Header.Set("Authorization", "Bearer "+token)
	reqLogoutDev2.Header.Set("Content-Type", "application/json")
	wLogoutDev2 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Logout)).ServeHTTP(wLogoutDev2, reqLogoutDev2)
	if wLogoutDev2.Code != http.StatusOK {
		t.Fatalf("expected 200 for device 2 cancellation logout, got: %d: %s", wLogoutDev2.Code, wLogoutDev2.Body.String())
	}

	// Verifikasi di database: active_device_id HARUS TETAP "device_laptop" (tidak boleh terhapus oleh Device 2!)
	_, _, activeDevStillDevice1, err := userStore.GetE2EEInfo(user.ID)
	if err != nil {
		t.Fatalf("failed to get E2EE info: %v", err)
	}
	if activeDevStillDevice1 != "device_laptop" {
		t.Fatalf("CRITICAL SECURITY: active_device_id expected 'device_laptop', but was wiped out to: '%s'", activeDevStillDevice1)
	}

	// 4. Alice secara sukarela melakukan LOGOUT di Device 1 asli -> POST /api/auth/logout dengan X-Device-ID "device_laptop"
	reqLogout := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	reqLogout.Header.Set("Authorization", "Bearer "+token)
	reqLogout.Header.Set("X-Device-ID", "device_laptop")
	wLogout := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.Logout)).ServeHTTP(wLogout, reqLogout)
	if wLogout.Code != http.StatusOK {
		t.Fatalf("expected 200 for logout, got: %d: %s", wLogout.Code, wLogout.Body.String())
	}

	// Verifikasi active_device_id di database sudah KOSONG ("")
	_, _, activeDevAfterLogout, err := userStore.GetE2EEInfo(user.ID)
	if err != nil {
		t.Fatalf("failed to get E2EE info after logout: %v", err)
	}
	if activeDevAfterLogout != "" {
		t.Fatalf("expected empty active_device_id after logout, got: '%s'", activeDevAfterLogout)
	}

	// 5. Sekarang Alice login di Device 2 (device_mobile) dan registrasi kunci -> HARUS 200 OK!
	reqDevice2 := httptest.NewRequest(http.MethodPut, "/api/users/public-key", bytes.NewReader(reqBody2))
	reqDevice2.Header.Set("Authorization", "Bearer "+token)
	wDevice2 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(wDevice2, reqDevice2)
	if wDevice2.Code != http.StatusOK {
		t.Fatalf("expected 200 for Device 2 after logout, got %d: %s", wDevice2.Code, wDevice2.Body.String())
	}

	// Verifikasi active_device_id di database sekarang beralih ke "device_mobile"
	_, _, activeDevFinal, err := userStore.GetE2EEInfo(user.ID)
	if err != nil {
		t.Fatalf("failed to get E2EE info final: %v", err)
	}
	if activeDevFinal != "device_mobile" {
		t.Fatalf("expected active_device_id 'device_mobile', got: '%s'", activeDevFinal)
	}
}
