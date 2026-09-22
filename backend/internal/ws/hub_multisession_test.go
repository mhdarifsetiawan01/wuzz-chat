package ws

import (
	"fmt"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// TestHub_MultiSession_MaxTwoDevices menguji bahwa satu pengguna dapat memiliki 2 perangkat
// aktif bersamaan, dan perangkat ke-3 memicu FIFO Eviction pada perangkat tertua.
func TestHub_MultiSession_MaxTwoDevices(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	userID := "user-alice"

	// 1. Device 1 (Laptop) connect
	devLaptop := &Client{
		ID:         userID,
		DeviceID:   "device-laptop",
		SessionKey: fmt.Sprintf("%s:device-laptop", userID),
		Nickname:   "Alice (Laptop)",
		JoinedAt:   time.Now().UTC().Add(-2 * time.Minute),
		send:       make(chan Message, 10),
		hub:        hub,
	}
	hub.Register(devLaptop)

	if hub.count() != 1 {
		t.Fatalf("ekspektasi 1 client aktif, didapat: %d", hub.count())
	}

	// 2. Device 2 (Mobile) connect
	devMobile := &Client{
		ID:         userID,
		DeviceID:   "device-mobile",
		SessionKey: fmt.Sprintf("%s:device-mobile", userID),
		Nickname:   "Alice (Mobile)",
		JoinedAt:   time.Now().UTC().Add(-1 * time.Minute),
		send:       make(chan Message, 10),
		hub:        hub,
	}
	hub.Register(devMobile)

	// Keduanya harus aktif bersamaan (kuota 2 tercapai)
	if hub.count() != 2 {
		t.Fatalf("ekspektasi 2 client aktif bersamaan, didapat: %d", hub.count())
	}

	// Pastikan Device 1 belum menerima sinyal kick
	select {
	case msg := <-devLaptop.send:
		t.Fatalf("device laptop seharusnya tidak di-kick saat device ke-2 connect, menerima: %+v", msg)
	default:
	}

	// 3. Device 3 (Tablet) connect -> batas 2 terlampaui, Device 1 (tertua) harus di-kick
	devTablet := &Client{
		ID:         userID,
		DeviceID:   "device-tablet",
		SessionKey: fmt.Sprintf("%s:device-tablet", userID),
		Nickname:   "Alice (Tablet)",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hub,
	}
	hub.Register(devTablet)

	// Verifikasi Device 1 (Laptop) menerima pesan SESSION_REPLACED
	select {
	case msg := <-devLaptop.send:
		if msg.Type != TypeSystem || !contains(msg.Content, "SESSION_REPLACED") {
			t.Fatalf("pesan kick tidak sesuai: %+v", msg)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout menunggu pesan kick pada device laptop")
	}

	// Device 2 (Mobile) dan Device 3 (Tablet) harus tetap aktif
	select {
	case msg := <-devMobile.send:
		t.Fatalf("device mobile tidak boleh di-kick, menerima: %+v", msg)
	default:
	}
}

// TestHub_MultiSession_BroadcastFanout menguji bahwa pesan ke suatu room diterima oleh
// seluruh perangkat aktif anggota room, dan untuk sender, pesan diteruskan ke perangkat lain miliknya (self-sync).
func TestHub_MultiSession_BroadcastFanout(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	roomID := "room-proyek"

	// Alice memiliki 2 perangkat: Laptop & Mobile
	aliceLaptop := &Client{
		ID:         "user-alice",
		DeviceID:   "alice-laptop",
		SessionKey: "user-alice:alice-laptop",
		Nickname:   "Alice",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hub,
	}
	aliceMobile := &Client{
		ID:         "user-alice",
		DeviceID:   "alice-mobile",
		SessionKey: "user-alice:alice-mobile",
		Nickname:   "Alice",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hub,
	}

	// Bob memiliki 1 perangkat
	bobPhone := &Client{
		ID:         "user-bob",
		DeviceID:   "bob-phone",
		SessionKey: "user-bob:bob-phone",
		Nickname:   "Bob",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hub,
	}

	hub.Register(aliceLaptop)
	hub.Register(aliceMobile)
	hub.Register(bobPhone)

	hub.JoinRoom(aliceLaptop, roomID)
	hub.JoinRoom(aliceMobile, roomID)
	hub.JoinRoom(bobPhone, roomID)

	// Drain pesan room_users dari aktivitas JoinRoom
	drain := func(c chan Message) {
		for {
			select {
			case <-c:
			default:
				return
			}
		}
	}
	drain(aliceLaptop.send)
	drain(aliceMobile.send)
	drain(bobPhone.send)

	// Kasus A: Bob mengirim pesan ke room
	msgFromBob := Message{
		ID:        "msg-bob-1",
		Room:      roomID,
		From:      "user-bob",
		Nickname:  "Bob",
		Content:   "Halo Alice!",
		Timestamp: time.Now().UTC(),
	}
	hub.BroadcastRoom(roomID, msgFromBob, bobPhone.getSenderKey())

	// Verifikasi kedua perangkat Alice menerima pesan Bob
	select {
	case msg := <-aliceLaptop.send:
		if msg.ID != "msg-bob-1" {
			t.Errorf("laptop alice menerima pesan salah: %v", msg.ID)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout: alice laptop tidak menerima pesan dari bob")
	}

	select {
	case msg := <-aliceMobile.send:
		if msg.ID != "msg-bob-1" {
			t.Errorf("mobile alice menerima pesan salah: %v", msg.ID)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout: alice mobile tidak menerima pesan dari bob")
	}

	// Kasus B: Alice mengirim pesan dari Laptop -> Mobile Alice HARUS menerima (Self-Sync)
	msgFromAliceLaptop := Message{
		ID:        "msg-alice-1",
		Room:      roomID,
		From:      "user-alice",
		Nickname:  "Alice",
		Content:   "Hai Bob, saya balas dari laptop.",
		Timestamp: time.Now().UTC(),
	}
	hub.BroadcastRoom(roomID, msgFromAliceLaptop, aliceLaptop.getSenderKey())

	// 1. Bob harus menerima pesan
	select {
	case msg := <-bobPhone.send:
		if msg.ID != "msg-alice-1" {
			t.Errorf("bob menerima pesan salah: %v", msg.ID)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout: bob tidak menerima pesan dari alice")
	}

	// 2. Mobile Alice harus menerima pesan (self-sync)
	select {
	case msg := <-aliceMobile.send:
		if msg.ID != "msg-alice-1" {
			t.Errorf("mobile alice menerima pesan salah: %v", msg.ID)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout: mobile alice tidak menerima self-sync pesan dari laptop")
	}

	// 3. Laptop Alice TIDAK boleh menerima ulang pesan yang dia kirim sendiri
	select {
	case msg := <-aliceLaptop.send:
		t.Fatalf("laptop alice tidak boleh menerima ulang pesannya sendiri, menerima: %+v", msg)
	default:
	}
}

// TestHub_MultiSession_KickClientByDeviceID menguji remote logout spesifik hanya menendang perangkat target.
func TestHub_MultiSession_KickClientByDeviceID(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	userID := "user-alice"

	devLaptop := &Client{
		ID:         userID,
		DeviceID:   "device-laptop",
		SessionKey: fmt.Sprintf("%s:device-laptop", userID),
		Nickname:   "Alice",
		JoinedAt:   time.Now().UTC().Add(-2 * time.Minute),
		send:       make(chan Message, 10),
		hub:        hub,
	}
	devMobile := &Client{
		ID:         userID,
		DeviceID:   "device-mobile",
		SessionKey: fmt.Sprintf("%s:device-mobile", userID),
		Nickname:   "Alice",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 10),
		hub:        hub,
	}

	hub.Register(devLaptop)
	hub.Register(devMobile)

	// Remote logout hanya untuk device-laptop
	hub.KickClientByDeviceID(userID, "device-laptop", "DEVICE_KICKED: Perangkat dikeluarkan.")

	// Verifikasi Laptop menerima pesan kick
	select {
	case msg := <-devLaptop.send:
		if !contains(msg.Content, "DEVICE_KICKED") {
			t.Errorf("pesan kick laptop salah: %+v", msg)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout menunggu kick pada laptop")
	}

	// Verifikasi Mobile tetap aktif tanpa kick
	select {
	case msg := <-devMobile.send:
		t.Fatalf("mobile alice tidak boleh di-kick, menerima: %+v", msg)
	default:
	}
}

// TestHub_MultiSession_ConfigurableLimit menguji fleksibilitas batas maksimal perangkat aktif.
func TestHub_MultiSession_ConfigurableLimit(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)
	hub.SetMaxActiveDevices(4) // Konfigurasi ke 4 perangkat

	userID := "user-poweruser"

	for i := 1; i <= 4; i++ {
		dev := &Client{
			ID:         userID,
			DeviceID:   fmt.Sprintf("dev-%d", i),
			SessionKey: fmt.Sprintf("%s:dev-%d", userID, i),
			Nickname:   "PowerUser",
			JoinedAt:   time.Now().UTC().Add(time.Duration(i) * time.Minute),
			send:       make(chan Message, 10),
			hub:        hub,
		}
		hub.Register(dev)
	}

	if hub.count() != 4 {
		t.Fatalf("ekspektasi 4 perangkat aktif bersamaan, didapat: %d", hub.count())
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && (s[:len(substr)] == substr || containsAtAnyIndex(s, substr)))
}

func containsAtAnyIndex(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
