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

func TestChatHandler_UpdateReceipt(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_receipt_handler.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_rcpt", "Alice Rcpt", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_rcpt", "Bob Rcpt", "password123")
	if err != nil {
		t.Fatalf("Failed to register Bob: %v", err)
	}
	userEve, err := userStore.Register("eve_rcpt", "Eve Rcpt", "password123")
	if err != nil {
		t.Fatalf("Failed to register Eve: %v", err)
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

	// Simpan pesan awal dari Alice ke Bob berstatus 'sent'
	msgID := "msg-receipt-test-1"
	err = sqlStore.Save(store.StoredMessage{
		ID:        msgID,
		RoomID:    roomID,
		FromID:    userAlice.ID,
		Nickname:  userAlice.DisplayName,
		ToID:      userBob.ID,
		Content:   "Halo Bob!",
		Status:    "sent",
		Timestamp: time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("Failed to save initial message: %v", err)
	}

	t.Run("Bob lapor status delivered via Background Receipt", func(t *testing.T) {
		payload := map[string]string{
			"message_id": msgID,
			"room_id":    roomID,
			"status":     "delivered",
		}
		bodyBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/receipt", bytes.NewReader(bodyBytes))

		// Set JWT context Bob
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userBob.ID,
			Username: userBob.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.UpdateReceipt(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		// Verifikasi status pesan di database sudah berubah menjadi 'delivered'
		msgInDB, err := sqlStore.GetMessageByID(msgID)
		if err != nil || msgInDB == nil {
			t.Fatalf("Failed to fetch message: %v", err)
		}
		if msgInDB.Status != "delivered" {
			t.Errorf("Expected status 'delivered', got '%s'", msgInDB.Status)
		}
	})

	t.Run("BOLA Protection: Eve mencoba update receipt di room Alice-Bob", func(t *testing.T) {
		payload := map[string]string{
			"message_id": msgID,
			"room_id":    roomID,
			"status":     "delivered",
		}
		bodyBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/receipt", bytes.NewReader(bodyBytes))

		// Set JWT context Eve (bukan anggota)
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userEve.ID,
			Username: userEve.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.UpdateReceipt(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("Expected status 403 Forbidden for Eve, got %d", rec.Code)
		}
	})

	t.Run("Anti-Downgrade: Delivered tidak boleh menimpa status read", func(t *testing.T) {
		// Ubah status pesan menjadi 'read'
		_ = sqlStore.UpdateMessageStatus(msgID, "read")

		// Coba kirim delivered lagi
		payload := map[string]string{
			"message_id": msgID,
			"room_id":    roomID,
			"status":     "delivered",
		}
		bodyBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/receipt", bytes.NewReader(bodyBytes))
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userBob.ID,
			Username: userBob.Username,
		}))

		rec := httptest.NewRecorder()
		chatHandler.UpdateReceipt(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d", rec.Code)
		}

		// Verifikasi status tetap 'read', TIDAK ter-downgrade ke 'delivered'
		msgInDB, _ := sqlStore.GetMessageByID(msgID)
		if msgInDB.Status != "read" {
			t.Errorf("Anti-downgrade violation! Status became '%s', expected 'read'", msgInDB.Status)
		}
	})
}
