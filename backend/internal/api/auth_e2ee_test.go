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

	// 3. ResetPublicKey from Device B -> MUST BE 200 OK and key_version = 2
	reqReset := httptest.NewRequest(http.MethodPost, "/api/users/public-key/reset", bytes.NewReader(reqBody2))
	reqReset.Header.Set("Authorization", "Bearer "+token)
	wReset := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.ResetPublicKey)).ServeHTTP(wReset, reqReset)

	if wReset.Code != http.StatusOK {
		t.Fatalf("expected status 200 for ResetPublicKey, got %d: %s", wReset.Code, wReset.Body.String())
	}

	var resetResp map[string]interface{}
	if err := json.Unmarshal(wReset.Body.Bytes(), &resetResp); err != nil {
		t.Fatalf("failed to parse reset JSON response: %v", err)
	}
	if resetResp["key_version"] != float64(2) {
		t.Errorf("expected key_version 2 after reset, got: %v", resetResp["key_version"])
	}
}
