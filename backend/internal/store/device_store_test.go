package store

import (
	"path/filepath"
	"testing"
	"time"
)

func TestSQLDeviceStore_SQLite(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_devices.db")
	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	deviceStore := NewSQLDeviceStore(sqlStore.DB(), sqlStore.DriverName())
	userID := "user_alice"

	// 1. Test Register device baru
	d1 := &Device{
		ID:        "dev_chrome_win",
		UserID:    userID,
		Name:      "Chrome on Windows",
		Platform:  "web",
		UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
		IPAddress: "192.168.1.10",
		IsActive:  true,
		CreatedAt: time.Now().UTC().Add(-1 * time.Hour),
	}
	if err := deviceStore.RegisterOrUpdateDevice(d1); err != nil {
		t.Fatalf("failed to register device 1: %v", err)
	}

	// 2. Test Register device kedua
	d2 := &Device{
		ID:        "dev_safari_mac",
		UserID:    userID,
		Name:      "Safari on Mac",
		Platform:  "web",
		UserAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
		IPAddress: "192.168.1.20",
		IsActive:  true,
		CreatedAt: time.Now().UTC(),
	}
	if err := deviceStore.RegisterOrUpdateDevice(d2); err != nil {
		t.Fatalf("failed to register device 2: %v", err)
	}

	// 3. Test GetUserDevices
	devices, err := deviceStore.GetUserDevices(userID)
	if err != nil {
		t.Fatalf("failed to get user devices: %v", err)
	}
	if len(devices) != 2 {
		t.Fatalf("expected 2 devices, got %d", len(devices))
	}

	// 4. Test TouchDevice (update last_seen_at)
	time.Sleep(10 * time.Millisecond)
	if err := deviceStore.TouchDevice(d1.ID); err != nil {
		t.Fatalf("failed to touch device: %v", err)
	}
	devices, err = deviceStore.GetUserDevices(userID)
	if err != nil {
		t.Fatalf("failed to get user devices after touch: %v", err)
	}
	// Device 1 should be first because it was touched most recently
	if devices[0].ID != d1.ID {
		t.Errorf("expected devices[0] to be d1 (%s), got %s", d1.ID, devices[0].ID)
	}

	// 5. Test DeactivateDevice
	if err := deviceStore.DeactivateDevice(d2.ID, userID); err != nil {
		t.Fatalf("failed to deactivate device 2: %v", err)
	}

	// Verifikasi hanya 1 device aktif yang tersisa
	devices, err = deviceStore.GetUserDevices(userID)
	if err != nil {
		t.Fatalf("failed to get user devices after deactivate: %v", err)
	}
	if len(devices) != 1 || devices[0].ID != d1.ID {
		t.Fatalf("expected 1 active device (%s), got %d devices", d1.ID, len(devices))
	}

	// 6. Test DeactivateDevice dengan user lain (guard check)
	err = deviceStore.DeactivateDevice(d1.ID, "user_bob_imposter")
	if err == nil {
		t.Fatalf("expected error deactivating device with wrong user_id, got nil")
	}

	// 7. Test RegisterOrUpdateDevice (update data yang sudah ada dan re-activate)
	d2Updated := &Device{
		ID:        "dev_safari_mac",
		UserID:    userID,
		Name:      "Safari on Mac Updated",
		Platform:  "web",
		UserAgent: "Mozilla/5.0 Updated",
		IPAddress: "192.168.1.25",
	}
	if err := deviceStore.RegisterOrUpdateDevice(d2Updated); err != nil {
		t.Fatalf("failed to update device 2: %v", err)
	}
	devices, err = deviceStore.GetUserDevices(userID)
	if err != nil {
		t.Fatalf("failed to get user devices after re-activate: %v", err)
	}
	if len(devices) != 2 {
		t.Fatalf("expected 2 active devices after reactivation, got %d", len(devices))
	}
}
