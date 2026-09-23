package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
	"github.com/gorilla/websocket"
)

func TestMultiDevice_CompleteUserFlow(t *testing.T) {
	// ─── SETUP INFRASTRUKTUR TESTING ──────────────────────────────────────────
	tmpDB := filepath.Join(t.TempDir(), "test_multidevice_flow.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("Gagal init database: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	deviceStore := store.NewSQLDeviceStore(sqlStore.DB(), sqlStore.DriverName())
	tokenStore := store.NewSQLTokenStore(sqlStore.DB(), sqlStore.DriverName())
	sessionStore := store.NewSQLSessionStore(sqlStore.DB(), sqlStore.DriverName())
	transferStore := store.NewSQLTransferStore(sqlStore.DB(), sqlStore.DriverName())
	clientStore := store.NewMemoryClientStore()

	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	auth.SetTokenChecker(tokenStore)
	defer auth.SetTokenChecker(nil)

	authHandler := api.NewAuthHandler(userStore)
	authHandler.SetTokenStore(tokenStore)
	authHandler.SetSessionStore(sessionStore)
	authHandler.SetDeviceStore(deviceStore)

	deviceHandler := api.NewDeviceHandler(deviceStore)
	deviceHandler.SetUserStore(userStore)
	deviceHandler.SetSessionStore(sessionStore)
	deviceHandler.SetHub(hub)

	transferHandler := api.NewTransferHandler(transferStore)
	transferHandler.SetSessionStore(sessionStore)

	// ─── 1. LOGIN DI DEVICE 1 (PHONE) ─────────────────────────────────────────
	t.Log("📱 [1] Registrasi dan Login di Device 1 (Phone)...")
	regBody, _ := json.Marshal(api.RegisterRequest{
		Username:    "budi_flow",
		DisplayName: "Budi Flow",
		Password:    "Password123!",
		DeviceID:    "dev_phone_1",
	})
	reqReg := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regBody))
	wReg := httptest.NewRecorder()
	authHandler.Register(wReg, reqReg)
	if wReg.Code != http.StatusCreated {
		t.Fatalf("Register Device 1 gagal: %d - %s", wReg.Code, wReg.Body.String())
	}

	loginBody1, _ := json.Marshal(api.LoginRequest{
		Username: "budi_flow",
		Password: "Password123!",
		DeviceID: "dev_phone_1",
	})
	reqLogin1 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody1))
	reqLogin1.Header.Set("User-Agent", "Mozilla/5.0 (Linux; Android 14; Pixel 8)")
	wLogin1 := httptest.NewRecorder()
	authHandler.Login(wLogin1, reqLogin1)
	if wLogin1.Code != http.StatusOK {
		t.Fatalf("Login Device 1 gagal: %d", wLogin1.Code)
	}

	var resLogin1 api.AuthResponse
	_ = json.NewDecoder(wLogin1.Body).Decode(&resLogin1)
	tokenDev1 := resLogin1.Token
	userBudi := resLogin1.User

	// Inisialisasi E2EE Key di Device 1
	masterKey := "base64_master_identity_key_abc123"
	keyBody1, _ := json.Marshal(map[string]string{
		"public_key": masterKey,
		"device_id":  "dev_phone_1",
	})
	reqKey1 := httptest.NewRequest(http.MethodPut, "/api/users/keys", bytes.NewReader(keyBody1))
	reqKey1.Header.Set("Authorization", "Bearer "+tokenDev1)
	wKey1 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(wKey1, reqKey1)
	if wKey1.Code != http.StatusOK {
		t.Fatalf("Update key Device 1 gagal: %d", wKey1.Code)
	}

	// ─── 2. TAUTKAN PERANGKAT DI DEVICE 2 (LAPTOP) ────────────────────────────
	t.Log("💻 [2] Menautkan Perangkat di Device 2 (Laptop) via QR Transfer...")
	sessionToken := "a1b2c3d4e5f60718293a4b5c6d7e8f90"
	encryptedBundle := `{"key":"encrypted_master_key_for_laptop"}`

	// Device 1 membuat sesi transfer QR
	createTransferBody, _ := json.Marshal(map[string]string{
		"session_token":    sessionToken,
		"encrypted_bundle": encryptedBundle,
	})
	reqCreateTransfer := httptest.NewRequest(http.MethodPost, "/api/users/transfer/create", bytes.NewReader(createTransferBody))
	reqCreateTransfer.Header.Set("Authorization", "Bearer "+tokenDev1)
	wCreateTransfer := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(transferHandler.CreateSession)).ServeHTTP(wCreateTransfer, reqCreateTransfer)
	if wCreateTransfer.Code != http.StatusCreated {
		t.Fatalf("Create transfer session gagal: %d - %s", wCreateTransfer.Code, wCreateTransfer.Body.String())
	}

	// Device 2 login via kredensial akun
	loginBody2, _ := json.Marshal(api.LoginRequest{
		Username: "budi_flow",
		Password: "Password123!",
		DeviceID: "dev_laptop_2",
	})
	reqLogin2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody2))
	reqLogin2.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0")
	wLogin2 := httptest.NewRecorder()
	authHandler.Login(wLogin2, reqLogin2)
	if wLogin2.Code != http.StatusOK {
		t.Fatalf("Login Device 2 gagal: %d", wLogin2.Code)
	}

	var resLogin2 api.AuthResponse
	_ = json.NewDecoder(wLogin2.Body).Decode(&resLogin2)
	tokenDev2 := resLogin2.Token

	// Device 2 consume bundle transfer QR
	consumeBody, _ := json.Marshal(map[string]string{
		"session_token": sessionToken,
		"device_id":     "dev_laptop_2",
	})
	reqConsume := httptest.NewRequest(http.MethodPost, "/api/users/transfer/consume", bytes.NewReader(consumeBody))
	reqConsume.Header.Set("Authorization", "Bearer "+tokenDev2)
	wConsume := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(transferHandler.ConsumeSession)).ServeHTTP(wConsume, reqConsume)
	if wConsume.Code != http.StatusOK {
		t.Fatalf("Consume transfer gagal: %d - %s", wConsume.Code, wConsume.Body.String())
	}

	// Device 2 mendaftarkan master key yang telah disinkronkan
	keyBody2, _ := json.Marshal(map[string]string{
		"public_key": masterKey, // Kunci IDENTIK hasil sinkronisasi QR
		"device_id":  "dev_laptop_2",
	})
	reqKey2 := httptest.NewRequest(http.MethodPut, "/api/users/keys", bytes.NewReader(keyBody2))
	reqKey2.Header.Set("Authorization", "Bearer "+tokenDev2)
	wKey2 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(authHandler.UpdatePublicKey)).ServeHTTP(wKey2, reqKey2)
	if wKey2.Code != http.StatusOK {
		t.Fatalf("Device 2 sync key gagal: %d", wKey2.Code)
	}

	// Verifikasi kedua device tercatat aktif (Kuotanya 2/2)
	claimsDev1, _ := auth.ValidateToken(tokenDev1)
	ctxDev1 := context.WithValue(context.Background(), auth.UserContextKey, claimsDev1)

	reqListDevices := httptest.NewRequest(http.MethodGet, "/api/auth/devices", nil).WithContext(ctxDev1)
	wListDevices := httptest.NewRecorder()
	deviceHandler.ListDevices(wListDevices, reqListDevices)
	if wListDevices.Code != http.StatusOK {
		t.Fatalf("ListDevices gagal: %d", wListDevices.Code)
	}
	var activeDevices []store.Device
	_ = json.NewDecoder(wListDevices.Body).Decode(&activeDevices)
	if len(activeDevices) != 2 {
		t.Fatalf("Ekspektasi 2 perangkat aktif bersamaan, dapat: %d", len(activeDevices))
	}
	t.Logf("✅ Kedua perangkat berhasil terhubung bersamaan: %s (%s) & %s (%s)",
		activeDevices[0].ID, activeDevices[0].Platform,
		activeDevices[1].ID, activeDevices[1].Platform)

	// ─── 3. UJI COBA LOGOUT DI DEVICE 1 ───────────────────────────────────────
	t.Log("🚪 [3] Logout di Device 1 (Phone) dan pastikan Device 2 (Laptop) tetap aktif...")
	reqLogout1 := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil).WithContext(ctxDev1)
	reqLogout1.Header.Set("X-Device-ID", "dev_phone_1")
	wLogout1 := httptest.NewRecorder()
	authHandler.Logout(wLogout1, reqLogout1)
	if wLogout1.Code != http.StatusOK {
		t.Fatalf("Logout Device 1 gagal: %d", wLogout1.Code)
	}

	// Pastikan token Device 1 ditolak oleh RequireJWT (revoked)
	reqCheckDev1 := httptest.NewRequest(http.MethodGet, "/api/auth/devices", nil)
	reqCheckDev1.Header.Set("Authorization", "Bearer "+tokenDev1)
	wCheckDev1 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(deviceHandler.ListDevices)).ServeHTTP(wCheckDev1, reqCheckDev1)
	if wCheckDev1.Code != http.StatusUnauthorized {
		t.Fatalf("Ekspektasi token Device 1 ditolak 401 Unauthorized setelah logout, tapi dapat %d: %s", wCheckDev1.Code, wCheckDev1.Body.String())
	}
	t.Log("✅ Token Device 1 berhasil ditolak (Unauthorized / Sesi dicabut).")

	// Pastikan token Device 2 TETAP DITERIMA oleh RequireJWT
	reqCheckDev2 := httptest.NewRequest(http.MethodGet, "/api/auth/devices", nil)
	reqCheckDev2.Header.Set("Authorization", "Bearer "+tokenDev2)
	wCheckDev2 := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(deviceHandler.ListDevices)).ServeHTTP(wCheckDev2, reqCheckDev2)
	if wCheckDev2.Code != http.StatusOK {
		t.Fatalf("Device 2 gagal mengakses API setelah Device 1 logout: %d", wCheckDev2.Code)
	}
	t.Log("✅ Device 2 tetap berjalan normal dan dapat mengakses API secara independen.")

	// ─── 4. RE-LOGIN DEVICE 1 DAN MELOGOUTKAN DEVICE 2 DARI PROFIL DEVICE 1 ───
	t.Log("🔄 [4] Re-login Device 1 dan remote logout Device 2 melalui Device 1...")
	reqReLogin1 := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody1))
	wReLogin1 := httptest.NewRecorder()
	authHandler.Login(wReLogin1, reqReLogin1)
	if wReLogin1.Code != http.StatusOK {
		t.Fatalf("Re-login Device 1 gagal: %d", wReLogin1.Code)
	}
	var resReLogin1 api.AuthResponse
	_ = json.NewDecoder(wReLogin1.Body).Decode(&resReLogin1)
	tokenNewDev1 := resReLogin1.Token
	claimsNewDev1, _ := auth.ValidateToken(tokenNewDev1)
	ctxNewDev1 := context.WithValue(context.Background(), auth.UserContextKey, claimsNewDev1)

	// Simulasikan koneksi aktif Device 2 di Hub WebSocket
	cLaptop := &ws.Client{
		ID:       userBudi.ID,
		DeviceID: "dev_laptop_2",
		Nickname: userBudi.DisplayName,
		JoinedAt: time.Now().UTC(),
	}
	hub.Register(cLaptop)

	// Device 1 melogoutkan Device 2 melalui endpoint DELETE /api/auth/devices/dev_laptop_2
	reqKickDev2 := httptest.NewRequest(http.MethodDelete, "/api/auth/devices/dev_laptop_2", nil).WithContext(ctxNewDev1)
	reqKickDev2.Header.Set("X-Device-ID", "dev_phone_1")
	wKickDev2 := httptest.NewRecorder()
	deviceHandler.RemoveDevice(wKickDev2, reqKickDev2)
	if wKickDev2.Code != http.StatusOK {
		t.Fatalf("Remote logout Device 2 dari Device 1 gagal: %d - %s", wKickDev2.Code, wKickDev2.Body.String())
	}
	t.Log("✅ Endpoint DELETE /api/auth/devices/dev_laptop_2 berhasil dieksekusi dari Device 1.")

	// Verifikasi status perangkat Device 2 di deviceStore telah dinonaktifkan
	userDevs, err := deviceStore.GetUserDevices(userBudi.ID)
	if err != nil {
		t.Fatalf("GetUserDevices gagal: %v", err)
	}
	for _, d := range userDevs {
		if d.ID == "dev_laptop_2" && d.IsActive {
			t.Errorf("Ekspektasi dev_laptop_2 berstatus nonaktif setelah di-kick, tapi masih aktif!")
		}
	}
	t.Log("✅ Perangkat Device 2 berhasil dinonaktifkan di DeviceStore.")

	// Verifikasi Device 1 tetap aktif normal
	reqFinalCheck := httptest.NewRequest(http.MethodGet, "/api/auth/devices", nil).WithContext(ctxNewDev1)
	wFinalCheck := httptest.NewRecorder()
	deviceHandler.ListDevices(wFinalCheck, reqFinalCheck)
	if wFinalCheck.Code != http.StatusOK {
		t.Fatalf("Device 1 gagal verifikasi profil setelah kick: %d", wFinalCheck.Code)
	}
	var finalDevices []store.Device
	_ = json.NewDecoder(wFinalCheck.Body).Decode(&finalDevices)
	// ─── 5. VERIFIKASI WEBSOCKET RECONNECT PASCA KICK DEVICE 2 ───────────────
	t.Log("⚡ [5] Menguji WebSocket Handshake Device 1 dan Device 2 setelah kick...")
	wsHandler := ws.NewHandler(hub)
	wsHandler.SetUserStore(userStore)
	wsHandler.SetDeviceStore(deviceStore)

	wsServer := httptest.NewServer(wsHandler)
	defer wsServer.Close()
	wsURL := "ws" + strings.TrimPrefix(wsServer.URL, "http")

	// Device 1 mencoba reconnect ke WebSocket -> HARUS BERHASIL (101 Switching Protocols)
	// Ini membuktikan indikator Device 1 TIDAK AKAN kuning/timeout setelah mengeluarkan Device 2!
	connDev1, respDev1, err := websocket.DefaultDialer.Dial(wsURL+"?token="+tokenNewDev1+"&device_id=dev_phone_1", nil)
	if err != nil {
		t.Fatalf("Device 1 gagal konek WebSocket setelah kick Device 2: %v", err)
	}
	if respDev1.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("Ekspektasi Device 1 101 Switching Protocols, dapat: %d", respDev1.StatusCode)
	}
	defer connDev1.Close()
	t.Log("✅ Device 1 berhasil reconnect WebSocket (101 Switching Protocols) — Indikator HIJAU!")

	// Device 2 mencoba reconnect ke WebSocket -> HARUS DITOLAK 403 Forbidden
	_, respDev2, err := websocket.DefaultDialer.Dial(wsURL+"?token="+tokenDev2+"&device_id=dev_laptop_2", nil)
	if err == nil {
		t.Fatalf("Device 2 yang sudah di-kick seharusnya gagal konek WebSocket, tetapi berhasil!")
	}
	if respDev2 == nil || respDev2.StatusCode != http.StatusForbidden {
		t.Fatalf("Ekspektasi Device 2 ditolak 403 Forbidden, dapat: %v", respDev2)
	}
	t.Log("✅ Device 2 berhasil ditolak WebSocket (403 Forbidden / DEVICE_KICKED)!")

	// Verifikasi active_device_id di database tersinkronisasi ke Device 1
	_, _, activeDev, err := userStore.GetE2EEInfo(userBudi.ID)
	if err != nil {
		t.Fatalf("GetE2EEInfo gagal: %v", err)
	}
	if activeDev != "dev_phone_1" {
		t.Fatalf("Ekspektasi active_device_id adalah dev_phone_1, dapat: '%s'", activeDev)
	}
	t.Logf("✅ active_device_id tersinkronisasi dengan benar ke Device 1: %s", activeDev)

	t.Log("🎉 SELURUH SKENARIO PENGUJIAN MULTI-DEVICE BERHASIL 100%!")
}
