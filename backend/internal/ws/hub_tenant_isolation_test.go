package ws

import (
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/broker"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// TestHub_LocalRoom_TenantIsolation menguji bahwa client dari dua tenant berbeda
// yang bergabung ke room dengan ID yang sama tidak saling menerima pesan chat (In-Memory Isolation).
func TestHub_LocalRoom_TenantIsolation(t *testing.T) {
	clientStore := store.NewMemoryClientStore()
	msgStore := store.NewMemoryMessageStore()
	hub := NewHub(clientStore, msgStore)

	// Client Alice dari Tenant Alpha
	aliceSend := make(chan Message, 10)
	alice := &Client{
		ID:          "user-alice",
		TenantID:    "tenant-alpha",
		Nickname:    "Alice Alpha",
		SessionKey:  "user-alice:dev-1",
		hub:         hub,
		send:        aliceSend,
	}
	hub.Register(alice)
	hub.JoinRoom(alice, "shared-lobby")

	// Client Charlie dari Tenant Alpha (teman satu tenant Alice)
	charlieSend := make(chan Message, 10)
	charlie := &Client{
		ID:          "user-charlie",
		TenantID:    "tenant-alpha",
		Nickname:    "Charlie Alpha",
		SessionKey:  "user-charlie:dev-1",
		hub:         hub,
		send:        charlieSend,
	}
	hub.Register(charlie)
	hub.JoinRoom(charlie, "shared-lobby")

	// Client Bob dari Tenant Beta (tenant berbeda, nama room identik)
	bobSend := make(chan Message, 10)
	bob := &Client{
		ID:          "user-bob",
		TenantID:    "tenant-beta",
		Nickname:    "Bob Beta",
		SessionKey:  "user-bob:dev-1",
		hub:         hub,
		send:        bobSend,
	}
	hub.Register(bob)
	hub.JoinRoom(bob, "shared-lobby")

	// Buat pesan dari Alice di tenant-alpha
	aliceMsg := Message{
		ID:        "msg-alpha-100",
		Type:      TypeMessage,
		From:      alice.ID,
		Nickname:  alice.Nickname,
		Room:      "shared-lobby",
		Content:   "Pesan rahasia internal Tenant Alpha",
		TenantID:  "tenant-alpha",
		Timestamp: time.Now().UTC(),
	}

	// Hub mem-broadcast pesan Alice ke "shared-lobby"
	hub.BroadcastRoom("shared-lobby", aliceMsg, alice.getSenderKey())

	// Verifikasi: Charlie (tenant-alpha) WAJIB menerima pesan Alice
	var charlieReceived Message
	charlieTimeout := time.After(1 * time.Second)
charlieLoop:
	for {
		select {
		case msg := <-charlieSend:
			if msg.Type == TypeMessage {
				charlieReceived = msg
				break charlieLoop
			}
		case <-charlieTimeout:
			t.Fatal("Timeout: Charlie (tenant-alpha) seharusnya menerima pesan Alice")
		}
	}

	if charlieReceived.ID != aliceMsg.ID {
		t.Fatalf("Charlie menerima ID yang salah: expected %s, got %s", aliceMsg.ID, charlieReceived.ID)
	}
	if charlieReceived.Content != aliceMsg.Content {
		t.Fatalf("Charlie menerima konten yang salah: expected %s, got %s", aliceMsg.Content, charlieReceived.Content)
	}

	// Verifikasi: Bob (tenant-beta) DILARANG menerima pesan Alice
	select {
	case leak := <-bobSend:
		if leak.Type == TypeMessage && leak.ID == aliceMsg.ID {
			t.Fatalf("CRITICAL SECURITY LEAK: Bob (tenant-beta) menerima pesan dari tenant-alpha: %+v", leak)
		}
	case <-time.After(200 * time.Millisecond):
		// Sukses: Bob tidak menerima pesan
	}
}

// TestHub_BroadcastRoomUsers_TenantIsolation menguji bahwa TypeRoomUsers
// dipartisi per tenant sehingga pengguna dari tenant A tidak melihat user tenant B.
func TestHub_BroadcastRoomUsers_TenantIsolation(t *testing.T) {
	clientStore := store.NewMemoryClientStore()
	msgStore := store.NewMemoryMessageStore()
	hub := NewHub(clientStore, msgStore)

	aliceSend := make(chan Message, 10)
	alice := &Client{
		ID:         "user-alice",
		TenantID:   "tenant-alpha",
		Nickname:   "Alice",
		SessionKey: "alice:dev",
		hub:        hub,
		send:       aliceSend,
	}
	hub.Register(alice)
	hub.JoinRoom(alice, "common-room")

	bobSend := make(chan Message, 10)
	bob := &Client{
		ID:         "user-bob",
		TenantID:   "tenant-beta",
		Nickname:   "Bob",
		SessionKey: "bob:dev",
		hub:        hub,
		send:       bobSend,
	}
	hub.Register(bob)
	hub.JoinRoom(bob, "common-room")

	// Drain pesan TypeRoomUsers yang dikirim otomatis saat JoinRoom
	drainRoomUsers := func(ch chan Message) []RoomUser {
		var lastUsers []RoomUser
		for {
			select {
			case msg := <-ch:
				if msg.Type == TypeRoomUsers {
					lastUsers = msg.Users
				}
			default:
				return lastUsers
			}
		}
	}

	// Panggil BroadcastRoomUsers secara eksplisit
	hub.BroadcastRoomUsers("common-room")

	time.Sleep(50 * time.Millisecond)

	aliceUsers := drainRoomUsers(aliceSend)
	bobUsers := drainRoomUsers(bobSend)

	// Alice hanya boleh melihat Alice
	if len(aliceUsers) != 1 || aliceUsers[0].ID != "user-alice" {
		t.Fatalf("Expected Alice to only see herself in tenant-alpha, got: %+v", aliceUsers)
	}

	// Bob hanya boleh melihat Bob
	if len(bobUsers) != 1 || bobUsers[0].ID != "user-bob" {
		t.Fatalf("Expected Bob to only see himself in tenant-beta, got: %+v", bobUsers)
	}
}

// TestHub_ClusterSync_TenantIsolation menguji bahwa event Redis Pub/Sub dari Node A
// tidak diteruskan ke client di Node B jika TenantID tidak cocok.
func TestHub_ClusterSync_TenantIsolation(t *testing.T) {
	clusterBroker := broker.NewInMemoryBroker()
	defer clusterBroker.Close()

	// Inisialisasi Node 1
	hub1 := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hub1.SetBroker(clusterBroker)

	// Inisialisasi Node 2
	hub2 := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hub2.SetBroker(clusterBroker)

	// Client Alice di Node 1 (Tenant Alpha)
	aliceSend := make(chan Message, 10)
	alice := &Client{
		ID:         "alice-node-1",
		TenantID:   "tenant-alpha",
		Nickname:   "Alice",
		SessionKey: "alice-node-1:dev",
		hub:        hub1,
		send:       aliceSend,
	}
	hub1.Register(alice)
	hub1.JoinRoom(alice, "cluster-global-room")

	// Client David di Node 2 (Tenant Alpha - sama dengan Alice)
	davidSend := make(chan Message, 10)
	david := &Client{
		ID:         "david-node-2",
		TenantID:   "tenant-alpha",
		Nickname:   "David",
		SessionKey: "david-node-2:dev",
		hub:        hub2,
		send:       davidSend,
	}
	hub2.Register(david)
	hub2.JoinRoom(david, "cluster-global-room")

	// Client Eve di Node 2 (Tenant Beta - berbeda dengan Alice)
	eveSend := make(chan Message, 10)
	eve := &Client{
		ID:         "eve-node-2",
		TenantID:   "tenant-beta",
		Nickname:   "Eve",
		SessionKey: "eve-node-2:dev",
		hub:        hub2,
		send:       eveSend,
	}
	hub2.Register(eve)
	hub2.JoinRoom(eve, "cluster-global-room")

	// Alice (Node 1) mem-broadcast pesan
	broadcastMsg := Message{
		ID:        "msg-cluster-101",
		Type:      TypeMessage,
		From:      alice.ID,
		Nickname:  alice.Nickname,
		Room:      "cluster-global-room",
		Content:   "Pesan lintas-node Tenant Alpha",
		TenantID:  "tenant-alpha",
		Timestamp: time.Now().UTC(),
	}

	var wg sync.WaitGroup
	wg.Add(1)

	var davidReceived Message
	go func() {
		defer wg.Done()
		timeout := time.After(2 * time.Second)
		for {
			select {
			case msg := <-davidSend:
				if msg.Type == TypeMessage {
					davidReceived = msg
					return
				}
			case <-timeout:
				t.Errorf("Timeout: David di Node 2 tidak menerima pesan cluster")
				return
			}
		}
	}()

	hub1.BroadcastRoom("cluster-global-room", broadcastMsg, alice.getSenderKey())

	wg.Wait()

	// David di Node 2 harus menerima pesan
	if davidReceived.ID != broadcastMsg.ID {
		t.Fatalf("David menerima ID %s, diharapkan %s", davidReceived.ID, broadcastMsg.ID)
	}

	// Eve di Node 2 (tenant-beta) TIDAK BOLEH menerima pesan
	select {
	case leakedMsg := <-eveSend:
		if leakedMsg.Type == TypeMessage && leakedMsg.ID == broadcastMsg.ID {
			t.Fatalf("CRITICAL SECURITY LEAK: Eve (tenant-beta di Node 2) menerima pesan cluster tenant-alpha: %+v", leakedMsg)
		}
	case <-time.After(200 * time.Millisecond):
		// Sukses: Tidak ada kebocoran
	}
}

// TestHub_DirectMessage_TenantIsolation menguji bahwa NotifyUser dan direct signaling
// terisolasi per tenant dan tidak dikirimkan ke client dengan tenant berbeda.
func TestHub_DirectMessage_TenantIsolation(t *testing.T) {
	clientStore := store.NewMemoryClientStore()
	msgStore := store.NewMemoryMessageStore()
	hub := NewHub(clientStore, msgStore)

	// Bob di tenant-beta
	bobSend := make(chan Message, 10)
	bob := &Client{
		ID:         "target-user-123",
		TenantID:   "tenant-beta",
		Nickname:   "Bob",
		SessionKey: "target-user-123:dev-b",
		hub:        hub,
		send:       bobSend,
	}
	hub.Register(bob)

	// Kirim NotifyUser yang dialamatkan ke "target-user-123", tetapi membawa TenantID: "tenant-alpha"
	alphaDirectMsg := Message{
		ID:        "direct-alpha-1",
		Type:      TypeCallOffer,
		From:      "caller-alpha",
		TenantID:  "tenant-alpha",
		Timestamp: time.Now().UTC(),
	}
	hub.NotifyUser("target-user-123", alphaDirectMsg)

	// Verifikasi: Bob (tenant-beta) tidak boleh menerima
	select {
	case msg := <-bobSend:
		t.Fatalf("CRITICAL LEAK: Bob (tenant-beta) menerima direct message tenant-alpha: %+v", msg)
	case <-time.After(150 * time.Millisecond):
		// Sukses
	}

	// Kirim pesan dengan TenantID: "tenant-beta" yang cocok
	betaDirectMsg := Message{
		ID:        "direct-beta-1",
		Type:      TypeCallOffer,
		From:      "caller-beta",
		TenantID:  "tenant-beta",
		Timestamp: time.Now().UTC(),
	}
	hub.NotifyUser("target-user-123", betaDirectMsg)

	// Verifikasi: Bob menerima pesan yang cocok
	select {
	case received := <-bobSend:
		if received.ID != "direct-beta-1" {
			t.Fatalf("Expected direct-beta-1, got %s", received.ID)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Timeout: Bob gagal menerima direct message tenant-beta yang valid")
	}
}

// TestHub_ClusterKick_TenantIsolation menguji bahwa remote session kick via Redis Pub/Sub
// hanya menendang koneksi yang memiliki TenantID yang cocok.
func TestHub_ClusterKick_TenantIsolation(t *testing.T) {
	clusterBroker := broker.NewInMemoryBroker()
	defer clusterBroker.Close()

	hub1 := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hub1.SetBroker(clusterBroker)

	hub2 := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hub2.SetBroker(clusterBroker)

	// Di Node 2: user "common-user" ada di tenant-alpha dan tenant-beta
	alphaSend := make(chan Message, 10)
	alphaClient := &Client{
		ID:         "common-user",
		TenantID:   "tenant-alpha",
		Nickname:   "Common Alpha",
		SessionKey: "common-user:dev-alpha",
		hub:        hub2,
		send:       alphaSend,
	}
	hub2.Register(alphaClient)

	betaSend := make(chan Message, 10)
	betaClient := &Client{
		ID:         "common-user",
		TenantID:   "tenant-beta",
		Nickname:   "Common Beta",
		SessionKey: "common-user:dev-beta",
		hub:        hub2,
		send:       betaSend,
	}
	hub2.Register(betaClient)

	// Node 1 menendang "common-user" khusus untuk tenant-alpha
	hub1.KickClientByUserIDWithTenant("common-user", "", "Kicked Alpha", "tenant-alpha")

	// alphaClient (tenant-alpha) harus menerima kick notification
	select {
	case kickMsg := <-alphaSend:
		if kickMsg.Type != TypeSystem || kickMsg.Content != "Kicked Alpha" {
			t.Fatalf("Alpha client menerima pesan kick yang tidak sesuai: %+v", kickMsg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Timeout: Alpha client seharusnya menerima kick message")
	}

	// betaClient (tenant-beta) TIDAK BOLEH ditendang
	select {
	case kickMsg := <-betaSend:
		t.Fatalf("CRITICAL FAULT: Beta client ikut tertendang oleh kick tenant-alpha: %+v", kickMsg)
	case <-time.After(200 * time.Millisecond):
		// Sukses: Beta client aman
	}
}
