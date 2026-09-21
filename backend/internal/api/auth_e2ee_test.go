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

func TestAuthHandler_UpdateAndResetPublicKey(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_api_auth_e2ee.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	authHandler := api.NewAuthHandler(userStore)

	user, err := userStore.Register("user_device_test", "Device Test", "password123")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	key1 := `{"kty":"EC","crv":"P-256","x":"key1-x","y":"key1-y"}`
	key2 := `{"kty":"EC","crv":"P-256","x":"key2-x","y":"key2-y"}`

	// 1. UpdatePublicKey first time from Device A
	reqBody1, _ := json.Marshal(map[string]string{
		"public_key": key1,
		"device_id":  "device_laptop",
	})
	req1 := httptest.NewRequest(http.MethodPut, "/api/users/public-key", bytes.NewReader(reqBody1))
	req1.Header.Set("Authorization", "Bearer "+token)
	w1 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(w1, req1)

	if w1.Code != http.StatusOK {
		t.Fatalf("expected status 200 for Device A initial key, got %d: %s", w1.Code, w1.Body.String())
	}

	// 2. UpdatePublicKey from Device B (different device_id) -> MUST BE 409 Conflict
	reqBody2, _ := json.Marshal(map[string]string{
		"public_key": key2,
		"device_id":  "device_mobile",
	})
	req2 := httptest.NewRequest(http.MethodPut, "/api/users/public-key", bytes.NewReader(reqBody2))
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Fatalf("expected status 409 Conflict for Device B overwrite attempt, got %d: %s", w2.Code, w2.Body.String())
	}

	var conflictResp map[string]interface{}
	if err := json.Unmarshal(w2.Body.Bytes(), &conflictResp); err != nil {
		t.Fatalf("failed to parse conflict JSON response: %v", err)
	}
	if conflictResp["error"] != "KEY_ALREADY_REGISTERED" {
		t.Errorf("expected error KEY_ALREADY_REGISTERED, got: %v", conflictResp["error"])
	}

	// 3a. ResetPublicKey from Device B tanpa password -> HARUS 400 Bad Request
	reqResetNoPass := httptest.NewRequest(http.MethodPost, "/api/users/public-key/reset", bytes.NewReader(reqBody2))
	reqResetNoPass.Header.Set("Authorization", "Bearer "+token)
	wResetNoPass := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.ResetPublicKey)).ServeHTTP(wResetNoPass, reqResetNoPass)
	if wResetNoPass.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for ResetPublicKey without password, got %d: %s", wResetNoPass.Code, wResetNoPass.Body.String())
	}

	// 3b. ResetPublicKey from Device B dengan password salah -> HARUS 401 Unauthorized
	reqBodyWrongPass, _ := json.Marshal(map[string]string{
		"public_key": key2,
		"device_id":  "device_mobile",
		"password":   "wrongpass",
	})
	reqResetWrong := httptest.NewRequest(http.MethodPost, "/api/users/public-key/reset", bytes.NewReader(reqBodyWrongPass))
	reqResetWrong.Header.Set("Authorization", "Bearer "+token)
	wResetWrong := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.ResetPublicKey)).ServeHTTP(wResetWrong, reqResetWrong)
	if wResetWrong.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for ResetPublicKey with wrong password, got %d: %s", wResetWrong.Code, wResetWrong.Body.String())
	}

	// 3c. ResetPublicKey from Device B dengan password benar -> MUST BE 200 OK and key_version = 2
	reqBodyValidPass, _ := json.Marshal(map[string]string{
		"public_key": key2,
		"device_id":  "device_mobile",
		"password":   "password123",
	})
	reqReset := httptest.NewRequest(http.MethodPost, "/api/users/public-key/reset", bytes.NewReader(reqBodyValidPass))
	reqReset.Header.Set("Authorization", "Bearer "+token)
	wReset := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.ResetPublicKey)).ServeHTTP(wReset, reqReset)

	if wReset.Code != http.StatusOK {
		t.Fatalf("expected status 200 for ResetPublicKey with correct password, got %d: %s", wReset.Code, wReset.Body.String())
	}

	var resetResp map[string]interface{}
	if err := json.Unmarshal(wReset.Body.Bytes(), &resetResp); err != nil {
		t.Fatalf("failed to parse reset JSON response: %v", err)
	}
	if resetResp["key_version"] != float64(2) {
		t.Errorf("expected key_version 2 after reset, got: %v", resetResp["key_version"])
	}
}
