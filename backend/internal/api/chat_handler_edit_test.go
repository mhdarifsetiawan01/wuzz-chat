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

func TestChatHandler_EditMessage_Scenarios(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_edit_handler.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_edit", "Alice Edit", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_edit", "Bob Edit", "password123")
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

	// Skenario 1: Edit sukses oleh pengirim dalam 15 menit
	t.Run("Edit sukses oleh pengirim", func(t *testing.T) {
		msgID := "msg-edit-success-1"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan asli sebelum diedit",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save test message: %v", err)
		}

		payload := map[string]interface{}{
			"message_id":  msgID,
			"new_content": "Pesan sudah berhasil diedit!",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/messages/edit", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.EditMessage(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res map[string]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &res)
		if res["is_edited"] != true {
			t.Errorf("Expected is_edited true in response, got %v", res["is_edited"])
		}
		if res["new_content"] != "Pesan sudah berhasil diedit!" {
			t.Errorf("Expected new_content updated, got %v", res["new_content"])
		}

		// Verifikasi di DB
		msgInDB, err := sqlStore.GetMessageByID(msgID)
		if err != nil {
			t.Fatalf("Failed to get message from DB: %v", err)
		}
		if !msgInDB.IsEdited {
			t.Errorf("Expected msg.IsEdited to be true in DB")
		}
		if msgInDB.Content != "Pesan sudah berhasil diedit!" {
			t.Errorf("Expected msg.Content in DB to match, got %s", msgInDB.Content)
		}
		if msgInDB.EditedAt == nil {
			t.Errorf("Expected msg.EditedAt in DB to be non-nil")
		}
	})

	// Skenario 2: Bukan pengirim mencoba edit
	t.Run("Bukan pengirim dilarang edit", func(t *testing.T) {
		msgID := "msg-edit-not-sender"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan milik Alice",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save test message: %v", err)
		}

		payload := map[string]interface{}{
			"message_id":  msgID,
			"new_content": "Bob mencoba membajak pesan",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/messages/edit", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		// UserBob yang mengirim request
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userBob.ID,
			Username: userBob.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.EditMessage(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Skenario 3: Pesan tidak ditemukan
	t.Run("Pesan tidak ditemukan", func(t *testing.T) {
		payload := map[string]interface{}{
			"message_id":  "non-existent-msg-id",
			"new_content": "Pesan baru",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/messages/edit", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.EditMessage(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("Expected status 404 Not Found, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Skenario 4: Pesan sudah lewat 15 menit
	t.Run("Pesan lewat 15 menit dilarang edit", func(t *testing.T) {
		msgID := "msg-edit-expired"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan lama",
			Status:    "sent",
			Timestamp: time.Now().UTC().Add(-20 * time.Minute), // 20 menit lalu
		})
		if err != nil {
			t.Fatalf("Failed to save test message: %v", err)
		}

		payload := map[string]interface{}{
			"message_id":  msgID,
			"new_content": "Mencoba edit setelah 20 menit",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/messages/edit", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.EditMessage(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Skenario 5: Pesan media tidak dapat diedit
	t.Run("Pesan media dilarang edit", func(t *testing.T) {
		msgID := "msg-edit-media"
		err := sqlStore.Save(store.StoredMessage{
			ID:        msgID,
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Foto pemandangan",
			MediaURL:  "https://example.com/photo.jpg",
			MediaType: "image",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save test message: %v", err)
		}

		payload := map[string]interface{}{
			"message_id":  msgID,
			"new_content": "Mencoba edit pesan gambar",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/messages/edit", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.EditMessage(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}
