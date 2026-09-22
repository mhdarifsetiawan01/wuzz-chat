package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func setupTransferTestDB(t *testing.T) (*store.SQLMessageStore, *store.SQLUserStore, *store.SQLTransferStore) {
	msgStore, err := store.NewSQLMessageStore("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("Gagal init in-memory sqlite: %v", err)
	}

	userStore := store.NewSQLUserStore(msgStore.DB(), "sqlite")
	transferStore := store.NewSQLTransferStore(msgStore.DB(), "sqlite")

	return msgStore, userStore, transferStore
}

func TestTransferHandler_Lifecycle(t *testing.T) {
	_, userStore, transferStore := setupTransferTestDB(t)
	handler := api.NewTransferHandler(transferStore)

	// Register user A
	userA, err := userStore.Register("user_a", "User A", "Password123!")
	if err != nil {
		t.Fatalf("Register user A gagal: %v", err)
	}

	// Register user B (attacker)
	userB, err := userStore.Register("user_b", "User B", "Password123!")
	if err != nil {
		t.Fatalf("Register user B gagal: %v", err)
	}

	tokenA, err := auth.GenerateToken(userA.ID, userA.Username, userA.DisplayName)
	if err != nil {
		t.Fatalf("Generate token A gagal: %v", err)
	}

	tokenB, err := auth.GenerateToken(userB.ID, userB.Username, userB.DisplayName)
	if err != nil {
		t.Fatalf("Generate token B gagal: %v", err)
	}

	// Set initial device for User A
	_, err = userStore.UpdatePublicKeyWithDevice(userA.ID, "pubkey_a_jwk", "dev_hp_old")
	if err != nil {
		t.Fatalf("Update pubkey device A gagal: %v", err)
	}

	sessionToken := "0123456789abcdef0123456789abcdef" // 32 hex chars
	encryptedBundle := "{\"ciphertext\":\"abc123encrypted\",\"iv\":\"iv123\",\"salt\":\"salt123\"}"

	// 1. Test Create Session oleh User A
	createReqBody, _ := json.Marshal(map[string]string{
		"session_token":    sessionToken,
		"encrypted_bundle": encryptedBundle,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/users/transfer/create", bytes.NewReader(createReqBody))
	req.Header.Set("Authorization", "Bearer "+tokenA)
	w := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.CreateSession)).ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Ekspektasi 201 Created, dapat: %d, body: %s", w.Code, w.Body.String())
	}

	// 2. Test User B (attacker) mencoba consume token milik User A -> 403 Forbidden
	consumeReqBody, _ := json.Marshal(map[string]string{
		"session_token": sessionToken,
		"device_id":     "dev_laptop_new",
	})

	reqAttacker := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(consumeReqBody))
	reqAttacker.Header.Set("Authorization", "Bearer "+tokenB)
	wAttacker := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.ConsumeSession)).ServeHTTP(wAttacker, reqAttacker)

	if wAttacker.Code != http.StatusForbidden {
		t.Fatalf("Ekspektasi 403 Forbidden untuk user lain, dapat: %d, body: %s", wAttacker.Code, wAttacker.Body.String())
	}

	// 3. Test User A consume di device baru -> 200 OK & active_device_id switched
	reqConsume := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(consumeReqBody))
	reqConsume.Header.Set("Authorization", "Bearer "+tokenA)
	wConsume := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.ConsumeSession)).ServeHTTP(wConsume, reqConsume)

	if wConsume.Code != http.StatusOK {
		t.Fatalf("Ekspektasi 200 OK saat consume, dapat: %d, body: %s", wConsume.Code, wConsume.Body.String())
	}

	var consumeResp map[string]interface{}
	_ = json.Unmarshal(wConsume.Body.Bytes(), &consumeResp)
	if consumeResp["encrypted_bundle"] != encryptedBundle {
		t.Fatalf("Bundle tidak cocok. Ekspektasi %s, dapat %v", encryptedBundle, consumeResp["encrypted_bundle"])
	}

	// Verifikasi active_device_id di UserStore berubah menjadi 'dev_laptop_new'
	_, _, activeDev, err := userStore.GetE2EEInfo(userA.ID)
	if err != nil || activeDev != "dev_laptop_new" {
		t.Fatalf("Active device ID tidak terupdate ke dev_laptop_new, dapat: %s, err: %v", activeDev, err)
	}

	// 4. Test Consume kedua kali (One-time use) -> 410 Gone
	reqConsume2 := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(consumeReqBody))
	reqConsume2.Header.Set("Authorization", "Bearer "+tokenA)
	wConsume2 := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.ConsumeSession)).ServeHTTP(wConsume2, reqConsume2)

	if wConsume2.Code != http.StatusGone {
		t.Fatalf("Ekspektasi 410 Gone untuk session yang sudah dipakai, dapat: %d", wConsume2.Code)
	}

	// 5. Test Non-existent token -> 404 Not Found
	invalidConsumeBody, _ := json.Marshal(map[string]string{
		"session_token": "token_yang_tidak_ada_1234567890",
		"device_id":     "dev_random",
	})
	reqInvalid := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(invalidConsumeBody))
	reqInvalid.Header.Set("Authorization", "Bearer "+tokenA)
	wInvalid := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.ConsumeSession)).ServeHTTP(wInvalid, reqInvalid)

	if wInvalid.Code != http.StatusNotFound {
		t.Fatalf("Ekspektasi 404 Not Found untuk token salah, dapat: %d", wInvalid.Code)
	}
}

func TestTransferHandler_ExpiredSession(t *testing.T) {
	_, userStore, transferStore := setupTransferTestDB(t)
	handler := api.NewTransferHandler(transferStore)

	user, _ := userStore.Register("user_exp", "User Exp", "Password123!")
	token, _ := auth.GenerateToken(user.ID, user.Username, user.DisplayName)

	// Buat session dengan TTL negatif / sudah lewat
	sessionToken := "expiredtoken1234567890abcdef123"
	_ = transferStore.CreateTransferSession(user.ID, sessionToken, "bundle_test", -1*time.Minute)

	consumeBody, _ := json.Marshal(map[string]string{
		"session_token": sessionToken,
		"device_id":     "dev_new",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(consumeBody))
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.ConsumeSession)).ServeHTTP(w, req)

	if w.Code != http.StatusGone {
		t.Fatalf("Ekspektasi 410 Gone untuk session expired, dapat: %d", w.Code)
	}

	// Test Cleanup
	deleted, err := transferStore.CleanupExpiredSessions()
	if err != nil || deleted != 1 {
		t.Fatalf("Cleanup gagal: deleted=%d, err=%v", deleted, err)
	}
}

type mockWebSocketHub struct {
	kickedUserID string
	kickedExcept string
	kickedReason string
	kickCalled   bool
}

func (m *mockWebSocketHub) KickClientByUserID(userID, exceptDeviceID, reason string) {
	m.kickedUserID = userID
	m.kickedExcept = exceptDeviceID
	m.kickedReason = reason
	m.kickCalled = true
}

func (m *mockWebSocketHub) KickClientByDeviceID(userID, deviceID, reason string) {
	m.kickedUserID = userID
	m.kickedReason = reason
	m.kickCalled = true
}

func TestTransferHandler_DirectWebSocketKick(t *testing.T) {
	_, userStore, transferStore := setupTransferTestDB(t)
	mockHub := &mockWebSocketHub{}
	handler := api.NewTransferHandler(transferStore, mockHub)

	user, _ := userStore.Register("user_kick_test", "User Kick", "Password123!")
	token, _ := auth.GenerateToken(user.ID, user.Username, user.DisplayName)

	sessionToken := "sessiontokensupersafe1234567890abcdef"
	_ = transferStore.CreateTransferSession(user.ID, sessionToken, "bundle_encrypted_data", 5*time.Minute)

	consumeBody, _ := json.Marshal(map[string]string{
		"session_token": sessionToken,
		"device_id":     "dev_target_new",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(consumeBody))
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.ConsumeSession)).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Ekspektasi 200 OK saat consume, dapat: %d, body: %s", w.Code, w.Body.String())
	}

	if !mockHub.kickCalled {
		t.Fatalf("Ekspektasi KickClientByUserID dipanggil saat transfer selesai")
	}

	if mockHub.kickedUserID != user.ID {
		t.Errorf("Ekspektasi kickedUserID = %s, dapat: %s", user.ID, mockHub.kickedUserID)
	}

	if mockHub.kickedExcept != "dev_target_new" {
		t.Errorf("Ekspektasi kickedExcept = dev_target_new, dapat: %s", mockHub.kickedExcept)
	}
}

func TestTransferHandler_SessionRevocationOnConsume(t *testing.T) {
	msgStore, userStore, transferStore := setupTransferTestDB(t)
	sessionStore := store.NewSQLSessionStore(msgStore.DB(), "sqlite")

	handler := api.NewTransferHandler(transferStore)
	handler.SetSessionStore(sessionStore)

	user, err := userStore.Register("user_transfer_sess", "User Transfer Sess", "Password123!")
	if err != nil {
		t.Fatalf("Register gagal: %v", err)
	}

	// 1. Catat sesi 1 (perangkat lama)
	sessOld := &store.Session{
		ID:           "sess_old_laptop",
		UserID:       user.ID,
		DeviceID:     "dev_old_laptop",
		UserAgent:    "Chrome on Linux",
		IPAddress:    "127.0.0.1",
		IsRevoked:    false,
		CreatedAt:    time.Now().UTC(),
		ExpiresAt:    time.Now().UTC().Add(7 * 24 * time.Hour),
		LastActiveAt: time.Now().UTC(),
	}
	if err := sessionStore.CreateSession(sessOld); err != nil {
		t.Fatalf("CreateSession old gagal: %v", err)
	}

	// 2. Catat sesi 2 (perangkat baru yang sedang login dan melakukan consume)
	tokenNew, claimsNew, err := auth.GenerateTokenDetailed(user.ID, user.Username, user.DisplayName)
	if err != nil {
		t.Fatalf("GenerateTokenDetailed gagal: %v", err)
	}
	sessNew := &store.Session{
		ID:           claimsNew.ID,
		UserID:       user.ID,
		DeviceID:     "dev_new_phone",
		UserAgent:    "Safari on iPhone",
		IPAddress:    "127.0.0.1",
		IsRevoked:    false,
		CreatedAt:    time.Now().UTC(),
		ExpiresAt:    claimsNew.ExpiresAt.Time,
		LastActiveAt: time.Now().UTC(),
	}
	if err := sessionStore.CreateSession(sessNew); err != nil {
		t.Fatalf("CreateSession new gagal: %v", err)
	}

	// 3. Buat sesi transfer
	sessionToken := "supersecretsessiontokentransfere2ee1234"
	_ = transferStore.CreateTransferSession(user.ID, sessionToken, "encrypted_key_bundle_sample", 5*time.Minute)

	// 4. Perangkat baru mengonsumsi transfer session
	consumeBody, _ := json.Marshal(map[string]string{
		"session_token": sessionToken,
		"device_id":     "dev_new_phone",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(consumeBody))
	req.Header.Set("Authorization", "Bearer "+tokenNew)
	w := httptest.NewRecorder()

	auth.RequireJWT()(http.HandlerFunc(handler.ConsumeSession)).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Ekspektasi 200 OK saat consume transfer, dapat: %d (body: %s)", w.Code, w.Body.String())
	}

	// 5. Verifikasi sesi lama otomatis dicabut (is_revoked = TRUE)
	isOldRevoked, err := sessionStore.IsSessionRevoked(sessOld.ID)
	if err != nil {
		t.Fatalf("IsSessionRevoked old gagal: %v", err)
	}
	if !isOldRevoked {
		t.Errorf("Ekspektasi sesi perangkat lama otomatis ter-revoke, namun masih aktif!")
	}

	// 6. Verifikasi sesi perangkat baru tetap aktif (is_revoked = FALSE)
	isNewRevoked, err := sessionStore.IsSessionRevoked(sessNew.ID)
	if err != nil {
		t.Fatalf("IsSessionRevoked new gagal: %v", err)
	}
	if isNewRevoked {
		t.Errorf("Ekspektasi sesi perangkat baru tetap aktif, namun ikut ter-revoke!")
	}
}
