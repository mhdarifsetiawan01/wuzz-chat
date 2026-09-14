package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/storage"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// TestE2E_Tahap2AndTahap3_FullFlow menguji secara end-to-end fungsionalitas HTTP REST API
// dan integritas database untuk:
// 1. Tahap 2: Proteksi IDOR Media ACK & File Deletion Lifecycle
// 2. Tahap 3: Optimasi Query Batched GetUserConversations (N+1 query resolution), Unread Count, Snippet Media, & Privacy Filter
func TestE2E_Tahap2AndTahap3_FullFlow(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_e2e_tahap2_tahap3.db")
	uploadDir := filepath.Join(tempDir, "uploads")
	_ = os.MkdirAll(uploadDir, 0755)

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL message store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	ls, err := storage.NewLocalStorage(uploadDir, "/uploads")
	if err != nil {
		t.Fatalf("Failed to init LocalStorage: %v", err)
	}

	chatHandler := NewChatHandler(userStore, sqlStore)
	mediaHandler := NewMediaHandler(ls, sqlStore)
	mediaHandler.SetUserStore(userStore)

	// 1. Setup 3 Users: Alice, Bob, Charlie, and Mallory (Attacker)
	userAlice, err := userStore.Register("alice_e2e", "Alice Display", "password123")
	if err != nil {
		t.Fatalf("Failed to create Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_e2e", "Bob Display", "password123")
	if err != nil {
		t.Fatalf("Failed to create Bob: %v", err)
	}
	userCharlie, err := userStore.Register("charlie_e2e", "Charlie Display", "password123")
	if err != nil {
		t.Fatalf("Failed to create Charlie: %v", err)
	}
	userMallory, err := userStore.Register("mallory_e2e", "Mallory Attacker", "password123")
	if err != nil {
		t.Fatalf("Failed to create Mallory: %v", err)
	}

	// Update public keys for peer key test
	_ = userStore.UpdatePublicKey(userBob.ID, "pubkey-bob-12345")
	_ = userStore.UpdatePublicKey(userCharlie.ID, "pubkey-charlie-67890")

	// 2. Setup Conversations:
	// - Room 1: Direct Chat Alice <-> Bob
	dmRoomAliceBob, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	if err != nil {
		t.Fatalf("Failed to create DM Alice-Bob: %v", err)
	}
	// - Room 2: Direct Chat Alice <-> Charlie
	dmRoomAliceCharlie, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userCharlie.ID)
	if err != nil {
		t.Fatalf("Failed to create DM Alice-Charlie: %v", err)
	}

	// =========================================================================
	// TEST TAHAP 2: MEDIA ACK IDOR PROTECTION & PHYSICAL DELETION
	// =========================================================================
	t.Run("Tahap 2: Media ACK IDOR Protection & File Deletion", func(t *testing.T) {
		// Simulasikan file fisik transit di uploadDir
		dummyFileName := "test_secret_photo.jpg"
		dummyFilePath := filepath.Join(uploadDir, dummyFileName)
		if err := os.WriteFile(dummyFilePath, []byte("RAW_IMAGE_DATA_12345"), 0644); err != nil {
			t.Fatalf("Failed to write dummy media file: %v", err)
		}

		mediaMsgID := "msg-media-tahap2-001"
		mediaMsg := store.StoredMessage{
			ID:          mediaMsgID,
			RoomID:      dmRoomAliceBob,
			FromID:      userAlice.ID,
			Nickname:    userAlice.DisplayName,
			ToID:        userBob.ID,
			Content:     "",
			MediaType:   "image",
			MediaURL:    "/uploads/" + dummyFileName,
			FileName:    dummyFileName,
			FileSize:    20,
			MediaStatus: "active",
			Status:      "sent",
			Timestamp:   time.Now().UTC(),
		}
		if err := sqlStore.Save(mediaMsg); err != nil {
			t.Fatalf("Failed to save media message: %v", err)
		}

		// Skenario 2A: Mallory (Attacker, bukan anggota room dmRoomAliceBob) mencoba ACK & hapus file
		ackReqBody, _ := json.Marshal(map[string]string{"message_id": mediaMsgID})
		reqMallory := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackReqBody))
		reqMallory = reqMallory.WithContext(auth.SetUserContext(reqMallory.Context(), &auth.UserClaims{
			UserID:   userMallory.ID,
			Username: userMallory.Username,
		}))
		recMallory := httptest.NewRecorder()
		mediaHandler.AcknowledgeDownload(recMallory, reqMallory)

		if recMallory.Code != http.StatusForbidden {
			t.Errorf("Expected HTTP 403 Forbidden for Mallory, got %d (body: %s)", recMallory.Code, recMallory.Body.String())
		}
		if _, err := os.Stat(dummyFilePath); os.IsNotExist(err) {
			t.Fatalf("VULNERABILITY: File was deleted by unauthorized user Mallory!")
		}

		// Skenario 2B: Bob (Recipient yang sah) melakukan ACK
		reqBob := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackReqBody))
		reqBob = reqBob.WithContext(auth.SetUserContext(reqBob.Context(), &auth.UserClaims{
			UserID:   userBob.ID,
			Username: userBob.Username,
		}))
		recBob := httptest.NewRecorder()
		mediaHandler.AcknowledgeDownload(recBob, reqBob)

		if recBob.Code != http.StatusOK {
			t.Errorf("Expected HTTP 200 OK for Bob ACK, got %d (body: %s)", recBob.Code, recBob.Body.String())
		}

		// Verifikasi file fisik telah terhapus dari storage setelah ACK sah
		if _, err := os.Stat(dummyFilePath); !os.IsNotExist(err) {
			t.Errorf("File should have been deleted after valid ACK, but still exists")
		}

		// Skenario 2C: Non-existent message ID -> 404
		ackInvalidBody, _ := json.Marshal(map[string]string{"message_id": "non-existent-msg-id"})
		reqInvalid := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackInvalidBody))
		reqInvalid = reqInvalid.WithContext(auth.SetUserContext(reqInvalid.Context(), &auth.UserClaims{
			UserID:   userBob.ID,
			Username: userBob.Username,
		}))
		recInvalid := httptest.NewRecorder()
		mediaHandler.AcknowledgeDownload(recInvalid, reqInvalid)

		if recInvalid.Code != http.StatusNotFound {
			t.Errorf("Expected HTTP 404 for invalid message ID, got %d", recInvalid.Code)
		}
	})

	// =========================================================================
	// TEST TAHAP 3: BATCHED CONVERSATIONS QUERY (N+1 SOLVED), UNREAD & PRIVACY
	// =========================================================================
	t.Run("Tahap 3: Batched GetUserConversations, Unread Counts, Snippets, & Privacy Filter", func(t *testing.T) {
		// Isi pesan di room Alice-Bob:
		// 1. Bob kirim pesan teks 1 (unread)
		// 2. Bob kirim pesan teks 2 (unread)
		// 3. Bob kirim foto (unread, latest)
		// 4. Alice kirim pesan (tidak boleh dihitung di unread Alice)
		now := time.Now().UTC()
		_ = sqlStore.Save(store.StoredMessage{
			ID: "msg-ab-1", RoomID: dmRoomAliceBob, FromID: userBob.ID, Nickname: userBob.DisplayName,
			ToID: userAlice.ID, Content: "Pesan Bob 1", Status: "sent", Timestamp: now.Add(-3 * time.Minute),
		})
		_ = sqlStore.Save(store.StoredMessage{
			ID: "msg-ab-2", RoomID: dmRoomAliceBob, FromID: userBob.ID, Nickname: userBob.DisplayName,
			ToID: userAlice.ID, Content: "Pesan Bob 2", Status: "sent", Timestamp: now.Add(-2 * time.Minute),
		})
		_ = sqlStore.Save(store.StoredMessage{
			ID: "msg-ab-3", RoomID: dmRoomAliceBob, FromID: userBob.ID, Nickname: userBob.DisplayName,
			ToID: userAlice.ID, Content: "", MediaType: "image", Status: "sent", Timestamp: now.Add(-1 * time.Minute),
		})

		// Isi pesan di room Alice-Charlie:
		_ = sqlStore.Save(store.StoredMessage{
			ID: "msg-ac-1", RoomID: dmRoomAliceCharlie, FromID: userCharlie.ID, Nickname: userCharlie.DisplayName,
			ToID: userAlice.ID, Content: "Halo dari Charlie", Status: "sent", Timestamp: now.Add(-5 * time.Minute),
		})

		// Skenario 3A: Panggil GET /api/conversations untuk Alice
		reqAlice := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
		reqAlice = reqAlice.WithContext(auth.SetUserContext(reqAlice.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))
		recAlice := httptest.NewRecorder()
		chatHandler.GetConversations(recAlice, reqAlice)

		if recAlice.Code != http.StatusOK {
			t.Fatalf("Expected HTTP 200 for Alice conversations, got %d", recAlice.Code)
		}

		var aliceConvs []store.ConversationItem
		if err := json.Unmarshal(recAlice.Body.Bytes(), &aliceConvs); err != nil {
			t.Fatalf("Failed to parse JSON response: %v", err)
		}

		if len(aliceConvs) != 2 {
			t.Fatalf("Expected 2 conversations for Alice, got %d", len(aliceConvs))
		}

		// Verifikasi urutan: Room Alice-Bob lebih baru (-1 menit) dibanding Alice-Charlie (-5 menit)
		if aliceConvs[0].ID != dmRoomAliceBob {
			t.Errorf("Expected first conversation to be Alice-Bob, got %s", aliceConvs[0].ID)
		}
		if aliceConvs[0].PeerNickname != "Bob Display" {
			t.Errorf("Expected PeerNickname 'Bob Display', got '%s'", aliceConvs[0].PeerNickname)
		}
		if aliceConvs[0].PeerPublicKey != "pubkey-bob-12345" {
			t.Errorf("Expected PeerPublicKey 'pubkey-bob-12345', got '%s'", aliceConvs[0].PeerPublicKey)
		}
		if aliceConvs[0].LastMessage != "📷 Foto" {
			t.Errorf("Expected snippet '📷 Foto', got '%s'", aliceConvs[0].LastMessage)
		}
		if aliceConvs[0].UnreadCount != 3 {
			t.Errorf("Expected 3 unread messages from Bob, got %d", aliceConvs[0].UnreadCount)
		}

		// Verifikasi Room Alice-Charlie
		if aliceConvs[1].ID != dmRoomAliceCharlie {
			t.Errorf("Expected second conversation to be Alice-Charlie, got %s", aliceConvs[1].ID)
		}
		if aliceConvs[1].LastMessage != "Halo dari Charlie" {
			t.Errorf("Expected snippet 'Halo dari Charlie', got '%s'", aliceConvs[1].LastMessage)
		}
		if aliceConvs[1].UnreadCount != 1 {
			t.Errorf("Expected 1 unread message from Charlie, got %d", aliceConvs[1].UnreadCount)
		}

		// Skenario 3B: Alice menghapus percakapan dengan Charlie (ClearConversation)
		time.Sleep(10 * time.Millisecond)
		if err := userStore.ClearConversation(dmRoomAliceCharlie, userAlice.ID); err != nil {
			t.Fatalf("Failed to clear conversation: %v", err)
		}

		// Verifikasi: GET /api/conversations untuk Alice sekarang hanya menampilkan 1 obrolan (Bob)
		recAliceAfterClear := httptest.NewRecorder()
		chatHandler.GetConversations(recAliceAfterClear, reqAlice)

		var aliceConvsAfterClear []store.ConversationItem
		_ = json.Unmarshal(recAliceAfterClear.Body.Bytes(), &aliceConvsAfterClear)
		if len(aliceConvsAfterClear) != 1 {
			t.Fatalf("Expected 1 conversation after clear, got %d", len(aliceConvsAfterClear))
		}
		if aliceConvsAfterClear[0].ID != dmRoomAliceBob {
			t.Errorf("Expected remaining conversation to be Alice-Bob, got %s", aliceConvsAfterClear[0].ID)
		}

		// Skenario 3C: Verifikasi Charlie masih melihat percakapannya dengan Alice (asymmetric privacy)
		reqCharlie := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
		reqCharlie = reqCharlie.WithContext(auth.SetUserContext(reqCharlie.Context(), &auth.UserClaims{
			UserID:   userCharlie.ID,
			Username: userCharlie.Username,
		}))
		recCharlie := httptest.NewRecorder()
		chatHandler.GetConversations(recCharlie, reqCharlie)

		var charlieConvs []store.ConversationItem
		_ = json.Unmarshal(recCharlie.Body.Bytes(), &charlieConvs)
		if len(charlieConvs) != 1 {
			t.Fatalf("Charlie should still see his conversation with Alice, got %d", len(charlieConvs))
		}

		// Skenario 3D: Charlie mengirim pesan baru ke Alice -> percakapan muncul kembali di sidebar Alice
		time.Sleep(10 * time.Millisecond)
		_ = sqlStore.Save(store.StoredMessage{
			ID: "msg-ac-new", RoomID: dmRoomAliceCharlie, FromID: userCharlie.ID, Nickname: userCharlie.DisplayName,
			ToID: userAlice.ID, Content: "Pesan baru setelah Alice clear", Status: "sent", Timestamp: time.Now().UTC(),
		})

		recAliceReappear := httptest.NewRecorder()
		chatHandler.GetConversations(recAliceReappear, reqAlice)

		var aliceConvsReappear []store.ConversationItem
		_ = json.Unmarshal(recAliceReappear.Body.Bytes(), &aliceConvsReappear)
		if len(aliceConvsReappear) != 2 {
			t.Fatalf("Expected conversation to reappear for Alice, got %d", len(aliceConvsReappear))
		}
		// Percakapan baru harus ada di urutan pertama (paling atas)
		if aliceConvsReappear[0].ID != dmRoomAliceCharlie {
			t.Errorf("Reappeared conversation should be at top (index 0), got ID %s", aliceConvsReappear[0].ID)
		}
		if aliceConvsReappear[0].LastMessage != "Pesan baru setelah Alice clear" {
			t.Errorf("Expected updated snippet 'Pesan baru setelah Alice clear', got '%s'", aliceConvsReappear[0].LastMessage)
		}
		if aliceConvsReappear[0].UnreadCount != 1 {
			t.Errorf("Expected unread count 1 for new message, got %d", aliceConvsReappear[0].UnreadCount)
		}
	})
}
