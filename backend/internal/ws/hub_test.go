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

	// c1 should receive ACK receipt 'delivered' (karena c2 aktif online di room yang sama)
	select {
	case ack := <-c1.send:
		if ack.Type != TypeReceipt || ack.ID != msgID || (ack.Status != StatusDelivered && ack.Status != StatusSent) {
			t.Errorf("expected ACK TypeReceipt with status 'delivered' or 'sent', got %+v", ack)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for ACK on c1")
	}

	// c2 should receive the chat message
	select {
	case received := <-c2.send:
		if received.ID != msgID || received.Content != "Halo Bob receipt test" {
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

func TestHubReplyAndReactions(t *testing.T) {
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
	hub.JoinRoom(c1, "room-features")
	hub.JoinRoom(c2, "room-features")

	// Drain join messages
	for len(c1.send) > 0 {
		<-c1.send
	}
	for len(c2.send) > 0 {
		<-c2.send
	}

	// 1. Test Reply Quote
	msgID := "msg-reply-1"
	c1.onMessage(Message{
		ID:      msgID,
		Type:    TypeMessage,
		Room:    "room-features",
		Content: "Ini balasan untuk Bob",
		ReplyTo: &ReplyTarget{
			ID:       "msg-parent-0",
			Nickname: "Bob",
			Content:  "Pesan Bob terdahulu",
		},
	})

	select {
	case received := <-c2.send:
		if received.ReplyTo == nil || received.ReplyTo.Content != "Pesan Bob terdahulu" {
			t.Errorf("expected ReplyTo content 'Pesan Bob terdahulu', got %+v", received.ReplyTo)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for reply message on c2")
	}

	// Drain c1 ACK
	for len(c1.send) > 0 {
		<-c1.send
	}

	// 2. Test Emoji Reaction Add
	c2.onReaction(Message{
		Room: "room-features",
		Reaction: &ReactionPayload{
			MessageID: msgID,
			Emoji:     "❤️",
		},
	})

	select {
	case reactionMsg := <-c1.send:
		if reactionMsg.Type != TypeReaction || len(reactionMsg.Reactions) != 1 || reactionMsg.Reactions[0].Emoji != "❤️" {
			t.Errorf("expected TypeReaction with ❤️ on c1, got %+v", reactionMsg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for reaction on c1")
	}

	// 3. Test Emoji Reaction Toggle (Remove)
	c2.onReaction(Message{
		Room: "room-features",
		Reaction: &ReactionPayload{
			MessageID: msgID,
			Emoji:     "❤️",
		},
	})

	select {
	case reactionMsg := <-c1.send:
		if reactionMsg.Type != TypeReaction || len(reactionMsg.Reactions) != 0 {
			t.Errorf("expected TypeReaction with 0 reactions on c1 after toggle, got %+v", reactionMsg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timeout waiting for reaction toggle on c1")
	}
}

func TestHubWebRTCCallingSignaling(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	c1 := &Client{
		ID:       "client-alice",
		Nickname: "Alice",
		RoomID:   "dm_alice_bob",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}
	c2 := &Client{
		ID:       "client-bob",
		Nickname: "Bob",
		RoomID:   "dm_alice_bob",
		JoinedAt: time.Now().UTC(),
		send:     make(chan Message, 10),
		hub:      hub,
	}

	hub.Register(c1)
	hub.Register(c2)
	hub.JoinRoom(c1, "dm_alice_bob")
	hub.JoinRoom(c2, "dm_alice_bob")

	// Drain initial presence events
	for len(c1.send) > 0 {
		<-c1.send
	}
	for len(c2.send) > 0 {
		<-c2.send
	}

	// 1. Alice sends call_offer to Bob
	c1.onCallSignaling(Message{
		Type: TypeCallOffer,
		Room: "dm_alice_bob",
		SDP:  "v=0\r\no=alice 1234 5678 IN IP4 0.0.0.0...",
	})

	select {
	case offerMsg := <-c2.send:
		if offerMsg.Type != TypeCallOffer || offerMsg.SDP == "" || offerMsg.From != "client-alice" {
			t.Errorf("expected TypeCallOffer from Alice on Bob's channel, got: %+v", offerMsg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timed out waiting for call_offer on Bob's channel")
	}

	// 2. Bob answers with call_answer to Alice
	c2.onCallSignaling(Message{
		Type: TypeCallAnswer,
		Room: "dm_alice_bob",
		SDP:  "v=0\r\no=bob 8765 4321 IN IP4 0.0.0.0...",
	})

	select {
	case answerMsg := <-c1.send:
		if answerMsg.Type != TypeCallAnswer || answerMsg.SDP == "" || answerMsg.From != "client-bob" {
			t.Errorf("expected TypeCallAnswer from Bob on Alice's channel, got: %+v", answerMsg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timed out waiting for call_answer on Alice's channel")
	}

	// 3. ICE Candidate exchange
	c1.onCallSignaling(Message{
		Type:      TypeIceCandidate,
		Room:      "dm_alice_bob",
		Candidate: `{"candidate":"candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host","sdpMid":"0","sdpMLineIndex":0}`,
	})

	select {
	case iceMsg := <-c2.send:
		if iceMsg.Type != TypeIceCandidate || iceMsg.Candidate == "" {
			t.Errorf("expected TypeIceCandidate on Bob's channel, got: %+v", iceMsg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timed out waiting for ice_candidate on Bob's channel")
	}

	// 4. End Call
	c2.onCallSignaling(Message{
		Type: TypeCallEnd,
		Room: "dm_alice_bob",
	})

	select {
	case endMsg := <-c1.send:
		if endMsg.Type != TypeCallEnd {
			t.Errorf("expected TypeCallEnd on Alice's channel, got: %+v", endMsg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("timed out waiting for call_end on Alice's channel")
	}

	// 5. Verify database store is not polluted by signaling payloads
	history, err := ms.GetRoomHistory("dm_alice_bob", 10)
	if err != nil {
		t.Fatalf("failed to check room history: %v", err)
	}
	if len(history) != 0 {
		t.Errorf("expected 0 history items for call signaling messages, got %d", len(history))
	}
}



