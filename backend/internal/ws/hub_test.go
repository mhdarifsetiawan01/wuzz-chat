package ws

import (
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestHubRegisterAndUnregister(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	c1 := &Client{
		ID:       "client-1",
		Nickname: "Alice",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}

	// Register
	hub.Register(c1)
	if count := hub.count(); count != 1 {
		t.Errorf("expected count 1, got %d", count)
	}

	got, ok := hub.GetClient("client-1")
	if !ok || got.Nickname != "Alice" {
		t.Errorf("expected client-1 to be found with nickname Alice")
	}

	// Unregister
	hub.Unregister(c1)
	if count := hub.count(); count != 0 {
		t.Errorf("expected count 0, got %d", count)
	}
}

func TestHubRoutingAndPairing(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	c1 := &Client{
		ID:       "client-1",
		Nickname: "Alice",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}
	c2 := &Client{
		ID:       "client-2",
		Nickname: "Bob",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}

	hub.Register(c1)
	hub.Register(c2)
	hub.SetPeer(c1.ID, c2.ID)

	if c1.PeerID != c2.ID || c2.PeerID != c1.ID {
		t.Errorf("expected peer IDs to be cross-linked")
	}

	// Route message from c1 to c2
	msg := Message{
		Type:      TypeMessage,
		From:      c1.ID,
		To:        c2.ID,
		Content:   "Halo Bob!",
		Timestamp: time.Now().UTC(),
	}

	hub.Route(msg)

	select {
	case received := <-c2.send:
		if received.Content != "Halo Bob!" {
			t.Errorf("expected 'Halo Bob!', got '%s'", received.Content)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timed out waiting for message to arrive at c2")
	}
}
