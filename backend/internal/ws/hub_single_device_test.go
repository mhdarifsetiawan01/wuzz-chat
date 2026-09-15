package ws

import (
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestHub_SingleActiveDeviceKick(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	userID := "user-alice-123"

	// Sesi 1 (Device 1)
	c1 := &Client{
		ID:       userID,
		Nickname: "Alice (Device 1)",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}
	hub.Register(c1)

	got, ok := hub.GetClient(userID)
	if !ok || got.Nickname != "Alice (Device 1)" {
		t.Fatalf("expected client 1 to be registered, got %v", got)
	}

	// Sesi 2 (Device 2) masuk dengan UserID yang sama
	c2 := &Client{
		ID:       userID,
		Nickname: "Alice (Device 2)",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}
	hub.Register(c2)

	// Verifikasi registry sekarang memegang Device 2
	got2, ok := hub.GetClient(userID)
	if !ok || got2.Nickname != "Alice (Device 2)" {
		t.Fatalf("expected client 2 to replace client 1 in registry, got %v", got2)
	}

	// Verifikasi client 1 menerima pesan SESSION_REPLACED di channel-nya
	select {
	case msg := <-c1.send:
		if msg.Type != TypeSystem || msg.Content != "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain." {
			t.Errorf("unexpected kick message: %+v", msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timed out waiting for kick message on client 1")
	}
}
