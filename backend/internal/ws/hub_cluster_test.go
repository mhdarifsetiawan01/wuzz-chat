package ws

import (
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/broker"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestHub_ClusterSync(t *testing.T) {
	// Buat broker bersama (in-memory simulator)
	clusterBroker := broker.NewInMemoryBroker()
	defer clusterBroker.Close()

	// Inisialisasi 2 Hub terpisah (mensimulasikan Node A dan Node B)
	clientStoreA := store.NewMemoryClientStore()
	msgStoreA := store.NewMemoryMessageStore()
	hubA := NewHub(clientStoreA, msgStoreA)
	hubA.SetBroker(clusterBroker)

	clientStoreB := store.NewMemoryClientStore()
	msgStoreB := store.NewMemoryMessageStore()
	hubB := NewHub(clientStoreB, msgStoreB)
	hubB.SetBroker(clusterBroker)

	// Pastikan NodeID berbeda
	if hubA.NodeID() == hubB.NodeID() {
		t.Fatalf("Expected unique node IDs, got identical: %s", hubA.NodeID())
	}

	// Client 1 terhubung ke Node A di room "test-room"
	client1Send := make(chan Message, 10)
	client1 := &Client{
		ID:       "client-1",
		Nickname: "Alice",
		RoomID:   "test-room",
		hub:      hubA,
		send:     client1Send,
	}
	hubA.Register(client1)
	hubA.JoinRoom(client1, "test-room")

	// Client 2 terhubung ke Node B di room "test-room"
	client2Send := make(chan Message, 10)
	client2 := &Client{
		ID:       "client-2",
		Nickname: "Bob",
		RoomID:   "test-room",
		hub:      hubB,
		send:     client2Send,
	}
	hubB.Register(client2)
	hubB.JoinRoom(client2, "test-room")

	// Alice (Node A) mengirim pesan ke "test-room"
	testMsg := Message{
		ID:        "msg-123",
		Type:      TypeMessage,
		From:      client1.ID,
		Nickname:  client1.Nickname,
		Room:      "test-room",
		Content:   "Halo dari Node A ke Node B!",
		Timestamp: time.Now().UTC(),
	}

	var wg sync.WaitGroup
	wg.Add(1)

	var receivedOnNodeB Message
	go func() {
		defer wg.Done()
		timeout := time.After(2 * time.Second)
		for {
			select {
			case msg := <-client2Send:
				if msg.Type == TypeMessage {
					receivedOnNodeB = msg
					return
				}
			case <-timeout:
				t.Errorf("Timeout waiting for message on Node B")
				return
			}
		}
	}()

	// Broadcast dari Hub A
	hubA.BroadcastRoom("test-room", testMsg, client1.ID)

	wg.Wait()

	if receivedOnNodeB.ID != testMsg.ID {
		t.Errorf("Expected message ID %s on Node B, got %s", testMsg.ID, receivedOnNodeB.ID)
	}
	if receivedOnNodeB.Content != testMsg.Content {
		t.Errorf("Expected content '%s', got '%s'", testMsg.Content, receivedOnNodeB.Content)
	}
}
