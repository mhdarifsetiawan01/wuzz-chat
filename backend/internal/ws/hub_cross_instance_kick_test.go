package ws

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/broker"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// TestHub_CrossInstanceSessionKick menguji bahwa pemanggilan KickClientByUserID pada Node A
// akan diteruskan via Redis Pub/Sub ke Node B sehingga perangkat target pada Node B ikut terputus.
func TestHub_CrossInstanceSessionKick(t *testing.T) {
	clusterBroker := broker.NewInMemoryBroker()
	defer clusterBroker.Close()

	hubA := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hubA.SetBroker(clusterBroker)

	hubB := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hubB.SetBroker(clusterBroker)

	userID := "user-alice"

	// Alice - Device Mobile terhubung ke Node A
	devMobileA := &Client{
		ID:         userID,
		DeviceID:   "device-mobile",
		SessionKey: fmt.Sprintf("%s:device-mobile", userID),
		Nickname:   "Alice Mobile",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hubA,
	}
	hubA.Register(devMobileA)

	// Alice - Device Laptop terhubung ke Node B
	devLaptopB := &Client{
		ID:         userID,
		DeviceID:   "device-laptop",
		SessionKey: fmt.Sprintf("%s:device-laptop", userID),
		Nickname:   "Alice Laptop",
		JoinedAt:   time.Now().UTC().Add(-10 * time.Minute),
		send:       make(chan Message, 10),
		hub:        hubB,
	}
	hubB.Register(devLaptopB)

	// Node A mengeksekusi KickClientByUserID dengan exceptDeviceID="device-mobile"
	// (misal saat reset key atau login baru dari mobile)
	kickReason := "SESSION_REPLACED: Kunci keamanan telah di-reset dari perangkat lain."
	hubA.KickClientByUserID(userID, "device-mobile", kickReason)

	// Verifikasi Laptop di Node B menerima pesan kick via cluster Redis Pub/Sub
	select {
	case msg := <-devLaptopB.send:
		if !strings.Contains(msg.Content, "SESSION_REPLACED") {
			t.Errorf("pesan kick di Node B tidak sesuai: %+v", msg)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timeout menunggu kick pada Node B (cross-instance session kick gagal)")
	}

	// Verifikasi Mobile di Node A TIDAK di-kick (karena merupakan exceptDeviceID)
	select {
	case msg := <-devMobileA.send:
		t.Fatalf("mobile Alice di Node A tidak boleh di-kick, tapi menerima: %+v", msg)
	case <-time.After(200 * time.Millisecond):
		// Sukses: tidak ada kick untuk exceptDeviceID
	}
}

// TestHub_CrossInstanceDeviceKick menguji bahwa pemanggilan KickClientByDeviceID pada Node A
// (yang sama sekali tidak memiliki koneksi lokal untuk user tersebut) berhasil mem-publish
// ke Redis Pub/Sub dan mematikan perangkat spesifik pada Node B.
func TestHub_CrossInstanceDeviceKick(t *testing.T) {
	clusterBroker := broker.NewInMemoryBroker()
	defer clusterBroker.Close()

	hubA := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hubA.SetBroker(clusterBroker)

	hubB := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hubB.SetBroker(clusterBroker)

	userID := "user-bob"

	// Bob memiliki 2 perangkat terhubung ke Node B
	devTabletB := &Client{
		ID:         userID,
		DeviceID:   "device-tablet",
		SessionKey: fmt.Sprintf("%s:device-tablet", userID),
		Nickname:   "Bob Tablet",
		JoinedAt:   time.Now().UTC().Add(-5 * time.Minute),
		send:       make(chan Message, 10),
		hub:        hubB,
	}
	devPhoneB := &Client{
		ID:         userID,
		DeviceID:   "device-phone",
		SessionKey: fmt.Sprintf("%s:device-phone", userID),
		Nickname:   "Bob Phone",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hubB,
	}
	hubB.Register(devTabletB)
	hubB.Register(devPhoneB)

	// Admin / user Bob melakukan remote logout untuk device-tablet melalui Node A
	// Perhatikan: Node A memiliki 0 koneksi lokal untuk Bob
	kickReason := "DEVICE_KICKED: Perangkat tablet dikeluarkan dari jarak jauh."
	hubA.KickClientByDeviceID(userID, "device-tablet", kickReason)

	// Verifikasi Tablet di Node B menerima sinyal kick
	select {
	case msg := <-devTabletB.send:
		if !strings.Contains(msg.Content, "DEVICE_KICKED") {
			t.Errorf("pesan kick tablet di Node B tidak sesuai: %+v", msg)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timeout menunggu kick tablet di Node B (cross-instance device kick gagal)")
	}

	// Verifikasi Phone di Node B tetap aktif dan TIDAK menerima sinyal kick
	select {
	case msg := <-devPhoneB.send:
		t.Fatalf("phone Bob tidak boleh di-kick, tapi menerima: %+v", msg)
	case <-time.After(200 * time.Millisecond):
		// Sukses: Phone tetap aman
	}
}

// TestHub_AntiEchoLoop_SessionKick memastikan node pengirim tidak memproses kembali
// event session kick yang dipublish oleh dirinya sendiri (Anti-Echo Loop).
func TestHub_AntiEchoLoop_SessionKick(t *testing.T) {
	clusterBroker := broker.NewInMemoryBroker()
	defer clusterBroker.Close()

	hubA := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hubA.SetBroker(clusterBroker)

	userID := "user-charlie"

	devA := &Client{
		ID:         userID,
		DeviceID:   "device-a",
		SessionKey: fmt.Sprintf("%s:device-a", userID),
		Nickname:   "Charlie",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hubA,
	}
	hubA.Register(devA)

	// Kick client lokal
	hubA.KickClientByUserID(userID, "", "SESSION_REPLACED: Logout")

	// devA harus menerima kick lokal tepat 1 kali
	select {
	case msg := <-devA.send:
		if !strings.Contains(msg.Content, "SESSION_REPLACED") {
			t.Errorf("pesan kick tidak sesuai: %+v", msg)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout menunggu kick lokal")
	}

	// Pastikan tidak ada pesan kick kedua yang diterima akibat echo dari Redis loop
	select {
	case msg := <-devA.send:
		t.Fatalf("menerima duplicate kick akibat echo loop Redis: %+v", msg)
	case <-time.After(300 * time.Millisecond):
		// Sukses: tidak ada duplicate kick
	}
}
