package ws

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/gorilla/websocket"
)

func TestWebSocketJWTAuthentication(t *testing.T) {
	clientStore := store.NewMemoryClientStore()
	messageStore := store.NewMemoryMessageStore()
	hub := NewHub(clientStore, messageStore)
	handler := NewHandler(hub)

	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// 1. Uji koneksi tanpa token -> harus ditolak 401
	t.Run("Reject connection without token", func(t *testing.T) {
		_, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err == nil {
			t.Fatalf("seharusnya gagal dial tanpa token, tetapi berhasil")
		}
		if resp == nil || resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("ekspektasi status 401 Unauthorized, didapat: %v", resp)
		}
	})

	// 2. Uji koneksi dengan token tidak valid -> harus ditolak 401
	t.Run("Reject connection with invalid token", func(t *testing.T) {
		invalidURL := wsURL + "?token=invalid-jwt-token"
		_, resp, err := websocket.DefaultDialer.Dial(invalidURL, nil)
		if err == nil {
			t.Fatalf("seharusnya gagal dial dengan invalid token, tetapi berhasil")
		}
		if resp == nil || resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("ekspektasi status 401 Unauthorized, didapat: %v", resp)
		}
	})

	// 3. Uji koneksi dengan token valid via query param -> harus berhasil
	t.Run("Accept connection with valid token in query param", func(t *testing.T) {
		validToken, err := auth.GenerateToken("user-123", "alice", "Alice Wonderland")
		if err != nil {
			t.Fatalf("gagal generate token: %v", err)
		}

		validURL := wsURL + "?token=" + validToken
		conn, resp, err := websocket.DefaultDialer.Dial(validURL, nil)
		if err != nil {
			t.Fatalf("seharusnya berhasil dial dengan valid token: %v", err)
		}
		defer conn.Close()

		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("ekspektasi status 101 Switching Protocols, didapat: %d", resp.StatusCode)
		}
	})

	// 4. Uji koneksi dengan token valid via Authorization Header -> harus berhasil
	t.Run("Accept connection with valid token in Authorization header", func(t *testing.T) {
		validToken, err := auth.GenerateToken("user-456", "bob", "Bob Builder")
		if err != nil {
			t.Fatalf("gagal generate token: %v", err)
		}

		header := http.Header{}
		header.Set("Authorization", "Bearer "+validToken)

		conn, resp, err := websocket.DefaultDialer.Dial(wsURL, header)
		if err != nil {
			t.Fatalf("seharusnya berhasil dial dengan valid token header: %v", err)
		}
		defer conn.Close()

		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("ekspektasi status 101 Switching Protocols, didapat: %d", resp.StatusCode)
		}
	})

	// 5. Uji Anti-Spoofing: Klien tidak boleh bisa mengubah identitasnya via payload pesan
	t.Run("Prevent nickname and sender ID spoofing", func(t *testing.T) {
		validToken, err := auth.GenerateToken("user-789", "charlie", "Charlie Real")
		if err != nil {
			t.Fatalf("gagal generate token: %v", err)
		}

		conn, _, err := websocket.DefaultDialer.Dial(wsURL+"?token="+validToken, nil)
		if err != nil {
			t.Fatalf("gagal konek websocket: %v", err)
		}
		defer conn.Close()

		// Coba kirim event join dengan nickname palsu "Super Admin"
		spoofJoin := Message{
			Type:     TypeJoin,
			Room:     "room-test-spoof",
			Nickname: "Super Admin",
		}
		if err := conn.WriteJSON(spoofJoin); err != nil {
			t.Fatalf("gagal kirim pesan join: %v", err)
		}

		// Ambil client dari hub dan pastikan nickname tetap "Charlie Real" (bukan "Super Admin")
		var client *Client
		var exists bool
		for i := 0; i < 20; i++ {
			hub.mu.RLock()
			client, exists = hub.clients["user-789"]
			hub.mu.RUnlock()
			if exists {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}

		if !exists {
			t.Fatalf("client user-789 tidak terdaftar di hub")
		}
		if client.Nickname != "Charlie Real" {
			t.Fatalf("spoofing berhasil! ekspektasi 'Charlie Real', didapat: %s", client.Nickname)
		}
	})

	// 6. Uji BOLA / Room Authorization: Mallory tidak boleh bisa join ke room DM Alice-Bob
	t.Run("Reject unauthorized join to private conversation room", func(t *testing.T) {
		tmpDB := "test_ws_auth_room.db"
		os.Remove(tmpDB)
		defer os.Remove(tmpDB)

		sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
		if err != nil {
			t.Fatalf("failed to init db: %v", err)
		}
		defer sqlStore.Close()

		userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
		secureHub := NewHub(store.NewMemoryClientStore(), sqlStore)
		secureHub.SetUserStore(userStore)
		secureHandler := NewHandler(secureHub)

		secServer := httptest.NewServer(secureHandler)
		defer secServer.Close()

		userAlice, err := userStore.Register("alice_ws", "Alice WS", "pass")
		if err != nil {
			t.Fatalf("failed to register alice: %v", err)
		}
		userBob, err := userStore.Register("bob_ws", "Bob WS", "pass")
		if err != nil {
			t.Fatalf("failed to register bob: %v", err)
		}
		userMallory, err := userStore.Register("mallory_ws", "Mallory WS", "pass")
		if err != nil {
			t.Fatalf("failed to register mallory: %v", err)
		}

		dmRoom, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
		if err != nil {
			t.Fatalf("failed to create dmRoom: %v", err)
		}

		// Mallory mencoba connect dan join ke dmRoom
		malToken, _ := auth.GenerateToken(userMallory.ID, userMallory.Username, userMallory.DisplayName)
		malURL := "ws" + strings.TrimPrefix(secServer.URL, "http") + "?token=" + malToken

		malConn, _, err := websocket.DefaultDialer.Dial(malURL, nil)
		if err != nil {
			t.Fatalf("Mallory failed to connect: %v", err)
		}
		defer malConn.Close()

		// Mallory kirim event join ke room DM Alice-Bob
		_ = malConn.WriteJSON(Message{
			Type: TypeJoin,
			Room: dmRoom,
		})

		// Baca respon dari server -> harus menerima TypeSystem dengan pesan error akses ditolak
		var errMsg Message
		err = malConn.ReadJSON(&errMsg)
		if err != nil {
			t.Fatalf("failed to read ws message: %v", err)
		}

		if errMsg.Type != TypeSystem || !strings.Contains(errMsg.Content, "Akses ditolak") {
			t.Fatalf("expected error rejection message, got: %+v", errMsg)
		}

		// Pastikan Mallory TIDAK bergabung ke dmRoom di hub
		secureHub.mu.RLock()
		roomMembers := secureHub.rooms[dmRoom]
		_, inRoom := roomMembers[userMallory.ID]
		secureHub.mu.RUnlock()

		if inRoom {
			t.Fatalf("Mallory was illegally added to private room!")
		}
	})

	// 7. Uji Sanitasi Konten: Pesan kosong atau melebihi 5.000 karakter harus ditolak
	t.Run("Reject empty or oversized message content", func(t *testing.T) {
		validToken, err := auth.GenerateToken("user-limit-1", "dave", "Dave Limit")
		if err != nil {
			t.Fatalf("gagal generate token: %v", err)
		}

		conn, _, err := websocket.DefaultDialer.Dial(wsURL+"?token="+validToken, nil)
		if err != nil {
			t.Fatalf("gagal konek: %v", err)
		}
		defer conn.Close()

		_ = conn.WriteJSON(Message{
			Type: TypeJoin,
			Room: "room-limit-test",
		})

		// A. Kirim pesan hanya spasi kosong
		_ = conn.WriteJSON(Message{
			Type:    TypeMessage,
			Room:    "room-limit-test",
			Content: "   \n\t  ",
		})

		var errEmpty Message
		for {
			err := conn.ReadJSON(&errEmpty)
			if err != nil {
				t.Fatalf("failed to read ws error: %v", err)
			}
			if errEmpty.Type == TypeSystem {
				break
			}
		}
		if !strings.Contains(errEmpty.Content, "tidak boleh kosong") {
			t.Fatalf("expected empty content error, got: %+v", errEmpty)
		}

		// B. Kirim pesan melebihi 5.000 karakter
		oversizedContent := strings.Repeat("A", 5005)
		_ = conn.WriteJSON(Message{
			Type:    TypeMessage,
			Room:    "room-limit-test",
			Content: oversizedContent,
		})

		var errOversized Message
		for {
			err := conn.ReadJSON(&errOversized)
			if err != nil {
				t.Fatalf("failed to read ws error: %v", err)
			}
			if errOversized.Type == TypeSystem {
				break
			}
		}
		if !strings.Contains(errOversized.Content, "terlalu panjang") {
			t.Fatalf("expected oversized content error, got: %+v", errOversized)
		}
	})

	// 8. Uji Penolakan Call Signaling, Reaction, & Receipt dari Non-Anggota (BOLA Prevention)
	t.Run("Reject unauthorized call signaling, reaction, and receipt from non-members", func(t *testing.T) {
		tempDBPath := filepath.Join(t.TempDir(), "sec_events.db")
		msgStore, err := store.NewSQLMessageStore("sqlite", tempDBPath)
		if err != nil {
			t.Fatalf("failed to init sql message store: %v", err)
		}
		userStore := store.NewSQLUserStore(msgStore.DB(), msgStore.DriverName())
		secHub := NewHub(store.NewMemoryClientStore(), msgStore)
		secHub.SetUserStore(userStore)

		secServer := httptest.NewServer(NewHandler(secHub))
		defer secServer.Close()

		userAlice, _ := userStore.Register("alice_events", "Alice", "pass")
		userBob, _ := userStore.Register("bob_events", "Bob", "pass")
		userEve, _ := userStore.Register("eve_intruder", "Eve", "pass")

		dmRoom, _ := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)

		eveToken, _ := auth.GenerateToken(userEve.ID, userEve.Username, userEve.DisplayName)
		eveURL := "ws" + strings.TrimPrefix(secServer.URL, "http") + "?token=" + eveToken

		eveConn, _, err := websocket.DefaultDialer.Dial(eveURL, nil)
		if err != nil {
			t.Fatalf("Eve failed to connect: %v", err)
		}
		defer eveConn.Close()

		// A. Eve mencoba kirim call_offer ke dmRoom Alice-Bob
		_ = eveConn.WriteJSON(Message{
			Type: TypeCallOffer,
			Room: dmRoom,
			SDP:  "v=0\r\no=...",
		})

		var callErr Message
		if err := eveConn.ReadJSON(&callErr); err != nil {
			t.Fatalf("failed to read ws error for call_offer: %v", err)
		}
		if callErr.Type != TypeSystem || !strings.Contains(callErr.Content, "Akses ditolak") {
			t.Fatalf("expected call_offer rejection, got: %+v", callErr)
		}

		// B. Eve mencoba kirim reaction ke dmRoom Alice-Bob
		_ = eveConn.WriteJSON(Message{
			Type: TypeReaction,
			Room: dmRoom,
			Reaction: &ReactionPayload{
				MessageID: "msg-123",
				Emoji:     "❤️",
			},
		})

		var reactErr Message
		if err := eveConn.ReadJSON(&reactErr); err != nil {
			t.Fatalf("failed to read ws error for reaction: %v", err)
		}
		if reactErr.Type != TypeSystem || !strings.Contains(reactErr.Content, "Akses ditolak") {
			t.Fatalf("expected reaction rejection, got: %+v", reactErr)
		}

		// C. Eve mencoba kirim receipt ke dmRoom Alice-Bob
		_ = eveConn.WriteJSON(Message{
			Type:   TypeReceipt,
			Room:   dmRoom,
			Status: StatusRead,
		})

		var receiptErr Message
		if err := eveConn.ReadJSON(&receiptErr); err != nil {
			t.Fatalf("failed to read ws error for receipt: %v", err)
		}
		if receiptErr.Type != TypeSystem || !strings.Contains(receiptErr.Content, "Akses ditolak") {
			t.Fatalf("expected receipt rejection, got: %+v", receiptErr)
		}
	})
}

