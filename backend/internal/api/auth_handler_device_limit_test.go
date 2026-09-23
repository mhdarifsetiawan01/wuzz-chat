package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestAuthHandler_DeviceLimitFlow(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_device_limit.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	deviceStore := store.NewSQLDeviceStore(sqlStore.DB(), sqlStore.DriverName())
	sessionStore := store.NewSQLSessionStore(sqlStore.DB(), sqlStore.DriverName())
	mockHub := &mockDeviceHub{}

	authHandler := api.NewAuthHandler(userStore)
	authHandler.SetSessionStore(sessionStore)
	authHandler.SetDeviceStore(deviceStore)
	authHandler.SetHub(mockHub)

	// 1. Registrasi user di Device 1
	regBody, _ := json.Marshal(api.RegisterRequest{
		Username:    "andi_multidev",
		DisplayName: "Andi Multidev",
		Password:    "password123",
		DeviceID:    "dev_1",
	})
	reqReg := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regBody))
	rrReg := httptest.NewRecorder()
	authHandler.Register(rrReg, reqReg)
	if rrReg.Code != http.StatusCreated {
		t.Fatalf("register failed, status: %d, body: %s", rrReg.Code, rrReg.Body.String())
	}
	var regResp api.AuthResponse
	if err := json.Unmarshal(rrReg.Body.Bytes(), &regResp); err != nil || regResp.User == nil {
		t.Fatalf("failed to decode register response: %v", err)
	}
	userID := regResp.User.ID

	// 2. Login di Device 2 -> Harusnya Sukses (Kuota 2/2)
	loginBody2, _ := json.Marshal(api.LoginRequest{
		Username: "andi_multidev",
		Password: "password123",
		DeviceID: "dev_2",
	})
	reqLogin2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody2))
	rrLogin2 := httptest.NewRecorder()
	authHandler.Login(rrLogin2, reqLogin2)
	if rrLogin2.Code != http.StatusOK {
		t.Fatalf("login dev_2 failed, status: %d, body: %s", rrLogin2.Code, rrLogin2.Body.String())
	}

	// 3. Re-login di Device 1 -> Harusnya Sukses (Karena dev_1 sudah terdaftar aktif)
	loginBody1, _ := json.Marshal(api.LoginRequest{
		Username: "andi_multidev",
		Password: "password123",
		DeviceID: "dev_1",
	})
	reqLogin1 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody1))
	rrLogin1 := httptest.NewRecorder()
	authHandler.Login(rrLogin1, reqLogin1)
	if rrLogin1.Code != http.StatusOK {
		t.Fatalf("re-login dev_1 failed, status: %d, body: %s", rrLogin1.Code, rrLogin1.Body.String())
	}

	// 4. Login di Device 3 tanpa ConfirmOverride -> Harusnya Ditolak HTTP 409 Conflict (DEVICE_LIMIT_REACHED)
	loginBody3, _ := json.Marshal(api.LoginRequest{
		Username: "andi_multidev",
		Password: "password123",
		DeviceID: "dev_3",
	})
	reqLogin3 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody3))
	rrLogin3 := httptest.NewRecorder()
	authHandler.Login(rrLogin3, reqLogin3)

	if rrLogin3.Code != http.StatusConflict {
		t.Fatalf("expected status 409 Conflict for dev_3, got: %d (body: %s)", rrLogin3.Code, rrLogin3.Body.String())
	}

	var conflictResp map[string]interface{}
	if err := json.Unmarshal(rrLogin3.Body.Bytes(), &conflictResp); err != nil {
		t.Fatalf("failed to decode conflict response: %v", err)
	}
	if conflictResp["code"] != "DEVICE_LIMIT_REACHED" {
		t.Fatalf("expected code DEVICE_LIMIT_REACHED, got: %v", conflictResp["code"])
	}
	activeDevs, ok := conflictResp["active_devices"].([]interface{})
	if !ok || len(activeDevs) != 2 {
		t.Fatalf("expected 2 active devices in conflict response, got: %v", conflictResp["active_devices"])
	}

	// 5. Login di Device 3 DENGAN ConfirmOverride & pilih kick dev_1
	loginBody3Override, _ := json.Marshal(api.LoginRequest{
		Username:        "andi_multidev",
		Password:        "password123",
		DeviceID:        "dev_3",
		ConfirmOverride: true,
		KickDeviceID:    "dev_1",
	})
	reqLogin3Override := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody3Override))
	rrLogin3Override := httptest.NewRecorder()
	authHandler.Login(rrLogin3Override, reqLogin3Override)

	if rrLogin3Override.Code != http.StatusOK {
		t.Fatalf("login dev_3 with override failed, status: %d, body: %s", rrLogin3Override.Code, rrLogin3Override.Body.String())
	}

	// Pastikan mockHub menerima sinyal kick untuk dev_1
	if !mockHub.kickCalled || mockHub.kickedDeviceID != "dev_1" {
		t.Fatalf("expected kick on dev_1, got kickCalled=%v, kickedDev=%s", mockHub.kickCalled, mockHub.kickedDeviceID)
	}

	// 6. Verifikasi perangkat aktif sekarang adalah dev_2 dan dev_3
	devsAfter, err := deviceStore.GetUserDevices(userID)
	if err != nil {
		t.Fatalf("failed to get active devices: %v", err)
	}
	if len(devsAfter) != 2 {
		t.Fatalf("expected 2 active devices after override, got: %d", len(devsAfter))
	}
	var hasDev1, hasDev2, hasDev3 bool
	for _, d := range devsAfter {
		if d.ID == "dev_1" {
			hasDev1 = true
		}
		if d.ID == "dev_2" {
			hasDev2 = true
		}
		if d.ID == "dev_3" {
			hasDev3 = true
		}
	}
	if hasDev1 {
		t.Errorf("dev_1 should not be active")
	}
	if !hasDev2 {
		t.Errorf("dev_2 should remain active")
	}
	if !hasDev3 {
		t.Errorf("dev_3 should be active")
	}
}
