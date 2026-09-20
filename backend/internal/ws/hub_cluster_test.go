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

func TestHub_LiveRedisClusterSync(t *testing.T) {
	redisURL := "rediss://default:gQAAAAAAAdJlAAIgcDI1ZmNjN2QxMmRhZGI0YzY2YTExMjZjNjdkNTBiMDdhOA@exotic-walleye-119397.upstash.io:6379"

	brokerA, err := broker.NewRedisBroker(redisURL)
	if err != nil {
		t.Skipf("Skipping Live Redis test: %v", err)
	}
	defer brokerA.Close()

	brokerB, err := broker.NewRedisBroker(redisURL)
	if err != nil {
		t.Skipf("Skipping Live Redis test: %v", err)
	}
	defer brokerB.Close()

	hubA := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hubA.SetBroker(brokerA)

	hubB := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hubB.SetBroker(brokerB)

	// Berikan jeda waktu yang cukup agar koneksi TLS & Pub/Sub subscription di Upstash cloud aktif
	time.Sleep(1000 * time.Millisecond)

	client2Send := make(chan Message, 10)
	client2 := &Client{
		ID:       "client-remote-b",
		Nickname: "Bob Remote",
		RoomID:   "room-live-cluster",
		hub:      hubB,
		send:     client2Send,
	}
	hubB.Register(client2)
	hubB.JoinRoom(client2, "room-live-cluster")

	testMsg := Message{
		ID:        "msg-redis-live-999",
		Type:      TypeMessage,
		From:      "client-remote-a",
		Nickname:  "Alice Remote",
		Room:      "room-live-cluster",
		Content:   "Pesan live antar node via Upstash Redis!",
		Timestamp: time.Now().UTC(),
	}

	var wg sync.WaitGroup
	wg.Add(1)

	var received Message
	go func() {
		defer wg.Done()
		timeout := time.After(5 * time.Second)
		for {
			select {
			case msg := <-client2Send:
				if msg.Type == TypeMessage {
					received = msg
					return
				}
			case <-timeout:
				t.Errorf("Timeout waiting for message across live Redis cluster")
				return
			}
		}
	}()

	hubA.BroadcastRoom("room-live-cluster", testMsg, "client-remote-a")

	wg.Wait()

	if received.ID != testMsg.ID {
		t.Fatalf("Expected msg ID %s via Live Redis, got: %s", testMsg.ID, received.ID)
	}
	if received.Content != testMsg.Content {
		t.Fatalf("Expected content '%s', got: '%s'", testMsg.Content, received.Content)
	}
}

