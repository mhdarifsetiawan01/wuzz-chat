package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func TestUpdatePublicKey_MultiDeviceSharedKey(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_user_multidevice.db")
	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	user, err := userStore.Register("alice_multikey", "Alice Multi", "Password123!")
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	masterKey := "base64_master_e2ee_public_key_shared"
	deviceLaptop := "dev_laptop_111"
	devicePhone := "dev_phone_222"
	diffKey := "base64_different_unauthorized_key_999"

	// 1. Device 1 (Laptop) mendaftarkan master key pertama kali
	ver1, err := userStore.UpdatePublicKeyWithDevice(user.ID, masterKey, deviceLaptop)
	if err != nil {
		t.Fatalf("UpdatePublicKeyWithDevice device 1 failed: %v", err)
	}
	if ver1 < 1 {
		t.Errorf("Expected keyVersion >= 1, got %d", ver1)
	}

	// Verifikasi data tersimpan
	pubKey, keyVer, activeDev, err := userStore.GetE2EEInfo(user.ID)
	if err != nil {
		t.Fatalf("GetE2EEInfo failed: %v", err)
	}
	if pubKey != masterKey || activeDev != deviceLaptop {
		t.Fatalf("Data mismatch: pubKey=%s, activeDev=%s", pubKey, activeDev)
	}

	// 2. Device 1 reconnect / panggil ulang dengan key dan device yang sama
	verReconnect, err := userStore.UpdatePublicKeyWithDevice(user.ID, masterKey, deviceLaptop)
	if err != nil {
		t.Fatalf("UpdatePublicKeyWithDevice reconnect device 1 failed: %v", err)
	}
	if verReconnect != keyVer {
		t.Errorf("Expected keyVersion %d, got %d", keyVer, verReconnect)
	}

	// 3. Multi-Device: Device 2 (Phone) mengirim master key yang IDENTIK (hasil QR Transfer)
	verPhone, err := userStore.UpdatePublicKeyWithDevice(user.ID, masterKey, devicePhone)
	if err != nil {
		t.Fatalf("Device 2 with identical key should SUCCEED, got error: %v", err)
	}
	if verPhone != keyVer {
		t.Errorf("Expected keyVersion %d, got %d", keyVer, verPhone)
	}

	// Pastikan active_device_id tetap menunjuk ke perangkat utama (tidak tertimpa)
	_, _, activeDevAfter, err := userStore.GetE2EEInfo(user.ID)
	if err != nil {
		t.Fatalf("GetE2EEInfo failed: %v", err)
	}
	if activeDevAfter != deviceLaptop {
		t.Errorf("Expected active_device_id to remain %s, got %s", deviceLaptop, activeDevAfter)
	}

	// 4. Negative Case: Device 3 mencoba mengirim key yang BERBEDA (belum sync QR / konflik)
	_, err = userStore.UpdatePublicKeyWithDevice(user.ID, diffKey, "dev_attacker_333")
	if err == nil {
		t.Fatalf("Device with different key should return ErrKeyConflict, got nil")
	}
	if !errors.Is(err, ErrKeyConflict) {
		t.Errorf("Expected ErrKeyConflict, got: %v", err)
	}
}
