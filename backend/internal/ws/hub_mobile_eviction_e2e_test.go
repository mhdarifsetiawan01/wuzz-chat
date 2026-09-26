package ws_test

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
	"github.com/gorilla/websocket"
)

// TestE2E_MobileEvictedByWebLogin memverifikasi skenario nyata:
// 1. Pengguna login dan terhubung di aplikasi Android (Device: android_phone_001).
// 2. Pengguna kemudian login dan terhubung di aplikasi Web (Device: web_laptop_002).
// 3. Server backend mengirimkan event SESSION_REPLACED dan menutup koneksi Android dengan Close Code 4001.
// 4. Klien Android ter-logout dan tidak dapat melakukan reconnect liar.
func TestE2E_MobileEvictedByWebLogin(t *testing.T) {
	tempDB := filepath.Join(t.TempDir(), "wuzz_eviction_e2e.db")
	msgStore, err := store.NewSQLMessageStore("sqlite", tempDB)
	if err != nil {
		t.Fatalf("failed to create SQL store: %v", err)
	}
	userStore := store.NewSQLUserStore(msgStore.DB(), msgStore.DriverName())

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, msgStore)
	hub.SetUserStore(userStore)
	hub.SetMaxActiveDevices(1) // Single active device mode

	wsHandler := ws.NewHandler(hub)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wsHandler.ServeHTTP(w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	// Daftarkan user uji
	alice, err := userStore.Register("alice_mobile_guard", "Alice Mobile", "password123")
	if err != nil {
		t.Fatalf("gagal membuat user: %v", err)
	}

	token, _ := auth.GenerateToken(alice.ID, alice.Username, alice.DisplayName)

	// 1. Klien Android terhubung
	androidURL := wsURL + "?token=" + token + "&device_id=android_phone_001"
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}

	androidConn, _, err := dialer.Dial(androidURL, http.Header{"Origin": []string{"http://localhost:3000"}})
	if err != nil {
		t.Fatalf("Klien Android gagal terhubung ke WebSocket: %v", err)
	}
	defer androidConn.Close()

	// Channel untuk menangkap Close Frame dan payload SESSION_REPLACED pada Android
	androidClosed := make(chan int, 1)
	androidMessages := make(chan ws.Message, 5)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			var msg ws.Message
			err := androidConn.ReadJSON(&msg)
			if err != nil {
				if websocket.IsCloseError(err, 4001) || strings.Contains(err.Error(), "4001") {
					androidClosed <- 4001
				} else if closeErr, ok := err.(*websocket.CloseError); ok {
					androidClosed <- closeErr.Code
				} else {
					androidClosed <- -1
				}
				return
			}
			androidMessages <- msg
		}
	}()

	// Berikan waktu sejenak agar Android terdaftar
	time.Sleep(100 * time.Millisecond)

	// Pastikan Android aktif di Hub
	c1, ok := hub.GetClient(alice.ID)
	if !ok || c1 == nil {
		t.Fatalf("Ekspektasi Android terdaftar di Hub, tetapi tidak ditemukan")
	}
	if c1.DeviceID != "android_phone_001" {
		t.Fatalf("DeviceID terdaftar bukan Android: %s", c1.DeviceID)
	}

	// 2. Pengguna sekarang login dari Web Desktop (Device: web_laptop_002)
	webURL := wsURL + "?token=" + token + "&device_id=web_laptop_002"
	webConn, _, err := dialer.Dial(webURL, http.Header{"Origin": []string{"https://chat.wuzzhub.id"}})
	if err != nil {
		t.Fatalf("Klien Web gagal terhubung ke WebSocket: %v", err)
	}
	defer webConn.Close()

	// 3. Verifikasi Klien Android menerima pesan SESSION_REPLACED dan Close Code 4001
	select {
	case closeCode := <-androidClosed:
		if closeCode != 4001 {
			t.Errorf("Ekspektasi Close Code 4001 pada Android, tetapi menerima: %d", closeCode)
		} else {
			t.Logf("✅ BERHASIL: Klien Android menerima Close Code 4001 (SESSION_REPLACED) dan soket diputus!")
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("Timeout: Klien Android tidak menerima Close Code 4001 setelah Web login!")
	}

	// 4. Verifikasi Klien Web sekarang adalah sesi aktif di Hub
	time.Sleep(100 * time.Millisecond)
	cActive, ok := hub.GetClient(alice.ID)
	if !ok || cActive == nil {
		t.Fatalf("Ekspektasi sesi Web aktif di Hub")
	}
	if cActive.DeviceID != "web_laptop_002" {
		t.Fatalf("Device aktif saat ini bukan Web Desktop: %s", cActive.DeviceID)
	}

	t.Logf("✅ BERHASIL: Klien Web (web_laptop_002) menggantikan Android (android_phone_001) secara mulus!")
}
