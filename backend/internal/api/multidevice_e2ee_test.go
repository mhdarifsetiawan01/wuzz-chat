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

func setupMultiDeviceTestEnv(t *testing.T) (*store.SQLUserStore, *store.SQLTransferStore, *api.AuthHandler, *api.TransferHandler, func()) {
	t.Helper()
	tmpDB := filepath.Join(t.TempDir(), "test_multidevice.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	transferStore := store.NewSQLTransferStore(sqlStore.DB(), sqlStore.DriverName())
	tokenStore := store.NewSQLTokenStore(sqlStore.DB(), sqlStore.DriverName())
	sessionStore := store.NewSQLSessionStore(sqlStore.DB(), sqlStore.DriverName())
	auth.SetTokenChecker(tokenStore)

	authHandler := api.NewAuthHandler(userStore)
	authHandler.SetTokenStore(tokenStore)
	authHandler.SetSessionStore(sessionStore)

	transferHandler := api.NewTransferHandler(transferStore)
	transferHandler.SetSessionStore(sessionStore)

	cleanup := func() {
		auth.SetTokenChecker(nil)
		sqlStore.Close()
	}

	return userStore, transferStore, authHandler, transferHandler, cleanup
}

func TestMultiDevice_UpdatePublicKey_IdenticalKey_Returns200(t *testing.T) {
	userStore, _, authHandler, _, cleanup := setupMultiDeviceTestEnv(t)
	defer cleanup()

	user, err := userStore.Register("alice_e2ee", "Alice E2EE", "Password123!")
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	masterPublicKey := "base64_master_key_shared_across_devices"

	// 1. Perangkat 1 (Laptop) mendaftarkan public key pertama kali
	bodyDev1, _ := json.Marshal(map[string]string{
		"public_key": masterPublicKey,
		"device_id":  "dev_laptop_001",
	})
	req1 := httptest.NewRequest(http.MethodPut, "/api/users/keys", bytes.NewReader(bodyDev1))
	req1.Header.Set("Authorization", "Bearer "+token)
	w1 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(w1, req1)

	if w1.Code != http.StatusOK {
		t.Fatalf("Expected 200 on device 1 update key, got %d: %s", w1.Code, w1.Body.String())
	}

	// 2. Perangkat 2 (Phone) yang sudah sync QR mendaftarkan kunci yang IDENTIK
	bodyDev2, _ := json.Marshal(map[string]string{
		"public_key": masterPublicKey,
		"device_id":  "dev_phone_002",
	})
	req2 := httptest.NewRequest(http.MethodPut, "/api/users/keys", bytes.NewReader(bodyDev2))
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 on device 2 with identical key, got %d: %s", w2.Code, w2.Body.String())
	}

	// 3. Perangkat 3 mencoba mengirim kunci BERBEDA -> Harus 409 Conflict
	bodyDiff, _ := json.Marshal(map[string]string{
		"public_key": "base64_different_conflicting_key_999",
		"device_id":  "dev_other_003",
	})
	req3 := httptest.NewRequest(http.MethodPut, "/api/users/keys", bytes.NewReader(bodyDiff))
	req3.Header.Set("Authorization", "Bearer "+token)
	w3 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(w3, req3)

	if w3.Code != http.StatusConflict {
		t.Fatalf("Expected 409 Conflict on different key, got %d: %s", w3.Code, w3.Body.String())
	}
}

func TestMultiDevice_UpdatePublicKey_ValidationAndAuthErrors(t *testing.T) {
	userStore, _, authHandler, _, cleanup := setupMultiDeviceTestEnv(t)
	defer cleanup()

	user, _ := userStore.Register("bob_val", "Bob Val", "Password123!")
	token, _ := auth.GenerateToken(user.ID, user.Username, user.DisplayName)

	// 1. Public key kosong -> 400 Bad Request
	emptyBody, _ := json.Marshal(map[string]string{
		"public_key": "   ",
		"device_id":  "dev_any",
	})
	reqEmpty := httptest.NewRequest(http.MethodPut, "/api/users/keys", bytes.NewReader(emptyBody))
	reqEmpty.Header.Set("Authorization", "Bearer "+token)
	wEmpty := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(wEmpty, reqEmpty)

	if wEmpty.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for empty public key, got %d", wEmpty.Code)
	}

	// 2. Tanpa Authorization header -> 401 Unauthorized
	validBody, _ := json.Marshal(map[string]string{
		"public_key": "valid_key",
		"device_id":  "dev_any",
	})
	reqNoAuth := httptest.NewRequest(http.MethodPut, "/api/users/keys", bytes.NewReader(validBody))
	wNoAuth := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(wNoAuth, reqNoAuth)

	if wNoAuth.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for missing token, got %d", wNoAuth.Code)
	}
}

func TestMultiDevice_ConsumeTransfer_NegativeCases(t *testing.T) {
	userStore, transferStore, _, transferHandler, cleanup := setupMultiDeviceTestEnv(t)
	defer cleanup()

	alice, _ := userStore.Register("alice_transfer", "Alice Transfer", "Password123!")
	bob, _ := userStore.Register("bob_transfer", "Bob Transfer", "Password123!")

	tokenAlice, _ := auth.GenerateToken(alice.ID, alice.Username, alice.DisplayName)
	tokenBob, _ := auth.GenerateToken(bob.ID, bob.Username, bob.DisplayName)

	// 1. Sesi expired -> 410 Gone
	expiredToken := "expired_transfer_token_123"
	_ = transferStore.CreateTransferSession(alice.ID, expiredToken, "bundle_data", -1*time.Minute)

	bodyExpired, _ := json.Marshal(map[string]string{
		"session_token": expiredToken,
		"device_id":     "dev_phone",
	})
	reqExp := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(bodyExpired))
	reqExp.Header.Set("Authorization", "Bearer "+tokenAlice)
	wExp := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(transferHandler.ConsumeSession)).ServeHTTP(wExp, reqExp)

	if wExp.Code != http.StatusGone {
		t.Fatalf("Expected 410 Gone for expired session, got %d: %s", wExp.Code, wExp.Body.String())
	}

	// 2. User lain (Bob) mencoba consume token Alice -> 403 Forbidden
	validToken := "valid_token_for_alice_999"
	_ = transferStore.CreateTransferSession(alice.ID, validToken, "bundle_data", 5*time.Minute)

	bodyBob, _ := json.Marshal(map[string]string{
		"session_token": validToken,
		"device_id":     "dev_bob_phone",
	})
	reqBob := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(bodyBob))
	reqBob.Header.Set("Authorization", "Bearer "+tokenBob)
	wBob := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(transferHandler.ConsumeSession)).ServeHTTP(wBob, reqBob)

	if wBob.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for wrong user consume, got %d: %s", wBob.Code, wBob.Body.String())
	}

	// 3. Consume pertama oleh Alice -> 200 OK
	bodyAlice, _ := json.Marshal(map[string]string{
		"session_token": validToken,
		"device_id":     "dev_alice_phone",
	})
	reqAlice := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(bodyAlice))
	reqAlice.Header.Set("Authorization", "Bearer "+tokenAlice)
	wAlice := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(transferHandler.ConsumeSession)).ServeHTTP(wAlice, reqAlice)

	if wAlice.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for Alice consume, got %d: %s", wAlice.Code, wAlice.Body.String())
	}

	// 4. Token yang sudah pernah digunakan -> 410 Gone
	reqReplay := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(bodyAlice))
	reqReplay.Header.Set("Authorization", "Bearer "+tokenAlice)
	wReplay := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(transferHandler.ConsumeSession)).ServeHTTP(wReplay, reqReplay)

	if wReplay.Code != http.StatusGone {
		t.Fatalf("Expected 410 Gone for already used session token, got %d: %s", wReplay.Code, wReplay.Body.String())
	}
}
