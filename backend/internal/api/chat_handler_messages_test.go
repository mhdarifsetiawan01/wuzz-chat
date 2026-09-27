package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/messaging"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

func TestChatHandler_GetMessages(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_get_messages.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_getmsg", "Alice GetMsg", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_getmsg", "Bob GetMsg", "password123")
	if err != nil {
		t.Fatalf("Failed to register Bob: %v", err)
	}
	userEve, err := userStore.Register("eve_getmsg", "Eve GetMsg", "password123")
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

	// Seed 3 messages with distinct timestamps
	baseTime := time.Date(2026, 9, 27, 10, 0, 0, 0, time.UTC)
	for i := 1; i <= 3; i++ {
		msg := store.StoredMessage{
			ID:        "msg-seed-" + string(rune('0'+i)),
			RoomID:    roomID,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      userBob.ID,
			Content:   "Pesan " + string(rune('0'+i)),
			Status:    "sent",
			Timestamp: baseTime.Add(time.Duration(i) * time.Hour),
		}
		if err := sqlStore.Save(msg); err != nil {
			t.Fatalf("Failed to seed message %d: %v", i, err)
		}
	}

	t.Run("GetMessages_Success_All", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/messages?room_id="+roomID+"&limit=10", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		chatHandler.GetMessages(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var msgs []messaging.Message
		if err := json.Unmarshal(w.Body.Bytes(), &msgs); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if len(msgs) != 3 {
			t.Fatalf("Expected 3 messages, got %d", len(msgs))
		}
	})

	t.Run("GetMessages_Pagination_Before", func(t *testing.T) {
		// before timestamp of message 3 -> should return messages 1 and 2
		cursor := baseTime.Add(3 * time.Hour).Format(time.RFC3339)
		req := httptest.NewRequest(http.MethodGet, "/api/messages?room_id="+roomID+"&before="+cursor+"&limit=10", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userBob.ID,
			Username: userBob.Username,
		})
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		chatHandler.GetMessages(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var msgs []messaging.Message
		if err := json.Unmarshal(w.Body.Bytes(), &msgs); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if len(msgs) != 2 {
			t.Fatalf("Expected 2 messages before cursor, got %d", len(msgs))
		}
		if msgs[0].ID != "msg-seed-1" || msgs[1].ID != "msg-seed-2" {
			t.Fatalf("Expected msg-seed-1 and msg-seed-2, got %s and %s", msgs[0].ID, msgs[1].ID)
		}
	})

	t.Run("GetMessages_NonMember_Forbidden", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/messages?room_id="+roomID, nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userEve.ID,
			Username: userEve.Username,
		})
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		chatHandler.GetMessages(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("GetMessages_MissingRoomID_BadRequest", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/messages", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		chatHandler.GetMessages(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("GetMessages_Unauthorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/messages?room_id="+roomID, nil)

		w := httptest.NewRecorder()
		chatHandler.GetMessages(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized, got %d: %s", w.Code, w.Body.String())
		}
	})
}
