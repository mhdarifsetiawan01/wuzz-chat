package authz_test

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/authz/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func setupTestAuthService(t *testing.T) (*authz.AuthService, func()) {
	t.Helper()
	tmpDB := filepath.Join(t.TempDir(), "test_authz_svc.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	sessionStore := store.NewSQLSessionStore(sqlStore.DB(), sqlStore.DriverName())
	deviceStore := store.NewSQLDeviceStore(sqlStore.DB(), sqlStore.DriverName())
	tokenStore := store.NewSQLTokenStore(sqlStore.DB(), sqlStore.DriverName())
	transferStore := store.NewSQLTransferStore(sqlStore.DB(), sqlStore.DriverName())

	repo := infra.NewSQLAuthRepository(userStore, sessionStore, deviceStore, tokenStore, transferStore)
	svc := authz.NewAuthService(repo, nil)

	cleanup := func() {
		sqlStore.Close()
	}

	return svc, cleanup
}

func TestAuthService_RegisterAndLogin(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()

	// 1. Register Alice
	regRes, err := svc.Register(authz.RegisterInput{
		Username:    "alice",
		DisplayName: "Alice Wonder",
		Password:    "password123",
		DeviceID:    "dev-alice-1",
		UserAgent:   "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
		IP:          "127.0.0.1",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if regRes.Token == "" || regRes.UserID == "" {
		t.Fatalf("expected valid token and userID, got: %+v", regRes)
	}

	// 2. Register Duplicate Username -> Harus Gagal
	_, err = svc.Register(authz.RegisterInput{
		Username:    "alice",
		DisplayName: "Alice Duplicate",
		Password:    "password456",
		DeviceID:    "dev-alice-2",
	})
	if err == nil {
		t.Fatalf("expected error for duplicate username, got nil")
	}

	// 3. Login dengan password salah -> Harus Gagal
	_, _, err = svc.Login(authz.LoginInput{
		Username: "alice",
		Password: "wrongpassword",
		DeviceID: "dev-alice-1",
	})
	if err == nil {
		t.Fatalf("expected error for invalid password, got nil")
	}

	// 4. Login sukses dengan perangkat yang sama
	loginRes, conflict, err := svc.Login(authz.LoginInput{
		Username: "alice",
		Password: "password123",
		DeviceID: "dev-alice-1",
	})
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if conflict != nil {
		t.Fatalf("unexpected device conflict for same device: %+v", conflict)
	}
	if loginRes.Token == "" {
		t.Fatalf("expected valid login token")
	}

	// 5. Login dengan perangkat kedua (dev-alice-2) -> Harus Berhasil (kuota 2 perangkat)
	loginRes2, conflict, err := svc.Login(authz.LoginInput{
		Username:        "alice",
		Password:        "password123",
		DeviceID:        "dev-alice-2",
		ConfirmOverride: false,
	})
	if err != nil {
		t.Fatalf("Login for second device failed: %v", err)
	}
	if conflict != nil {
		t.Fatalf("unexpected conflict for 2nd device (max is 2): %+v", conflict)
	}
	if loginRes2.Token == "" {
		t.Fatalf("expected valid login token for 2nd device")
	}

	// 6. Login dengan perangkat ketiga (dev-alice-3) tanpa confirmOverride -> Harus Conflict
	_, conflict, err = svc.Login(authz.LoginInput{
		Username:        "alice",
		Password:        "password123",
		DeviceID:        "dev-alice-3",
		ConfirmOverride: false,
	})
	if err != nil {
		t.Fatalf("unexpected error on 3rd device: %v", err)
	}
	if conflict == nil {
		t.Fatalf("expected conflict for 3rd device exceeding limit of 2")
	}

	// 7. Login dengan perangkat ketiga dengan confirmOverride -> Berhasil override
	loginRes3, _, err := svc.Login(authz.LoginInput{
		Username:        "alice",
		Password:        "password123",
		DeviceID:        "dev-alice-3",
		ConfirmOverride: true,
	})
	if err != nil {
		t.Fatalf("Login with override failed: %v", err)
	}
	if loginRes3.Token == "" {
		t.Fatalf("expected valid login token after override")
	}
}

func TestAuthService_SessionsAndLogout(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()

	// Register Bob
	regRes, err := svc.Register(authz.RegisterInput{
		Username:    "bob",
		DisplayName: "Bob Builder",
		Password:    "secret12345",
		DeviceID:    "dev-bob-1",
		UserAgent:   "Chrome/120.0",
		IP:          "192.168.1.10",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// Ambil sesi aktif
	sessions, err := svc.GetActiveSessions(regRes.UserID, regRes.JTI)
	if err != nil {
		t.Fatalf("GetActiveSessions failed: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 active session, got %d", len(sessions))
	}
	if !sessions[0].IsCurrent {
		t.Errorf("expected current session flag to be true")
	}

	// Logout
	err = svc.Logout(authz.LogoutInput{
		JTI:      regRes.JTI,
		UserID:   regRes.UserID,
		DeviceID: "dev-bob-1",
		TokenExp: time.Now().Add(24 * time.Hour),
	})
	if err != nil {
		t.Fatalf("Logout failed: %v", err)
	}

	// Setelah logout, sesi tidak boleh ada lagi di active sessions
	sessionsAfter, err := svc.GetActiveSessions(regRes.UserID, regRes.JTI)
	if err != nil {
		t.Fatalf("GetActiveSessions after logout failed: %v", err)
	}
	if len(sessionsAfter) != 0 {
		t.Fatalf("expected 0 active sessions after logout, got %d", len(sessionsAfter))
	}
}

func TestAuthService_ChangePassword(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()

	// Register Charlie
	regRes, err := svc.Register(authz.RegisterInput{
		Username:    "charlie",
		DisplayName: "Charlie Brown",
		Password:    "oldPassword123",
		DeviceID:    "dev-charlie-1",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// Ganti password dengan old password salah -> Gagal
	err = svc.ChangePassword(authz.ChangePasswordInput{
		UserID:      regRes.UserID,
		OldPassword: "wrongPassword",
		NewPassword: "newPassword123",
	})
	if err == nil {
		t.Fatalf("expected error when old password is wrong")
	}

	// Ganti password baru sama dengan lama -> Gagal
	err = svc.ChangePassword(authz.ChangePasswordInput{
		UserID:      regRes.UserID,
		OldPassword: "oldPassword123",
		NewPassword: "oldPassword123",
	})
	if err == nil {
		t.Fatalf("expected error when new password equals old password")
	}

	// Ganti password sukses
	err = svc.ChangePassword(authz.ChangePasswordInput{
		UserID:      regRes.UserID,
		OldPassword: "oldPassword123",
		NewPassword: "newPassword123",
	})
	if err != nil {
		t.Fatalf("ChangePassword failed: %v", err)
	}

	// Login dengan password baru harus berhasil
	_, _, err = svc.Login(authz.LoginInput{
		Username: "charlie",
		Password: "newPassword123",
		DeviceID: "dev-charlie-1",
	})
	if err != nil {
		t.Fatalf("Login with new password failed: %v", err)
	}
}

func TestAuthService_DevicePlatformHandling(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()

	// 1. Register dengan platform eksplisit "android"
	regRes, err := svc.Register(authz.RegisterInput{
		Username:    "android_user",
		DisplayName: "Android Tester",
		Password:    "password123",
		DeviceID:    "dev-android-01",
		Platform:    "android",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	devices, err := svc.GetUserDevices(regRes.UserID)
	if err != nil || len(devices) == 0 {
		t.Fatalf("GetUserDevices failed: %v", err)
	}
	if devices[0].Platform != "android" {
		t.Fatalf("expected platform 'android', got '%s'", devices[0].Platform)
	}
	if devices[0].Name != "Android Device" {
		t.Fatalf("expected device name 'Android Device', got '%s'", devices[0].Name)
	}

	// 2. Login dengan platform eksplisit "ios"
	_, _, err = svc.Login(authz.LoginInput{
		Username: "android_user",
		Password: "password123",
		DeviceID: "dev-ios-01",
		Platform: "ios",
	})
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	devices, err = svc.GetUserDevices(regRes.UserID)
	if err != nil || len(devices) < 2 {
		t.Fatalf("expected 2 devices, got: %v", devices)
	}

	var foundIOS bool
	for _, d := range devices {
		if d.ID == "dev-ios-01" {
			foundIOS = true
			if d.Platform != "ios" {
				t.Fatalf("expected device dev-ios-01 platform 'ios', got '%s'", d.Platform)
			}
			if d.Name != "iOS Device" {
				t.Fatalf("expected device name 'iOS Device', got '%s'", d.Name)
			}
		}
	}
	if !foundIOS {
		t.Fatalf("dev-ios-01 not found in user devices")
	}

	// 3. Fallback auto-detection dari User-Agent Android
	regUA, err := svc.Register(authz.RegisterInput{
		Username:    "ua_user",
		DisplayName: "UA Tester",
		Password:    "password123",
		DeviceID:    "dev-ua-01",
		UserAgent:   "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
	})
	if err != nil {
		t.Fatalf("Register with UA failed: %v", err)
	}

	uaDevices, err := svc.GetUserDevices(regUA.UserID)
	if err != nil || len(uaDevices) == 0 {
		t.Fatalf("GetUserDevices failed: %v", err)
	}
	if uaDevices[0].Platform != "android" {
		t.Fatalf("expected platform auto-detected as 'android', got '%s'", uaDevices[0].Platform)
	}
}

