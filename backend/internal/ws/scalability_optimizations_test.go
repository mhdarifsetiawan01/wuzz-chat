package ws

import (
	"fmt"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/gorilla/websocket"
)

// TestHub_DirectMemberLookupO_M menguji efisiensi direct lookup O(M) dan cache keanggotaan pada broadcastLocal.
func TestHub_DirectMemberLookupO_M(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	// Registrasi 3 client
	c1 := &Client{ID: "user-1", Nickname: "Alice", send: make(chan Message, 10), hub: hub}
	c2 := &Client{ID: "user-2", Nickname: "Bob", send: make(chan Message, 10), hub: hub}
	c3 := &Client{ID: "user-3", Nickname: "Charlie", send: make(chan Message, 10), hub: hub}

	hub.Register(c1)
	hub.Register(c2)
	hub.Register(c3)

	roomID := "room-scalability"
	// c1 dan c2 adalah anggota room; c3 bukan anggota room
	hub.roomMembersMu.Lock()
	hub.roomMembersCache[roomID] = []string{"user-1", "user-2"}
	hub.roomMembersMu.Unlock()

	// c1 mengirim broadcast ke room
	msg := Message{
		ID:        "msg-test-om",
		Type:      TypeMessage,
		Room:      roomID,
		From:      "user-1",
		Content:   "Halo optimasi direct lookup!",
		Timestamp: time.Now().UTC(),
	}

	hub.broadcastLocal(roomID, msg, "user-1")

	// c2 (anggota room) harus menerima pesan
	select {
	case received := <-c2.send:
		if received.ID != "msg-test-om" {
			t.Errorf("Expected msg-test-om, got %s", received.ID)
		}
	case <-time.After(100 * time.Millisecond):
		t.Errorf("Client 2 (Bob) tidak menerima pesan!")
	}

	// c3 (bukan anggota room) TIDAK boleh menerima pesan
	select {
	case unexp := <-c3.send:
		t.Errorf("Client 3 (Charlie) tidak seharusnya menerima pesan: %v", unexp)
	default:
		// OK
	}

	// Uji InvalidateRoomMembersCache
	hub.InvalidateRoomMembersCache(roomID)
	hub.roomMembersMu.RLock()
	_, exists := hub.roomMembersCache[roomID]
	hub.roomMembersMu.RUnlock()
	if exists {
		t.Errorf("Cache keanggotaan room %s seharusnya telah terhapus setelah di-invalidate", roomID)
	}
}

// TestClient_TypingRateLimit menguji bahwa banjir event typing dibatasi maksimal 3 event per 2 detik.
func TestClient_TypingRateLimit(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	sender := &Client{ID: "sender-1", Nickname: "TypingUser", send: make(chan Message, 10), hub: hub}
	receiver := &Client{ID: "receiver-1", Nickname: "Listener", send: make(chan Message, 50), hub: hub}

	hub.Register(sender)
	hub.Register(receiver)

	roomID := "room-typing-rate"
	hub.JoinRoom(sender, roomID)
	hub.JoinRoom(receiver, roomID)

	// Flush event room_users
	drainChannel := func(ch chan Message) {
		for {
			select {
			case <-ch:
			default:
				return
			}
		}
	}
	drainChannel(receiver.send)

	// Kirim 10 event typing beruntun dalam hitungan milidetik
	for i := 0; i < 10; i++ {
		sender.onTyping(Message{
			Type: TypeTyping,
			Room: roomID,
		})
	}

	// Receiver hanya boleh menerima maksimal 3 event
	receivedCount := 0
	timeout := time.After(200 * time.Millisecond)
Loop:
	for {
		select {
		case m := <-receiver.send:
			if m.Type == TypeTyping {
				receivedCount++
			}
		case <-timeout:
			break Loop
		}
	}

	if receivedCount > 3 {
		t.Errorf("Rate limit gagal! Penerima menerima %d event typing (seharusnya <= 3)", receivedCount)
	} else if receivedCount == 0 {
		t.Errorf("Penerima tidak menerima event typing sama sekali!")
	} else {
		t.Logf("Rate limit sukses: dari 10 spam typing, hanya %d event yang diteruskan", receivedCount)
	}
}

// TestHub_DeltaHistorySince menguji pemuatan riwayat pesan delta berbasis checkpoint 'since'.
func TestHub_DeltaHistorySince(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	hub := NewHub(cs, ms)

	roomID := "room-delta-history"
	baseTime := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)

	// Simpan 3 pesan di message store dengan timestamp berbeda
	_ = ms.Save(store.StoredMessage{
		ID:        "msg-old-1",
		RoomID:    roomID,
		FromID:    "u1",
		Content:   "Pesan lama 1",
		Timestamp: baseTime.Add(-10 * time.Minute),
	})
	_ = ms.Save(store.StoredMessage{
		ID:        "msg-checkpoint",
		RoomID:    roomID,
		FromID:    "u1",
		Content:   "Pesan checkpoint",
		Timestamp: baseTime,
	})
	_ = ms.Save(store.StoredMessage{
		ID:        "msg-new-1",
		RoomID:    roomID,
		FromID:    "u2",
		Content:   "Pesan baru setelah checkpoint",
		Timestamp: baseTime.Add(5 * time.Minute),
	})

	client := &Client{ID: "client-sync", Nickname: "SyncTester", send: make(chan Message, 10), hub: hub}
	hub.Register(client)

	// 1. Uji tanpa checkpoint (default 50 pesan): harus mengembalikan semua 3 pesan
	hub.sendRoomHistory(client.ID, roomID)
	select {
	case historyMsg := <-client.send:
		if historyMsg.Type != TypeHistory {
			t.Fatalf("Expected TypeHistory, got %s", historyMsg.Type)
		}
		if len(historyMsg.Messages) != 3 {
			t.Errorf("Expected 3 messages, got %d", len(historyMsg.Messages))
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Timeout menunggu history")
	}

	// 2. Uji dengan checkpoint 'since' = baseTime (RFC3339): hanya boleh mengembalikan 1 pesan ('msg-new-1')
	sinceCheckpoint := baseTime.Format(time.RFC3339)
	hub.sendRoomHistory(client.ID, roomID, sinceCheckpoint)
	select {
	case historyMsg := <-client.send:
		if historyMsg.Type != TypeHistory {
			t.Fatalf("Expected TypeHistory, got %s", historyMsg.Type)
		}
		if len(historyMsg.Messages) != 1 {
			t.Fatalf("Expected 1 delta message since %s, got %d", sinceCheckpoint, len(historyMsg.Messages))
		}
		if historyMsg.Messages[0].ID != "msg-new-1" {
			t.Errorf("Expected delta message 'msg-new-1', got '%s'", historyMsg.Messages[0].ID)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Timeout menunggu delta history")
	}
}

// Suppress unused imports
var _ = fmt.Sprintf
var _ = websocket.CloseMessage
