package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type mockDeviceHub struct {
	kickedUserID   string
	kickedDeviceID string
	kickedReason   string
	kickCalled     bool
}

func (m *mockDeviceHub) KickClientByUserID(userID, exceptDeviceID, reason string) {}

func (m *mockDeviceHub) KickClientByDeviceID(userID, deviceID, reason string) {
	m.kickedUserID = userID
	m.kickedDeviceID = deviceID
	m.kickedReason = reason
	m.kickCalled = true
}

func TestDeviceManagementFlow(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_device_api.db")
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

	deviceHandler := api.NewDeviceHandler(deviceStore)
	deviceHandler.SetSessionStore(sessionStore)
	deviceHandler.SetHub(mockHub)

	// 1. Registrasi user
	regBody, _ := json.Marshal(api.RegisterRequest{
		Username:    "budi_device",
		DisplayName: "Budi Device",
		Password:    "password123",
		DeviceID:    "dev_phone",
	})
	reqReg := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regBody))
	wReg := httptest.NewRecorder()
	authHandler.Register(wReg, reqReg)
	if wReg.Code != http.StatusCreated {
		t.Fatalf("register failed with code %d: %s", wReg.Code, wReg.Body.String())
	}

	// 2. Login dari Device 1 (Phone)
	loginBody1, _ := json.Marshal(api.LoginRequest{
		Username: "budi_device",
		Password: "password123",
		DeviceID: "dev_phone",
	})
	reqLogin1 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody1))
	reqLogin1.Header.Set("User-Agent", "Mozilla/5.0 (Linux; Android 14)")
	wLogin1 := httptest.NewRecorder()
	authHandler.Login(wLogin1, reqLogin1)
	if wLogin1.Code != http.StatusOK {
		t.Fatalf("login 1 failed: %d", wLogin1.Code)
	}

	var res1 api.AuthResponse
	_ = json.NewDecoder(wLogin1.Body).Decode(&res1)
	userID := res1.User.ID

	// 3. Login dari Device 2 (Laptop)
	loginBody2, _ := json.Marshal(api.LoginRequest{
		Username: "budi_device",
		Password: "password123",
		DeviceID: "dev_laptop",
	})
	reqLogin2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody2))
	reqLogin2.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")
	wLogin2 := httptest.NewRecorder()
	authHandler.Login(wLogin2, reqLogin2)
	if wLogin2.Code != http.StatusOK {
		t.Fatalf("login 2 failed: %d", wLogin2.Code)
	}

	var res2 api.AuthResponse
	_ = json.NewDecoder(wLogin2.Body).Decode(&res2)
	tokenLaptop := res2.Token

	// Claims context helper
	claimsLaptop, err := auth.ValidateToken(tokenLaptop)
	if err != nil {
		t.Fatalf("token invalid: %v", err)
	}
	ctxWithAuth := context.WithValue(context.Background(), auth.UserContextKey, claimsLaptop)

	// 4. Test ListDevices dari Laptop
	reqList := httptest.NewRequest(http.MethodGet, "/api/auth/devices", nil).WithContext(ctxWithAuth)
	wList := httptest.NewRecorder()
	deviceHandler.ListDevices(wList, reqList)
	if wList.Code != http.StatusOK {
		t.Fatalf("ListDevices failed with code %d: %s", wList.Code, wList.Body.String())
	}

	var devices []store.Device
	if err := json.NewDecoder(wList.Body).Decode(&devices); err != nil {
		t.Fatalf("failed to decode devices: %v", err)
	}
	if len(devices) != 2 {
		t.Fatalf("expected 2 devices, got %d", len(devices))
	}

	// 5. Test RemoveDevice menolak mengeluarkan perangkat saat ini
	reqDelSelf := httptest.NewRequest(http.MethodDelete, "/api/auth/devices/dev_laptop", nil).WithContext(ctxWithAuth)
	reqDelSelf.Header.Set("X-Device-ID", "dev_laptop")
	wDelSelf := httptest.NewRecorder()
	deviceHandler.RemoveDevice(wDelSelf, reqDelSelf)
	if wDelSelf.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when removing current device, got %d", wDelSelf.Code)
	}

	// 6. Test RemoveDevice berhasil mengeluarkan perangkat Phone
	reqDelPhone := httptest.NewRequest(http.MethodDelete, "/api/auth/devices/dev_phone", nil).WithContext(ctxWithAuth)
	reqDelPhone.Header.Set("X-Device-ID", "dev_laptop")
	wDelPhone := httptest.NewRecorder()
	deviceHandler.RemoveDevice(wDelPhone, reqDelPhone)
	if wDelPhone.Code != http.StatusOK {
		t.Fatalf("expected 200 when removing phone device, got %d: %s", wDelPhone.Code, wDelPhone.Body.String())
	}

	// Verifikasi mockHub dipanggil untuk kick dev_phone
	if !mockHub.kickCalled || mockHub.kickedDeviceID != "dev_phone" || mockHub.kickedUserID != userID {
		t.Errorf("expected hub to kick dev_phone for %s, got called=%v device=%s", userID, mockHub.kickCalled, mockHub.kickedDeviceID)
	}

	// 7. Test ListDevices kembali hanya mengembalikan 1 device aktif (dev_laptop)
	reqList2 := httptest.NewRequest(http.MethodGet, "/api/auth/devices", nil).WithContext(ctxWithAuth)
	wList2 := httptest.NewRecorder()
	deviceHandler.ListDevices(wList2, reqList2)
	if wList2.Code != http.StatusOK {
		t.Fatalf("ListDevices after delete failed: %d", wList2.Code)
	}
	var remaining []store.Device
	_ = json.NewDecoder(wList2.Body).Decode(&remaining)
	if len(remaining) != 1 || remaining[0].ID != "dev_laptop" {
		t.Fatalf("expected 1 remaining device (dev_laptop), got %d: %v", len(remaining), remaining)
	}
}
