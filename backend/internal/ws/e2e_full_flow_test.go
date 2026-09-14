package ws_test

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
	"github.com/gorilla/websocket"
)

// TestE2E_FullChatAndSecurityLifecycle menguji alur End-to-End lengkap:
// 1. Registrasi & Login multi-user
// 2. Pembuatan direct conversation
// 3. Koneksi WebSocket & real-time chat
// 4. WebRTC call signaling antar anggota sah
// 5. Penolakan total terhadap upaya penyusupan (BOLA/IDOR) oleh non-anggota
func TestE2E_FullChatAndSecurityLifecycle(t *testing.T) {
	tempDB := filepath.Join(t.TempDir(), "wuzz_e2e.db")
	msgStore, err := store.NewSQLMessageStore("sqlite", tempDB)
	if err != nil {
		t.Fatalf("failed to create SQL store: %v", err)
	}
	userStore := store.NewSQLUserStore(msgStore.DB(), msgStore.DriverName())

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, msgStore)
	hub.SetUserStore(userStore)

	authHandler := api.NewAuthHandler(userStore)
	chatHandler := api.NewChatHandler(userStore, msgStore)
	chatHandler.SetHub(hub)
	wsHandler := ws.NewHandler(hub)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/register", authHandler.Register)
	mux.HandleFunc("/api/auth/login", authHandler.Login)
	mux.HandleFunc("/api/conversations", func(w http.ResponseWriter, r *http.Request) {
		auth.RequireJWT()(http.HandlerFunc(chatHandler.StartDirectChat)).ServeHTTP(w, r)
	})
	mux.Handle("/ws", wsHandler)

	server := httptest.NewServer(mux)
	defer server.Close()

	wsBaseURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	// -------------------------------------------------------------
	// 1. Register Alice, Bob, and Eve
	// -------------------------------------------------------------
	alice, err := userStore.Register("alice_e2e", "Alice E2E", "password123")
	if err != nil {
		t.Fatalf("failed to register Alice: %v", err)
	}
	bob, err := userStore.Register("bob_e2e", "Bob E2E", "password123")
	if err != nil {
		t.Fatalf("failed to register Bob: %v", err)
	}
	eve, err := userStore.Register("eve_attacker", "Eve Attacker", "password123")
	if err != nil {
		t.Fatalf("failed to register Eve: %v", err)
	}

	aliceToken, _ := auth.GenerateToken(alice.ID, alice.Username, alice.DisplayName)
	bobToken, _ := auth.GenerateToken(bob.ID, bob.Username, bob.DisplayName)
	eveToken, _ := auth.GenerateToken(eve.ID, eve.Username, eve.DisplayName)

	// -------------------------------------------------------------
	// 2. Alice creates a direct conversation with Bob
	// -------------------------------------------------------------
	dmRoomID, err := userStore.GetOrCreateDirectConversation(alice.ID, bob.ID)
	if err != nil {
		t.Fatalf("failed to create DM conversation: %v", err)
	}
	if dmRoomID == "" {
		t.Fatalf("expected valid dmRoomID, got empty")
	}

	// -------------------------------------------------------------
	// 3. Alice & Bob connect via WebSocket and join dmRoomID
	// -------------------------------------------------------------
	dialWS := func(token string) *websocket.Conn {
		conn, resp, err := websocket.DefaultDialer.Dial(wsBaseURL+"?token="+token, nil)
		if err != nil {
			t.Fatalf("failed to connect ws: %v (resp: %v)", err, resp)
		}
		return conn
	}

	aliceConn := dialWS(aliceToken)
	defer aliceConn.Close()

	bobConn := dialWS(bobToken)
	defer bobConn.Close()

	// Alice join
	_ = aliceConn.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: dmRoomID,
	})

	// Bob join
	_ = bobConn.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: dmRoomID,
	})

	// Helper untuk membaca stream pesan sampai menemukan tipe tertentu
	readUntilType := func(conn *websocket.Conn, targetType ws.MessageType, timeout time.Duration) (ws.Message, error) {
		deadline := time.Now().Add(timeout)
		for {
			_ = conn.SetReadDeadline(deadline)
			var m ws.Message
			if err := conn.ReadJSON(&m); err != nil {
				return ws.Message{}, err
			}
			if m.Type == targetType {
				return m, nil
			}
		}
	}

	// -------------------------------------------------------------
	// 4. Alice sends a chat message -> Bob receives it
	// -------------------------------------------------------------
	testMsgContent := "Halo Bob! Ini pesan rahasia kita."
	_ = aliceConn.WriteJSON(ws.Message{
		ID:      "msg-e2e-1",
		Type:    ws.TypeMessage,
		Room:    dmRoomID,
		Content: testMsgContent,
	})

	bobReceived, err := readUntilType(bobConn, ws.TypeMessage, 3*time.Second)
	if err != nil {
		t.Fatalf("Bob failed to receive Alice's message: %v", err)
	}
	if bobReceived.Content != testMsgContent {
		t.Fatalf("expected Bob to receive '%s', got '%s'", testMsgContent, bobReceived.Content)
	}

	// -------------------------------------------------------------
	// 5. Bob sends read receipt -> Alice receives it
	// -------------------------------------------------------------
	_ = bobConn.WriteJSON(ws.Message{
		ID:     "msg-e2e-1",
		Type:   ws.TypeReceipt,
		Room:   dmRoomID,
		Status: ws.StatusRead,
	})

	aliceReceipt, err := readUntilType(aliceConn, ws.TypeReceipt, 3*time.Second)
	if err != nil {
		t.Fatalf("Alice failed to receive read receipt: %v", err)
	}
	if aliceReceipt.Status != ws.StatusRead {
		t.Fatalf("expected read receipt status 'read', got: %s", aliceReceipt.Status)
	}

	// -------------------------------------------------------------
	// 6. Alice initiates WebRTC Audio Call -> Bob receives call_offer
	// -------------------------------------------------------------
	sampleSDPOffer := "v=0\r\no=alice 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 50000 RTP/SAVPF 111"
	_ = aliceConn.WriteJSON(ws.Message{
		Type: ws.TypeCallOffer,
		Room: dmRoomID,
		SDP:  sampleSDPOffer,
	})

	bobCallOffer, err := readUntilType(bobConn, ws.TypeCallOffer, 3*time.Second)
	if err != nil {
		t.Fatalf("Bob failed to receive call offer: %v", err)
	}
	if bobCallOffer.SDP != sampleSDPOffer {
		t.Fatalf("expected Bob to receive correct SDP offer, got: %s", bobCallOffer.SDP)
	}

	// -------------------------------------------------------------
	// 7. EVE (Unauthorized Attacker) tries to infiltrate dmRoomID
	// -------------------------------------------------------------
	eveConn := dialWS(eveToken)
	defer eveConn.Close()

	// A. Eve tries to JOIN Alice-Bob's private room
	_ = eveConn.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: dmRoomID,
	})

	var eveJoinErr ws.Message
	_ = eveConn.SetReadDeadline(time.Now().Add(1 * time.Second))
	if err := eveConn.ReadJSON(&eveJoinErr); err != nil {
		t.Fatalf("Eve should receive error response on unauthorized join: %v", err)
	}
	if eveJoinErr.Type != ws.TypeSystem || !strings.Contains(eveJoinErr.Content, "Akses ditolak") {
		t.Fatalf("expected Eve join to be rejected with 'Akses ditolak', got: %+v", eveJoinErr)
	}

	// B. Eve tries to send a MESSAGE to Alice-Bob's room
	_ = eveConn.WriteJSON(ws.Message{
		Type:    ws.TypeMessage,
		Room:    dmRoomID,
		Content: "Spam dari penyusup!",
	})

	var eveMsgErr ws.Message
	if err := eveConn.ReadJSON(&eveMsgErr); err != nil {
		t.Fatalf("Eve should receive error response on unauthorized message: %v", err)
	}
	if eveMsgErr.Type != ws.TypeSystem || !strings.Contains(eveMsgErr.Content, "Akses ditolak") {
		t.Fatalf("expected Eve message to be rejected, got: %+v", eveMsgErr)
	}

	// C. Eve tries to inject a CALL_OFFER to Alice-Bob's room
	_ = eveConn.WriteJSON(ws.Message{
		Type: ws.TypeCallOffer,
		Room: dmRoomID,
		SDP:  "fake-call-sdp",
	})

	var eveCallErr ws.Message
	if err := eveConn.ReadJSON(&eveCallErr); err != nil {
		t.Fatalf("Eve should receive error on unauthorized call offer: %v", err)
	}
	if eveCallErr.Type != ws.TypeSystem || !strings.Contains(eveCallErr.Content, "Akses ditolak") {
		t.Fatalf("expected Eve call offer to be rejected, got: %+v", eveCallErr)
	}

	// D. Eve tries to inject a REACTION to Alice-Bob's room
	_ = eveConn.WriteJSON(ws.Message{
		Type: ws.TypeReaction,
		Room: dmRoomID,
		Reaction: &ws.ReactionPayload{
			MessageID: "msg-e2e-1",
			Emoji:     "😈",
		},
	})

	var eveReactErr ws.Message
	if err := eveConn.ReadJSON(&eveReactErr); err != nil {
		t.Fatalf("Eve should receive error on unauthorized reaction: %v", err)
	}
	if eveReactErr.Type != ws.TypeSystem || !strings.Contains(eveReactErr.Content, "Akses ditolak") {
		t.Fatalf("expected Eve reaction to be rejected, got: %+v", eveReactErr)
	}

	// E. Eve tries to inject a READ RECEIPT to Alice-Bob's room
	_ = eveConn.WriteJSON(ws.Message{
		Type:   ws.TypeReceipt,
		Room:   dmRoomID,
		Status: ws.StatusRead,
	})

	var eveReceiptErr ws.Message
	if err := eveConn.ReadJSON(&eveReceiptErr); err != nil {
		t.Fatalf("Eve should receive error on unauthorized receipt: %v", err)
	}
	if eveReceiptErr.Type != ws.TypeSystem || !strings.Contains(eveReceiptErr.Content, "Akses ditolak") {
		t.Fatalf("expected Eve receipt to be rejected, got: %+v", eveReceiptErr)
	}

	// -------------------------------------------------------------
	// 8. Confirm Alice and Bob did NOT receive any of Eve's spam
	// -------------------------------------------------------------
	_ = aliceConn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	var unwantedMsg ws.Message
	if err := aliceConn.ReadJSON(&unwantedMsg); err == nil {
		if unwantedMsg.Content == "Spam dari penyusup!" || unwantedMsg.From == eve.ID {
			t.Fatalf("SECURITY BREACH: Alice received unauthorized message from Eve: %+v", unwantedMsg)
		}
	}

	t.Log("✅ E2E Full Lifecycle & Security Isolation Test PASSED successfully!")
}
