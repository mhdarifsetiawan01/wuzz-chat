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

func TestHubTypingBroadcast(t *testing.T) {
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
	hub.JoinRoom(c1, "room-typing")
	hub.JoinRoom(c2, "room-typing")

	// Drain initial room_users
	select {
	case <-c2.send:
	default:
	}

	// c1 emits typing
	c1.onTyping(Message{
		Type: TypeTyping,
		Room: "room-typing",
	})

	select {
	case msg := <-c2.send:
		if msg.Type != TypeTyping {
			t.Errorf("expected TypeTyping, got %s", msg.Type)
		}
		if msg.Nickname != "Alice" {
			t.Errorf("expected Nickname 'Alice', got '%s'", msg.Nickname)
		}
		if msg.Room != "room-typing" {
			t.Errorf("expected Room 'room-typing', got '%s'", msg.Room)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for typing event on c2")
	}
}

func TestHubReceiptsFlow(t *testing.T) {
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
	hub.JoinRoom(c1, "room-receipts")
	hub.JoinRoom(c2, "room-receipts")

	// Drain initial join/room_users messages
	for len(c1.send) > 0 {
		<-c1.send
	}
	for len(c2.send) > 0 {
		<-c2.send
	}

	// 1. c1 sends message
	msgID := "msg-123"
	c1.onMessage(Message{
		ID:      msgID,
		Type:    TypeMessage,
		Room:    "room-receipts",
		Content: "Halo Bob receipt test",
	})

	// c1 should receive ACK receipt 'sent'
	select {
	case ack := <-c1.send:
		if ack.Type != TypeReceipt || ack.ID != msgID || ack.Status != StatusSent {
			t.Errorf("expected ACK TypeReceipt with status 'sent', got %+v", ack)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for ACK on c1")
	}

	// c2 should receive the chat message
	select {
	case received := <-c2.send:
		if received.ID != msgID || received.Content != "Halo Bob receipt test" || received.Status != StatusSent {
			t.Errorf("c2 received unexpected message: %+v", received)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for message on c2")
	}

	// 2. c2 emits delivered receipt
	c2.onReceipt(Message{
		ID:     msgID,
		Type:   TypeReceipt,
		Room:   "room-receipts",
		Status: StatusDelivered,
	})

	// c1 should receive delivered receipt
	select {
	case receipt := <-c1.send:
		if receipt.Type != TypeReceipt || receipt.ID != msgID || receipt.Status != StatusDelivered {
			t.Errorf("c1 expected delivered receipt, got %+v", receipt)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for delivered receipt on c1")
	}

	// 3. c2 emits read receipt
	c2.onReceipt(Message{
		ID:     msgID,
		Type:   TypeReceipt,
		Room:   "room-receipts",
		Status: StatusRead,
	})

	// c1 should receive read receipt
	select {
	case receipt := <-c1.send:
		if receipt.Type != TypeReceipt || receipt.ID != msgID || receipt.Status != StatusRead {
			t.Errorf("c1 expected read receipt, got %+v", receipt)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for read receipt on c1")
	}

	// Verify store status is updated to 'read'
	history, err := ms.GetRoomHistory("room-receipts", 10)
	if err != nil || len(history) == 0 {
		t.Fatalf("failed to query history: %v", err)
	}
	if history[0].Status != "read" {
		t.Errorf("expected store status 'read', got '%s'", history[0].Status)
	}
}


