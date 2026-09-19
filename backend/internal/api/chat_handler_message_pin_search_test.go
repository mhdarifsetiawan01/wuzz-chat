package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

func TestChatHandler_PinMessage_And_Search_Scenarios(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_pin_search.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_msgpin", "Alice", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_msgpin", "Bob", "password123")
	if err != nil {
		t.Fatalf("Failed to register Bob: %v", err)
	}
	userStranger, err := userStore.Register("stranger_msgpin", "Stranger", "password123")
	if err != nil {
		t.Fatalf("Failed to register Stranger: %v", err)
	}

	roomID, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conv: %v", err)
	}

	// Buat 4 pesan di roomID
	now := time.Now().UTC()
	msgs := []store.StoredMessage{
		{
			ID:        "msg-1",
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan penting nomor 1: Pengumuman rapat",
			Timestamp: now.Add(-10 * time.Minute),
			Status:    "sent",
		},
		{
			ID:        "msg-2",
			RoomID:    roomID,
			FromID:    userBob.ID,
			Nickname:  userBob.DisplayName,
			ToID:      userAlice.ID,
			Content:   "Pesan nomor 2: Jangan lupa makan siang",
			Timestamp: now.Add(-8 * time.Minute),
			Status:    "sent",
		},
		{
			ID:        "msg-3",
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan penting nomor 3: Jadwal deploy besok",
			Timestamp: now.Add(-5 * time.Minute),
			Status:    "sent",
		},
		{
			ID:        "msg-4",
			RoomID:    roomID,
			FromID:    userBob.ID,
			Nickname:  userBob.DisplayName,
			ToID:      userAlice.ID,
			Content:   "Pesan penting nomor 4: Link staging terbaru",
			Timestamp: now.Add(-2 * time.Minute),
			Status:    "sent",
		},
	}

	for _, m := range msgs {
		if err := sqlStore.Save(m); err != nil {
			t.Fatalf("Failed to save msg %s: %v", m.ID, err)
		}
	}

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)
	chatHandler := NewChatHandler(userStore, sqlStore)
	chatHandler.SetHub(hub)

	tokenAlice, err := auth.GenerateToken(userAlice.ID, userAlice.Username, userAlice.DisplayName)
	if err != nil {
		t.Fatalf("Failed to generate token Alice: %v", err)
	}
	tokenStranger, err := auth.GenerateToken(userStranger.ID, userStranger.Username, userStranger.DisplayName)
	if err != nil {
		t.Fatalf("Failed to generate token Stranger: %v", err)
	}

	// 1. Test Stranger mencoba pin pesan di room Alice-Bob -> Harus 403 Forbidden
	t.Run("Stranger_PinMessage_Forbidden", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"conversation_id": roomID,
			"message_id":      "msg-1",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/messages/pin", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tokenStranger)
		w := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.PinMessage)).ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("Expected status 403, got %d", w.Code)
		}
	})

	// 2. Test Alice pin msg-1, msg-2, msg-3 -> Berhasil
	t.Run("Alice_PinThreeMessages", func(t *testing.T) {
		for _, msgID := range []string{"msg-1", "msg-2", "msg-3"} {
			body, _ := json.Marshal(map[string]any{
				"conversation_id": roomID,
				"message_id":      msgID,
				"duration_hours":  24,
			})
			req := httptest.NewRequest(http.MethodPost, "/api/messages/pin", bytes.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+tokenAlice)
			w := httptest.NewRecorder()

			auth.RequireJWT()(http.HandlerFunc(chatHandler.PinMessage)).ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Fatalf("Expected status 200 for pin %s, got %d: %s", msgID, w.Code, w.Body.String())
			}
		}

		// Cek daftar pinned messages
		reqGet := httptest.NewRequest(http.MethodGet, "/api/messages/pinned?room_id="+roomID, nil)
		reqGet.Header.Set("Authorization", "Bearer "+tokenAlice)
		wGet := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.GetPinnedMessages)).ServeHTTP(wGet, reqGet)
		if wGet.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d", wGet.Code)
		}

		var res struct {
			Success bool                  `json:"success"`
			Pinned  []store.PinnedMessage `json:"pinned"`
		}
		if err := json.NewDecoder(wGet.Body).Decode(&res); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}
		if len(res.Pinned) != 3 {
			t.Errorf("Expected 3 pinned messages, got %d", len(res.Pinned))
		}
	})

	// 3. Test Max 3 Enforced: Alice pin msg-4 -> msg-1 harus otomatis ter-unpin (FIFO)
	t.Run("PinFourthMessage_EnforcesMax3_FIFO", func(t *testing.T) {
		// Tunggu sejenak agar timestamp beda
		time.Sleep(10 * time.Millisecond)

		body, _ := json.Marshal(map[string]any{
			"conversation_id": roomID,
			"message_id":      "msg-4",
			"duration_hours":  0,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/messages/pin", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tokenAlice)
		w := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.PinMessage)).ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		// Ambil pinned lagi
		reqGet := httptest.NewRequest(http.MethodGet, "/api/messages/pinned?room_id="+roomID, nil)
		reqGet.Header.Set("Authorization", "Bearer "+tokenAlice)
		wGet := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.GetPinnedMessages)).ServeHTTP(wGet, reqGet)
		var res struct {
			Success bool                  `json:"success"`
			Pinned  []store.PinnedMessage `json:"pinned"`
		}
		_ = json.NewDecoder(wGet.Body).Decode(&res)

		if len(res.Pinned) != 3 {
			t.Errorf("Expected exactly 3 pinned messages, got %d", len(res.Pinned))
		}

		// Pastikan msg-1 sudah tidak ada (karena digantikan msg-4)
		for _, p := range res.Pinned {
			if p.MessageID == "msg-1" {
				t.Errorf("Expected msg-1 to have been unpinned by FIFO, but it is still pinned")
			}
		}
	})

	// 4. Test Unpin msg-2 -> tersisa 2 pinned
	t.Run("Alice_UnpinMessage", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"conversation_id": roomID,
			"message_id":      "msg-2",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/messages/unpin", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tokenAlice)
		w := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.UnpinMessage)).ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		reqGet := httptest.NewRequest(http.MethodGet, "/api/messages/pinned?room_id="+roomID, nil)
		reqGet.Header.Set("Authorization", "Bearer "+tokenAlice)
		wGet := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.GetPinnedMessages)).ServeHTTP(wGet, reqGet)
		var res struct {
			Success bool                  `json:"success"`
			Pinned  []store.PinnedMessage `json:"pinned"`
		}
		_ = json.NewDecoder(wGet.Body).Decode(&res)
		if len(res.Pinned) != 2 {
			t.Errorf("Expected 2 pinned messages after unpinning msg-2, got %d", len(res.Pinned))
		}
	})

	// 5. Test SearchMessages in Room
	t.Run("SearchMessages_QueryMatch", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/messages/search?room_id="+roomID+"&q=penting", nil)
		req.Header.Set("Authorization", "Bearer "+tokenAlice)
		w := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.SearchMessages)).ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var res struct {
			Success  bool                 `json:"success"`
			Messages []store.StoredMessage `json:"messages"`
			Count    int                  `json:"count"`
		}
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("Failed to decode search response: %v", err)
		}

		// msg-1, msg-3, msg-4 ada kata "penting"
		if res.Count < 3 {
			t.Errorf("Expected at least 3 matching messages for 'penting', got %d", res.Count)
		}
	})

	// 6. Security Test: Pin pesan yang sudah dihapus harus ditolak (400 Bad Request)
	t.Run("PinDeletedMessage_Rejected", func(t *testing.T) {
		// Tandai pesan msg-deleted sebagai terhapus
		_ = sqlStore.Save(store.StoredMessage{
			ID:        "msg-deleted-test",
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "🚫 Pesan ini telah dihapus",
			Timestamp: now,
			Status:    "sent",
			IsDeleted: true,
		})

		body, _ := json.Marshal(map[string]any{
			"conversation_id": roomID,
			"message_id":      "msg-deleted-test",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/messages/pin", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tokenAlice)
		w := httptest.NewRecorder()

		auth.RequireJWT()(http.HandlerFunc(chatHandler.PinMessage)).ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected status 400 when pinning deleted message, got %d", w.Code)
		}
	})

	// 7. Security Test: Hapus pesan untuk semua orang otomatis melepas sematan
	t.Run("DeleteMessageForEveryone_AutoUnpins", func(t *testing.T) {
		// Alice membuat pesan baru dan langsung menyematkannya
		newMsgID := "msg-to-delete-pin"
		_ = sqlStore.Save(store.StoredMessage{
			ID:        newMsgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan yang akan dihapus dari pin",
			Timestamp: time.Now().UTC(),
			Status:    "sent",
		})

		_, err := sqlStore.PinMessage(roomID, newMsgID, userAlice.ID, 0)
		if err != nil {
			t.Fatalf("Failed to pin message: %v", err)
		}

		// Alice menghapus pesan untuk semua orang
		_, err = sqlStore.DeleteMessage(newMsgID, userAlice.ID, true)
		if err != nil {
			t.Fatalf("Failed to delete message: %v", err)
		}

		// Pastikan pesan tidak lagi muncul di daftar pinned
		pins, err := sqlStore.GetPinnedMessages(roomID)
		if err != nil {
			t.Fatalf("Failed to get pinned messages: %v", err)
		}
		for _, p := range pins {
			if p.MessageID == newMsgID {
				t.Errorf("Expected message %s to be unpinned after delete for everyone, but it is still pinned", newMsgID)
			}
		}
	})
}
