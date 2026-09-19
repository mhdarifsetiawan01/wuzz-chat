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

func TestChatHandler_PinConversation_Scenarios(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_pin_conv_handler.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_pin", "Alice Pin", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_pin", "Bob Pin", "password123")
	if err != nil {
		t.Fatalf("Failed to register Bob: %v", err)
	}
	userCharlie, err := userStore.Register("charlie_pin", "Charlie Pin", "password123")
	if err != nil {
		t.Fatalf("Failed to register Charlie: %v", err)
	}

	roomAliceBob, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conv AB: %v", err)
	}

	roomAliceCharlie, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userCharlie.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conv AC: %v", err)
	}

	// Buat pesan di room AC lebih baru daripada di room AB
	now := time.Now().UTC()
	_ = sqlStore.Save(store.StoredMessage{
		ID:        "msg-ab-1",
		RoomID:    roomAliceBob,
		FromID:    userBob.ID,
		Nickname:  userBob.DisplayName,
		ToID:      userAlice.ID,
		Content:   "Pesan lama dari Bob",
		Status:    "sent",
		Timestamp: now.Add(-1 * time.Hour),
	})

	_ = sqlStore.Save(store.StoredMessage{
		ID:        "msg-ac-1",
		RoomID:    roomAliceCharlie,
		FromID:    userCharlie.ID,
		Nickname:  userCharlie.DisplayName,
		ToID:      userAlice.ID,
		Content:   "Pesan baru dari Charlie",
		Status:    "sent",
		Timestamp: now,
	})

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	chatHandler := NewChatHandler(userStore, sqlStore)
	chatHandler.SetHub(hub)

	// Sebelum di-pin: Charlie harus nomor 1 karena pesannya lebih baru
	convsBefore, err := userStore.GetUserConversations(userAlice.ID)
	if err != nil {
		t.Fatalf("Failed to get convs: %v", err)
	}
	if len(convsBefore) != 2 || convsBefore[0].ID != roomAliceCharlie {
		t.Fatalf("Expected AC to be first before pin, got %v", convsBefore[0].ID)
	}

	// Skenario 1: Alice pin room AB (Bob)
	t.Run("Pin room AB sukses oleh Alice", func(t *testing.T) {
		payload := map[string]any{
			"conversation_id": roomAliceBob,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/conversations/pin", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.PinConversation(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success  bool   `json:"success"`
			IsPinned bool   `json:"is_pinned"`
			ConvID   string `json:"conversation_id"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if !resp.Success || !resp.IsPinned {
			t.Fatalf("Expected success and is_pinned true")
		}

		// Setelah di-pin: AB harus sekarang nomor 1 di sidebar Alice!
		convsAfter, err := userStore.GetUserConversations(userAlice.ID)
		if err != nil {
			t.Fatalf("Failed to get convs after pin: %v", err)
		}
		if len(convsAfter) != 2 || convsAfter[0].ID != roomAliceBob {
			t.Fatalf("Expected pinned room AB to be first, got %s", convsAfter[0].ID)
		}
		if !convsAfter[0].IsPinned {
			t.Errorf("Expected IsPinned to be true for room AB")
		}

		// Verifikasi bahwa pin Alice TIDAK mempengaruhi sidebar Bob (per-user preference)
		convsBob, err := userStore.GetUserConversations(userBob.ID)
		if err != nil {
			t.Fatalf("Failed to get convs for Bob: %v", err)
		}
		for _, cb := range convsBob {
			if cb.ID == roomAliceBob && cb.IsPinned {
				t.Errorf("Expected Bob's view of AB to NOT be pinned")
			}
		}
	})

	// Skenario 2: Alice unpin room AB
	t.Run("Unpin room AB sukses oleh Alice", func(t *testing.T) {
		payload := map[string]any{
			"conversation_id": roomAliceBob,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/conversations/unpin", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.UnpinConversation(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		// Setelah unpin: urutan kembali ke AC karena pesan AC lebih baru
		convsAfterUnpin, _ := userStore.GetUserConversations(userAlice.ID)
		if len(convsAfterUnpin) != 2 || convsAfterUnpin[0].ID != roomAliceCharlie {
			t.Fatalf("Expected AC to be first again after unpin, got %s", convsAfterUnpin[0].ID)
		}
		if convsAfterUnpin[1].IsPinned {
			t.Errorf("Expected AB to be unpinned")
		}
	})

	// Skenario 3: Penolakan pin jika bukan anggota
	t.Run("Tolak jika bukan anggota percakapan", func(t *testing.T) {
		// Dave mencoba pin room AB
		payload := map[string]any{
			"conversation_id": roomAliceBob,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/conversations/pin", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   "non-member-user-id",
			Username: "dave_imposter",
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.PinConversation(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 for non-member, got %d", w.Code)
		}
	})
}
