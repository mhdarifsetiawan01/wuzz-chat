package ws

import (
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Uji isolasi tenant khusus event `typing` (indikator "sedang mengetik").
// Event ini diteruskan ke semua anggota room, sehingga kebocoran lintas tenant akan memperlihatkan
// aktivitas pengguna tenant lain. Jalur yang diuji: Client.onTyping -> Hub.BroadcastRoom -> broadcastLocal.

// stubRoomAuth adalah RoomAuthorizationChecker tiruan: anggota ditentukan per room, tanpa database.
type stubRoomAuth struct {
	members map[string][]string // roomID -> daftar ID/username anggota
	denied  map[string]bool     // userID yang selalu ditolak (bukan anggota)
}

func (s *stubRoomAuth) GetConversationMemberUsernames(conversationID string) ([]string, error) {
	return s.members[conversationID], nil
}

func (s *stubRoomAuth) IsUserInConversation(conversationID, userID string) (bool, error) {
	return !s.denied[userID], nil
}

func (s *stubRoomAuth) IsConversationExpired(conversationID string) bool { return false }

func newTypingTestClient(hub *Hub, id, tenant, nickname string) *Client {
	return &Client{
		ID:         id,
		Username:   id,
		TenantID:   tenant,
		Nickname:   nickname,
		SessionKey: id + ":dev-1",
		JoinedAt:   time.Now().UTC(),
		send:       make(chan Message, 16),
		hub:        hub,
	}
}

// drainTyping mengosongkan channel dan mengembalikan semua pesan bertipe typing yang diterima.
func drainTyping(ch chan Message) []Message {
	var got []Message
	for {
		select {
		case m := <-ch:
			if m.Type == TypeTyping {
				got = append(got, m)
			}
		case <-time.After(150 * time.Millisecond):
			return got
		}
	}
}

// Dua tenant memakai ID room yang sama: typing dari tenant Alpha hanya sampai ke sesama Alpha.
func TestTyping_TenantIsolation_SameRoomID(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())

	alice := newTypingTestClient(hub, "user-alice", "tenant-alpha", "Alice Alpha")
	charlie := newTypingTestClient(hub, "user-charlie", "tenant-alpha", "Charlie Alpha")
	bob := newTypingTestClient(hub, "user-bob", "tenant-beta", "Bob Beta")
	for _, c := range []*Client{alice, charlie, bob} {
		hub.Register(c)
		hub.JoinRoom(c, "shared-lobby")
	}

	alice.onTyping(Message{Type: TypeTyping, Room: "shared-lobby"})

	got := drainTyping(charlie.send)
	if len(got) != 1 {
		t.Fatalf("Charlie (tenant-alpha) seharusnya menerima 1 event typing, dapat %d", len(got))
	}
	if got[0].Nickname != "Alice Alpha" || got[0].Room != "shared-lobby" || got[0].TenantID != "tenant-alpha" {
		t.Fatalf("event typing Charlie salah: %+v", got[0])
	}

	if leak := drainTyping(bob.send); len(leak) != 0 {
		t.Fatalf("CRITICAL SECURITY LEAK: Bob (tenant-beta) menerima typing dari tenant-alpha: %+v", leak)
	}
}

// Klien tidak boleh menentukan tenant lewat isi event: server menimpa dengan tenant dari koneksi (JWT).
func TestTyping_ForgedTenantIDIsOverwritten(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())

	alice := newTypingTestClient(hub, "user-alice", "tenant-alpha", "Alice Alpha")
	charlie := newTypingTestClient(hub, "user-charlie", "tenant-alpha", "Charlie Alpha")
	bob := newTypingTestClient(hub, "user-bob", "tenant-beta", "Bob Beta")
	for _, c := range []*Client{alice, charlie, bob} {
		hub.Register(c)
		hub.JoinRoom(c, "shared-lobby")
	}

	// Alice (tenant-alpha) memalsukan TenantID tenant-beta dan Nickname dalam payload
	alice.onTyping(Message{
		Type:     TypeTyping,
		Room:     "shared-lobby",
		TenantID: "tenant-beta",
		Nickname: "Pemalsu",
	})

	if leak := drainTyping(bob.send); len(leak) != 0 {
		t.Fatalf("CRITICAL: TenantID palsu dari klien diterima server, Bob (tenant-beta) menerima typing: %+v", leak)
	}
	got := drainTyping(charlie.send)
	if len(got) != 1 {
		t.Fatalf("Charlie (tenant-alpha) seharusnya tetap menerima 1 event typing, dapat %d", len(got))
	}
	if got[0].TenantID != "tenant-alpha" {
		t.Fatalf("TenantID event harus tenant dari koneksi (tenant-alpha), dapat %q", got[0].TenantID)
	}
	if got[0].Nickname != "Alice Alpha" {
		t.Fatalf("Nickname harus dari koneksi, bukan payload klien: dapat %q", got[0].Nickname)
	}
}

// Jalur kedua broadcastLocal: anggota percakapan yang tidak sedang membuka room (mis. di daftar chat)
// tetap diisolasi per tenant walau ID-nya tercantum dalam daftar anggota room.
func TestTyping_TenantIsolation_ConversationMemberPath(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hub.SetRoomAuth(&stubRoomAuth{
		members: map[string][]string{
			"grp_shared": {"user-alice", "user-charlie", "user-bob"},
		},
	})

	alice := newTypingTestClient(hub, "user-alice", "tenant-alpha", "Alice Alpha")
	charlie := newTypingTestClient(hub, "user-charlie", "tenant-alpha", "Charlie Alpha")
	bob := newTypingTestClient(hub, "user-bob", "tenant-beta", "Bob Beta")
	hub.Register(alice)
	hub.Register(charlie)
	hub.Register(bob)
	hub.JoinRoom(alice, "grp_shared") // hanya Alice yang membuka room

	alice.onTyping(Message{Type: TypeTyping, Room: "grp_shared"})

	if got := drainTyping(charlie.send); len(got) != 1 {
		t.Fatalf("Charlie (anggota sesama tenant, tidak membuka room) seharusnya menerima 1 event typing, dapat %d", len(got))
	}
	if leak := drainTyping(bob.send); len(leak) != 0 {
		t.Fatalf("CRITICAL SECURITY LEAK: Bob (tenant-beta) menerima typing lewat jalur anggota percakapan: %+v", leak)
	}
}

// Pengguna yang bukan anggota room tidak boleh memicu typing ke room itu (BOLA).
func TestTyping_NonMemberIsRejected(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	hub.SetRoomAuth(&stubRoomAuth{
		members: map[string][]string{"grp_private": {"user-charlie"}},
		denied:  map[string]bool{"user-mallory": true},
	})

	mallory := newTypingTestClient(hub, "user-mallory", "tenant-alpha", "Mallory")
	charlie := newTypingTestClient(hub, "user-charlie", "tenant-alpha", "Charlie Alpha")
	hub.Register(mallory)
	hub.Register(charlie)
	hub.JoinRoom(charlie, "grp_private")

	mallory.onTyping(Message{Type: TypeTyping, Room: "grp_private"})

	if leak := drainTyping(charlie.send); len(leak) != 0 {
		t.Fatalf("typing dari non-anggota seharusnya ditolak, Charlie menerima: %+v", leak)
	}
}

// Batas laju: maksimal 3 event typing per 2 detik per koneksi; kelebihannya diabaikan (anti-flood).
func TestTyping_RateLimitedPerConnection(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())

	alice := newTypingTestClient(hub, "user-alice", "tenant-alpha", "Alice Alpha")
	charlie := newTypingTestClient(hub, "user-charlie", "tenant-alpha", "Charlie Alpha")
	hub.Register(alice)
	hub.Register(charlie)
	hub.JoinRoom(alice, "room-rate")
	hub.JoinRoom(charlie, "room-rate")

	for i := 0; i < 10; i++ {
		alice.onTyping(Message{Type: TypeTyping, Room: "room-rate"})
	}

	if got := drainTyping(charlie.send); len(got) != 3 {
		t.Fatalf("dari 10 event beruntun hanya 3 yang boleh diteruskan, dapat %d", len(got))
	}
}
