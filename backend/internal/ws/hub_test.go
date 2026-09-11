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

	hub.Register(c1)
	if count := hub.count(); count != 1 {
		t.Errorf("expected count 1, got %d", count)
	}

	got, ok := hub.GetClient("client-1")
	if !ok || got.Nickname != "Alice" {
		t.Errorf("expected client-1 to be found with nickname Alice")
	}

	hub.Unregister(c1)
	if count := hub.count(); count != 0 {
		t.Errorf("expected count 0, got %d", count)
	}
}

func TestHubRoomBroadcastAndHistory(t *testing.T) {
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

	// Join both to same room "room-kopi"
	hub.JoinRoom(c1, "room-kopi")
	hub.JoinRoom(c2, "room-kopi")

	// Drain initial room_users messages received upon joining
	select {
	case <-c2.send: // room_users message when c2 joined
	default:
	}

	// Broadcast message from c1 to room
	msg := Message{
		Type:      TypeMessage,
		From:      c1.ID,
		Nickname:  c1.Nickname,
		Room:      "room-kopi",
		Content:   "Halo Bob di room kopi!",
		Timestamp: time.Now().UTC(),
	}

	hub.BroadcastRoom("room-kopi", msg, c1.ID)

	select {
	case received := <-c2.send:
		if received.Content != "Halo Bob di room kopi!" {
			t.Errorf("expected 'Halo Bob di room kopi!', got '%s'", received.Content)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timed out waiting for broadcast to arrive at c2")
	}

	// Verify history in store
	history, err := ms.GetRoomHistory("room-kopi", 10)
	if err != nil {
		t.Fatalf("failed to get history: %v", err)
	}
	if len(history) != 1 {
		t.Errorf("expected 1 history item, got %d", len(history))
	}
}

func TestHubRoomUsersBroadcast(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	c1 := &Client{
		ID:       "c1",
		Nickname: "Alice",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}
	c2 := &Client{
		ID:       "c2",
		Nickname: "Bob",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}

	hub.Register(c1)
	hub.Register(c2)

	// c1 joins
	hub.JoinRoom(c1, "room-presence")
	select {
	case msg := <-c1.send:
		if msg.Type != TypeRoomUsers || len(msg.Users) != 1 {
			t.Errorf("expected TypeRoomUsers with 1 user, got type=%s len=%d", msg.Type, len(msg.Users))
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for room_users on c1")
	}

	// c2 joins
	hub.JoinRoom(c2, "room-presence")
	select {
	case msg := <-c1.send:
		if msg.Type != TypeRoomUsers || len(msg.Users) != 2 {
			t.Errorf("expected c1 to receive TypeRoomUsers with 2 users, got %d", len(msg.Users))
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for room_users update on c1")
	}
}
