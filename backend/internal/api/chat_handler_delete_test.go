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

func TestChatHandler_DeleteMessage_PayloadVariations(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_delete_handler.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_del", "Alice Delete", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_del", "Bob Delete", "password123")
	if err != nil {
		t.Fatalf("Failed to register Bob: %v", err)
	}

	roomID, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conversation: %v", err)
	}

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	chatHandler := NewChatHandler(userStore, sqlStore)
	chatHandler.SetHub(hub)

	// Skenario 1: Delete for Everyone menggunakan format { message_id: "...", type: "for_everyone" }
	// (Format yang dikirimkan oleh klien frontend)
	t.Run("Delete for Everyone via type=for_everyone", func(t *testing.T) {
		msgID := "msg-del-type-1"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan rahasia Alice",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save test message: %v", err)
		}

		payload := map[string]interface{}{
			"message_id": msgID,
			"type":       "for_everyone",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.DeleteMessage(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res map[string]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &res)
		if res["delete_for_everyone"] != true {
			t.Errorf("Expected delete_for_everyone to be true in response, got %v", res["delete_for_everyone"])
		}

		// Verifikasi di database: is_deleted harus TRUE dan content diganti
		msgInDB, err := sqlStore.GetMessageByID(msgID)
		if err != nil {
			t.Fatalf("Failed to get message from DB: %v", err)
		}
		if !msgInDB.IsDeleted {
			t.Errorf("Expected msg.IsDeleted to be true in DB, got false")
		}
		if msgInDB.Content != "🚫 Pesan ini telah dihapus" {
			t.Errorf("Expected content '🚫 Pesan ini telah dihapus', got '%s'", msgInDB.Content)
		}

		// Verifikasi penerima (Bob) juga melihat bahwa pesan dihapus
		bobHistory, err := sqlStore.GetRoomHistoryForUser(roomID, userBob.ID, 10)
		if err != nil {
			t.Fatalf("Failed to get Bob's history: %v", err)
		}
		var foundBobMsg *store.StoredMessage
		for i := range bobHistory {
			if bobHistory[i].ID == msgID {
				foundBobMsg = &bobHistory[i]
				break
			}
		}
		if foundBobMsg == nil {
			t.Fatalf("Bob should still see the deleted placeholder in history")
		}
		if foundBobMsg.Content != "🚫 Pesan ini telah dihapus" {
			t.Errorf("Expected Bob to see deleted placeholder, got '%s'", foundBobMsg.Content)
		}
	})

	// Skenario 2: Delete for Everyone menggunakan format { message_id: "...", delete_for_everyone: true }
	t.Run("Delete for Everyone via delete_for_everyone=true", func(t *testing.T) {
		msgID := "msg-del-bool-2"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan kedua Alice",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save test message: %v", err)
		}

		payload := map[string]interface{}{
			"message_id":          msgID,
			"delete_for_everyone": true,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.DeleteMessage(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		msgInDB, err := sqlStore.GetMessageByID(msgID)
		if err != nil {
			t.Fatalf("Failed to get message: %v", err)
		}
		if !msgInDB.IsDeleted || msgInDB.Content != "🚫 Pesan ini telah dihapus" {
			t.Errorf("Message was not marked deleted for everyone in DB")
		}
	})

	// Skenario 3: Delete for Me via { message_id: "...", type: "for_me" }
	t.Run("Delete for Me via type=for_me", func(t *testing.T) {
		msgID := "msg-del-forme-3"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userBob.ID,
			Nickname:  userBob.DisplayName,
			ToID:      userAlice.ID,
			Content:   "Pesan dari Bob untuk Alice",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save test message: %v", err)
		}

		// Alice ingin menghapus pesan ini HANYA untuk Alice
		payload := map[string]interface{}{
			"message_id": msgID,
			"type":       "for_me",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.DeleteMessage(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		// Pesan di database TIDAK ditandai is_deleted = true
		msgInDB, err := sqlStore.GetMessageByID(msgID)
		if err != nil {
			t.Fatalf("Failed to get message: %v", err)
		}
		if msgInDB.IsDeleted {
			t.Errorf("Delete for Me should NOT set is_deleted = true")
		}
		if msgInDB.Content != "Pesan dari Bob untuk Alice" {
			t.Errorf("Delete for Me should preserve original content in DB")
		}

		// Riwayat Alice: pesan TIDAK MUNCUL (hilang)
		aliceHistory, err := sqlStore.GetRoomHistoryForUser(roomID, userAlice.ID, 10)
		if err != nil {
			t.Fatalf("Failed to get Alice history: %v", err)
		}
		for _, m := range aliceHistory {
			if m.ID == msgID {
				t.Errorf("Alice should NOT see the message after Delete for Me")
			}
		}

		// Riwayat Bob: pesan TETAP MUNCUL utuh
		bobHistory, err := sqlStore.GetRoomHistoryForUser(roomID, userBob.ID, 10)
		if err != nil {
			t.Fatalf("Failed to get Bob history: %v", err)
		}
		foundBob := false
		for _, m := range bobHistory {
			if m.ID == msgID {
				foundBob = true
				if m.Content != "Pesan dari Bob untuk Alice" {
					t.Errorf("Bob should still see original message text")
				}
				break
			}
		}
		if !foundBob {
			t.Errorf("Bob should still see the message in his history")
		}
	})

	// Skenario 4: Delete for Everyone oleh NON-AUTHOR harus ditolak (400 Bad Request)
	t.Run("Delete for Everyone by non-author fails", func(t *testing.T) {
		msgID := "msg-del-unauth-4"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan Alice",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save message: %v", err)
		}

		// Bob mencoba delete for everyone pesan milik Alice
		payload := map[string]interface{}{
			"message_id": msgID,
			"type":       "for_everyone",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userBob.ID,
			Username: userBob.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.DeleteMessage(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected status 400 Bad Request for non-author delete for everyone, got %d", rec.Code)
		}
	})
}
