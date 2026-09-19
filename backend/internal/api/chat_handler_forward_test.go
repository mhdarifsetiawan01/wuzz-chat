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

func TestChatHandler_ForwardMessage_Scenarios(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_forward_handler.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_fwd", "Alice Forward", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_fwd", "Bob Forward", "password123")
	if err != nil {
		t.Fatalf("Failed to register Bob: %v", err)
	}
	userCharlie, err := userStore.Register("charlie_fwd", "Charlie Forward", "password123")
	if err != nil {
		t.Fatalf("Failed to register Charlie: %v", err)
	}
	userDave, err := userStore.Register("dave_fwd", "Dave Forward", "password123")
	if err != nil {
		t.Fatalf("Failed to register Dave: %v", err)
	}

	roomAliceBob, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conv AB: %v", err)
	}

	roomAliceCharlie, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userCharlie.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conv AC: %v", err)
	}

	roomAliceDave, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userDave.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conv AD: %v", err)
	}

	roomBobCharlie, err := userStore.GetOrCreateDirectConversation(userBob.ID, userCharlie.ID)
	if err != nil {
		t.Fatalf("Failed to create direct conv BC: %v", err)
	}

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	chatHandler := NewChatHandler(userStore, sqlStore)
	chatHandler.SetHub(hub)

	// Skenario 1: Forward berhasil ke 1 target room
	t.Run("Forward sukses ke 1 target room", func(t *testing.T) {
		origMsgID := "msg-fwd-test-1"
		err := sqlStore.Save(store.StoredMessage{
			ID:        origMsgID,
			RoomID:    roomAliceBob,
			FromID:    userBob.ID,
			Nickname:  userBob.DisplayName,
			ToID:      userAlice.ID,
			Content:   "Halo Alice, ini pesan rahasia",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save orig msg: %v", err)
		}

		// Alice meneruskan pesan Bob ke Charlie
		payload := map[string]any{
			"message_id":      origMsgID,
			"target_room_ids": []string{roomAliceCharlie},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success  bool                  `json:"success"`
			Messages []store.StoredMessage `json:"messages"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		if !resp.Success || len(resp.Messages) != 1 {
			t.Fatalf("Expected 1 forwarded message, got %d", len(resp.Messages))
		}

		fwdMsg := resp.Messages[0]
		if fwdMsg.RoomID != roomAliceCharlie {
			t.Errorf("Expected room %s, got %s", roomAliceCharlie, fwdMsg.RoomID)
		}
		if fwdMsg.FromID != userAlice.ID {
			t.Errorf("Expected sender Alice %s, got %s", userAlice.ID, fwdMsg.FromID)
		}
		if fwdMsg.Content != "Halo Alice, ini pesan rahasia" {
			t.Errorf("Expected content match, got %s", fwdMsg.Content)
		}
		if !fwdMsg.IsForwarded {
			t.Errorf("Expected is_forwarded=true, got false")
		}

		// Verifikasi di DB room target
		dbMsg, err := sqlStore.GetMessageByID(fwdMsg.ID)
		if err != nil {
			t.Fatalf("Failed to get forwarded msg from DB: %v", err)
		}
		if !dbMsg.IsForwarded {
			t.Errorf("Expected db is_forwarded=true")
		}
	})

	// Skenario 2: Forward berhasil ke multiple target rooms (Charlie & Dave)
	t.Run("Forward sukses ke 2 target rooms", func(t *testing.T) {
		origMsgID := "msg-fwd-test-2"
		err := sqlStore.Save(store.StoredMessage{
			ID:        origMsgID,
			RoomID:    roomAliceBob,
			FromID:    userBob.ID,
			Nickname:  userBob.DisplayName,
			ToID:      userAlice.ID,
			Content:   "Pengumuman penting bersama",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save orig msg: %v", err)
		}

		payload := map[string]any{
			"message_id":      origMsgID,
			"target_room_ids": []string{roomAliceCharlie, roomAliceDave},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success  bool                  `json:"success"`
			Messages []store.StoredMessage `json:"messages"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Messages) != 2 {
			t.Fatalf("Expected 2 forwarded messages, got %d", len(resp.Messages))
		}
	})

	// Skenario 3: Penolakan jika melebihi batas 5 target
	t.Run("Tolak jika lebih dari 5 target room", func(t *testing.T) {
		payload := map[string]any{
			"message_id":      "msg-fwd-test-1",
			"target_room_ids": []string{"room1", "room2", "room3", "room4", "room5", "room6"},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 for >5 targets, got %d", w.Code)
		}
	})

	// Skenario 4: Penolakan jika user bukan anggota target room (Alice bukan di roomBobCharlie)
	t.Run("Tolak jika bukan anggota target room", func(t *testing.T) {
		payload := map[string]any{
			"message_id":      "msg-fwd-test-1",
			"target_room_ids": []string{roomBobCharlie}, // Alice bukan member room ini
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("Expected status 403 Forbidden, got %d: %s", w.Code, w.Body.String())
		}
	})

	// Skenario 5: Penolakan jika pesan sumber tidak ada (404)
	t.Run("Tolak jika pesan sumber tidak ditemukan", func(t *testing.T) {
		payload := map[string]any{
			"message_id":      "msg-non-existent-999",
			"target_room_ids": []string{roomAliceCharlie},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("Expected status 404, got %d", w.Code)
		}
	})

	// Skenario 6: Penolakan jika pesan sumber telah dihapus
	t.Run("Tolak jika pesan sumber telah dihapus", func(t *testing.T) {
		delMsgID := "msg-deleted-fwd"
		err := sqlStore.Save(store.StoredMessage{
			ID:        delMsgID,
			RoomID:    roomAliceBob,
			FromID:    userBob.ID,
			Nickname:  userBob.DisplayName,
			ToID:      userAlice.ID,
			Content:   "Pesan yang akan dihapus",
			Status:    "sent",
			IsDeleted: true,
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save deleted msg: %v", err)
		}

		payload := map[string]any{
			"message_id":      delMsgID,
			"target_room_ids": []string{roomAliceCharlie},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 for deleted message, got %d: %s", w.Code, w.Body.String())
		}
	})

	// Skenario 7: Forward media message retains media metadata
	t.Run("Forward media message retains metadata", func(t *testing.T) {
		mediaMsgID := "msg-media-fwd"
		err := sqlStore.Save(store.StoredMessage{
			ID:          mediaMsgID,
			RoomID:      roomAliceBob,
			FromID:      userBob.ID,
			Nickname:    userBob.DisplayName,
			ToID:        userAlice.ID,
			Content:     "Lihat dokumen ini",
			Status:      "sent",
			MediaURL:    "/uploads/doc.pdf",
			MediaType:   "document",
			FileName:    "doc.pdf",
			FileSize:    10240,
			MediaStatus: "active",
			Timestamp:   time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save media msg: %v", err)
		}

		payload := map[string]any{
			"message_id":      mediaMsgID,
			"target_room_ids": []string{roomAliceCharlie},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success  bool                  `json:"success"`
			Messages []store.StoredMessage `json:"messages"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Messages) != 1 {
			t.Fatalf("Expected 1 forwarded message, got %d", len(resp.Messages))
		}

		fwd := resp.Messages[0]
		if fwd.MediaURL != "/uploads/doc.pdf" || fwd.MediaType != "document" || fwd.FileName != "doc.pdf" || fwd.FileSize != 10240 {
			t.Errorf("Media metadata mismatch on forwarded message: %+v", fwd)
		}
		if !fwd.IsForwarded {
			t.Errorf("Expected is_forwarded=true")
		}
	})

	// Skenario 7: Forward ke direct room dengan ID panjang > 64 karakter (Anti Value Too Long Regression)
	t.Run("Forward ke direct room dengan ID panjang > 64 karakter", func(t *testing.T) {
		longDMRoom := "dm_192ed821-7843-43e9-ba7f-7e84d0b5471a_5819a9c9-a13d-47f1-9dd1-ae3cb927a41c"
		// Daftarkan room panjang dan Alice sebagai member
		_, err := sqlStore.DB().Exec("INSERT INTO conversations (id, type, title, created_at, updated_at) VALUES (?, 'direct', '', ?, ?)", longDMRoom, time.Now().UTC(), time.Now().UTC())
		if err != nil {
			t.Fatalf("Failed to create long DM room: %v", err)
		}
		_, err = sqlStore.DB().Exec("INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", longDMRoom, userAlice.ID, time.Now().UTC())
		if err != nil {
			t.Fatalf("Failed to add Alice to long DM room: %v", err)
		}

		origMsgID := "msg-fwd-long-room"
		err = sqlStore.Save(store.StoredMessage{
			ID:        origMsgID,
			RoomID:    roomAliceCharlie,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      "",
			Content:   "Pesan untuk room panjang",
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("Failed to save orig msg: %v", err)
		}

		payload := map[string]any{
			"message_id":      origMsgID,
			"target_room_ids": []string{longDMRoom},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success  bool                  `json:"success"`
			Messages []store.StoredMessage `json:"messages"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Messages) != 1 {
			t.Fatalf("Expected 1 forwarded message, got %d", len(resp.Messages))
		}
		if resp.Messages[0].RoomID != longDMRoom {
			t.Errorf("Expected room %s, got %s", longDMRoom, resp.Messages[0].RoomID)
		}
	})

	// Regression test: Pastikan plaintext_content override digunakan saat forward pesan E2EE antar room berbeda.
	// Bug sebelumnya: backend menyalin ciphertext "e2ee:v1:..." dari room asal ke room tujuan,
	// sehingga penerima gagal mendekripsi (kunci AES berbeda per room) → tampil "🔒 [Pesan Terenkripsi]".
	t.Run("Forward dengan plaintext_content override menggantikan ciphertext E2EE", func(t *testing.T) {
		ciphertextContent := "e2ee:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=" // simulasi ciphertext
		plaintextOverride := "Halo Alice, ini pesan asli yang sudah di-decrypt!"

		origMsg := store.StoredMessage{
			ID:        "e2ee-fwd-regression-" + userAlice.ID,
			RoomID:    roomAliceBob,
			FromID:    userAlice.ID,
			Nickname:  userAlice.DisplayName,
			ToID:      "",
			Content:   ciphertextContent, // disimpan di DB sebagai ciphertext (room Alice↔Bob)
			Status:    "sent",
			Timestamp: time.Now().UTC(),
		}
		if err := sqlStore.Save(origMsg); err != nil {
			t.Fatalf("Failed to save E2EE orig msg: %v", err)
		}

		payload := map[string]any{
			"message_id":       origMsg.ID,
			"target_room_ids":  []string{roomAliceCharlie},
			"plaintext_content": plaintextOverride, // frontend mengirim plaintext hasil decrypt
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/messages/forward", bytes.NewReader(body))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.ForwardMessage(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success  bool                  `json:"success"`
			Messages []store.StoredMessage `json:"messages"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Messages) != 1 {
			t.Fatalf("Expected 1 forwarded message, got %d", len(resp.Messages))
		}

		fwd := resp.Messages[0]
		// Kunci assertion: content di room tujuan HARUS berisi plaintext, BUKAN ciphertext room asal
		if fwd.Content == ciphertextContent {
			t.Errorf("BUG: forwarded message menyalin ciphertext E2EE room asal! Content = %q", fwd.Content)
		}
		if fwd.Content != plaintextOverride {
			t.Errorf("Expected plaintext content %q, got %q", plaintextOverride, fwd.Content)
		}
		if fwd.RoomID != roomAliceCharlie {
			t.Errorf("Expected room %s, got %s", roomAliceCharlie, fwd.RoomID)
		}
	})
}
