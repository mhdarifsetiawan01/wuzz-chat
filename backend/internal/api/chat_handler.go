package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

type ChatHandler struct {
	userStore    store.UserStore
	messageStore store.MessageStore
	hub          *ws.Hub
}

func NewChatHandler(us store.UserStore, ms store.MessageStore) *ChatHandler {
	return &ChatHandler{
		userStore:    us,
		messageStore: ms,
	}
}

func (h *ChatHandler) SetHub(hub *ws.Hub) {
	h.hub = hub
}

// SearchUsers mencari user lain untuk diajak chat.
func (h *ChatHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]store.User{})
		return
	}

	users, err := h.userStore.SearchUsers(query, claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"Gagal mencari user"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(users)
}

// GetConversations mengembalikan daftar obrolan aktif milik user saat ini.
func (h *ChatHandler) GetConversations(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	conversations, err := h.userStore.GetUserConversations(claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"Gagal mengambil daftar percakapan"}`, http.StatusInternalServerError)
		return
	}

	if conversations == nil {
		conversations = []store.ConversationItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(conversations)
}

// StartDirectChat membuat atau membuka direct conversation dengan user lain.
func (h *ChatHandler) StartDirectChat(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		TargetUserID string `json:"target_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetUserID == "" {
		http.Error(w, `{"error":"target_user_id wajib diisi"}`, http.StatusBadRequest)
		return
	}

	roomID, err := h.userStore.GetOrCreateDirectConversation(claims.UserID, req.TargetUserID)
	if err != nil {
		http.Error(w, `{"error":"Gagal membuat direct conversation"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"room_id": roomID,
	})
}

// ClearConversation membersihkan percakapan untuk user saat ini (Delete for Me).
func (h *ChatHandler) ClearConversation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var conversationID string
	conversationID = strings.TrimSpace(r.URL.Query().Get("id"))
	if conversationID == "" {
		conversationID = strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	}
	if conversationID == "" && r.Body != nil {
		var req struct {
			ConversationID string `json:"conversation_id"`
			ID             string `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req.ConversationID != "" {
			conversationID = req.ConversationID
		} else if req.ID != "" {
			conversationID = req.ID
		}
	}

	if conversationID == "" {
		http.Error(w, `{"error":"parameter id atau conversation_id wajib diisi"}`, http.StatusBadRequest)
		return
	}

	// Validasi bahwa user memang anggota percakapan
	allowed, err := h.userStore.IsUserInConversation(conversationID, claims.UserID)
	if err != nil || !allowed {
		http.Error(w, `{"error":"Akses ditolak: Anda bukan anggota percakapan ini"}`, http.StatusForbidden)
		return
	}

	if err := h.userStore.ClearConversation(conversationID, claims.UserID); err != nil {
		http.Error(w, `{"error":"Gagal menghapus percakapan: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": "Percakapan berhasil dibersihkan untuk akun Anda",
		"id":      conversationID,
	})
}

// GetUserProfile mengambil profil publik user lain berdasarkan ID atau username.
func (h *ChatHandler) GetUserProfile(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	userID := strings.TrimSpace(r.URL.Query().Get("id"))
	username := strings.TrimSpace(r.URL.Query().Get("username"))

	var user *store.User
	var err error

	if userID != "" {
		user, err = h.userStore.GetUserByID(userID)
	} else if username != "" {
		cleanUsername := strings.TrimPrefix(username, "@")
		user, err = h.userStore.GetUserByUsername(cleanUsername)
		if err != nil {
			user, err = h.userStore.GetUserByUsernameOrDisplayName(cleanUsername)
		}
	} else {
		http.Error(w, `{"error":"parameter id atau username wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	if err != nil || user == nil {
		http.Error(w, `{"error":"User tidak ditemukan"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

// GetUserPublicKey mengembalikan public_key milik user (endpoint publik untuk E2EE Service Worker).
func (h *ChatHandler) GetUserPublicKey(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		id = strings.TrimSpace(r.URL.Query().Get("username"))
	}
	if id == "" {
		http.Error(w, `{"error":"id atau username wajib diisi"}`, http.StatusBadRequest)
		return
	}

	cleanID := strings.TrimPrefix(id, "@")
	user, err := h.userStore.GetUserByID(cleanID)
	if err != nil || user == nil {
		user, err = h.userStore.GetUserByUsername(cleanID)
		if err != nil || user == nil {
			user, err = h.userStore.GetUserByUsernameOrDisplayName(cleanID)
		}
	}

	if err != nil || user == nil {
		http.Error(w, `{"error":"User tidak ditemukan"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id":    user.ID,
		"public_key": user.PublicKey,
	})
}

// DeleteMessage menghapus pesan spesifik (Delete for Me atau Delete for Everyone).
func (h *ChatHandler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		MessageID         string `json:"message_id"`
		ID                string `json:"id"`
		Type              string `json:"type"`
		DeleteType        string `json:"delete_type"`
		DeleteForEveryone bool   `json:"delete_for_everyone"`
	}

	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	msgID := req.MessageID
	if msgID == "" {
		msgID = req.ID
	}
	if msgID == "" {
		msgID = strings.TrimSpace(r.URL.Query().Get("id"))
	}
	if msgID == "" {
		msgID = strings.TrimSpace(r.URL.Query().Get("message_id"))
	}
	if !req.DeleteForEveryone {
		delType := strings.ToLower(strings.TrimSpace(req.Type))
		if delType == "" {
			delType = strings.ToLower(strings.TrimSpace(req.DeleteType))
		}
		if delType == "" {
			delType = strings.ToLower(strings.TrimSpace(r.URL.Query().Get("type")))
		}
		if delType == "for_everyone" || delType == "delete_for_everyone" ||
			r.URL.Query().Get("for_everyone") == "true" || r.URL.Query().Get("delete_for_everyone") == "true" {
			req.DeleteForEveryone = true
		}
	}

	if msgID == "" {
		http.Error(w, `{"error":"message_id atau id wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	updatedMsg, err := h.messageStore.DeleteMessage(msgID, claims.UserID, req.DeleteForEveryone)
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "lebih dari 1 menit") || strings.Contains(errMsg, "hanya pengirim") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusBadRequest)
			return
		}
		if strings.Contains(errMsg, "tidak ditemukan") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"Gagal menghapus pesan: `+errMsg+`"}`, http.StatusInternalServerError)
		return
	}

	// Jika delete for everyone, broadcast real-time event ke seluruh client di room
	if req.DeleteForEveryone && h.hub != nil && updatedMsg != nil {
		h.hub.BroadcastRoom(updatedMsg.RoomID, ws.Message{
			ID:        updatedMsg.ID,
			Type:      ws.TypeMessageDeleted,
			Room:      updatedMsg.RoomID,
			Content:   "🚫 Pesan ini telah dihapus",
			IsDeleted: true,
			Timestamp: time.Now().UTC(),
		}, "")
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":             true,
		"message_id":          msgID,
		"delete_for_everyone": req.DeleteForEveryone,
		"message":             "Pesan berhasil dihapus",
	})
}

// EditMessage mengedit isi pesan dalam window 15 menit (hanya pengirim).
func (h *ChatHandler) EditMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		MessageID  string `json:"message_id"`
		ID         string `json:"id"`
		NewContent string `json:"new_content"`
		Content    string `json:"content"`
	}

	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	msgID := req.MessageID
	if msgID == "" {
		msgID = req.ID
	}
	if msgID == "" {
		msgID = strings.TrimSpace(r.URL.Query().Get("id"))
	}
	if msgID == "" {
		msgID = strings.TrimSpace(r.URL.Query().Get("message_id"))
	}

	newContent := strings.TrimSpace(req.NewContent)
	if newContent == "" {
		newContent = strings.TrimSpace(req.Content)
	}

	if msgID == "" {
		http.Error(w, `{"error":"message_id atau id wajib disertakan"}`, http.StatusBadRequest)
		return
	}
	if newContent == "" {
		http.Error(w, `{"error":"new_content atau content tidak boleh kosong"}`, http.StatusBadRequest)
		return
	}

	updatedMsg, err := h.messageStore.EditMessage(msgID, claims.UserID, newContent)
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "15 menit") || strings.Contains(errMsg, "hanya pengirim") || strings.Contains(errMsg, "tidak dapat diedit") || strings.Contains(errMsg, "tidak boleh kosong") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusBadRequest)
			return
		}
		if strings.Contains(errMsg, "tidak ditemukan") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"Gagal mengedit pesan: `+errMsg+`"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast real-time event TypeMessageEdited ke seluruh client di room
	if h.hub != nil && updatedMsg != nil {
		h.hub.BroadcastRoom(updatedMsg.RoomID, ws.Message{
			ID:         updatedMsg.ID,
			Type:       ws.TypeMessageEdited,
			Room:       updatedMsg.RoomID,
			From:       updatedMsg.FromID,
			Content:    updatedMsg.Content,
			NewContent: updatedMsg.Content,
			IsEdited:   true,
			EditedAt:   updatedMsg.EditedAt,
			Timestamp:  time.Now().UTC(),
		}, "")
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":     true,
		"message_id":  msgID,
		"new_content": updatedMsg.Content,
		"is_edited":   true,
		"edited_at":   updatedMsg.EditedAt,
		"message":     "Pesan berhasil diedit",
	})
}

// ForwardMessage meneruskan pesan ke 1 sampai 5 percakapan sekaligus.
func (h *ChatHandler) ForwardMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		MessageID        string   `json:"message_id"`
		ID               string   `json:"id"`
		TargetRoomIDs    []string `json:"target_room_ids"`
		PlaintextContent string   `json:"plaintext_content"` // plaintext override agar tidak copy ciphertext E2EE dari room asal
	}

	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	msgID := strings.TrimSpace(req.MessageID)
	if msgID == "" {
		msgID = strings.TrimSpace(req.ID)
	}

	if msgID == "" {
		http.Error(w, `{"error":"message_id wajib disertakan"}`, http.StatusBadRequest)
		return
	}
	if len(req.TargetRoomIDs) == 0 {
		http.Error(w, `{"error":"target_room_ids minimal 1 percakapan"}`, http.StatusBadRequest)
		return
	}
	if len(req.TargetRoomIDs) > 5 {
		http.Error(w, `{"error":"maksimal meneruskan pesan ke 5 percakapan sekaligus"}`, http.StatusBadRequest)
		return
	}

	// Validasi bahwa user merupakan anggota dari setiap percakapan target
	if h.userStore != nil {
		for _, roomID := range req.TargetRoomIDs {
			roomID = strings.TrimSpace(roomID)
			if roomID == "" {
				continue
			}
			isMember, err := h.userStore.IsUserInConversation(roomID, claims.UserID)
			if err != nil || !isMember {
				http.Error(w, `{"error":"Anda bukan anggota percakapan target `+roomID+`"}`, http.StatusForbidden)
				return
			}
		}
	}

	// Ambil username / display name pengirim
	senderNickname := claims.Username
	if h.userStore != nil {
		if u, err := h.userStore.GetUserByID(claims.UserID); err == nil && u != nil {
			if u.DisplayName != "" {
				senderNickname = u.DisplayName
			} else if u.Username != "" {
				senderNickname = u.Username
			}
		}
	}

	forwardedMsgs, err := h.messageStore.ForwardMessage(msgID, claims.UserID, senderNickname, req.TargetRoomIDs, req.PlaintextContent)
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "tidak ditemukan") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusNotFound)
			return
		}
		if strings.Contains(errMsg, "maksimal") || strings.Contains(errMsg, "tidak dapat meneruskan") || strings.Contains(errMsg, "tidak boleh kosong") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"Gagal meneruskan pesan: `+errMsg+`"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast setiap pesan terusan ke room tujuan via WebSocket Hub
	if h.hub != nil {
		for _, fm := range forwardedMsgs {
			wsMsg := ws.Message{
				ID:          fm.ID,
				Type:        ws.TypeMessage,
				From:        fm.FromID,
				Nickname:    fm.Nickname,
				Room:        fm.RoomID,
				Content:     fm.Content,
				Status:      ws.StatusSent,
				MediaURL:    fm.MediaURL,
				MediaType:   fm.MediaType,
				FileName:    fm.FileName,
				FileSize:    fm.FileSize,
				MediaStatus: fm.MediaStatus,
				IsForwarded: true,
				Timestamp:   fm.Timestamp,
			}
			h.hub.BroadcastRoom(fm.RoomID, wsMsg, claims.UserID)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"messages": forwardedMsgs,
		"message":  "Pesan berhasil diteruskan",
	})
}

// PinConversation menandai percakapan sebagai pinned untuk user aktif.
func (h *ChatHandler) PinConversation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		ConversationID string `json:"conversation_id"`
		ID             string `json:"id"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	convID := strings.TrimSpace(req.ConversationID)
	if convID == "" {
		convID = strings.TrimSpace(req.ID)
	}
	if convID == "" {
		convID = strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	}
	if convID == "" {
		convID = strings.TrimSpace(r.URL.Query().Get("id"))
	}

	if convID == "" {
		http.Error(w, `{"error":"conversation_id wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	if err := h.userStore.PinConversation(convID, claims.UserID); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":         true,
		"conversation_id": convID,
		"is_pinned":       true,
		"message":         "Percakapan berhasil disematkan",
	})
}

// UnpinConversation melepas status pinned percakapan untuk user aktif.
func (h *ChatHandler) UnpinConversation(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		ConversationID string `json:"conversation_id"`
		ID             string `json:"id"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	convID := strings.TrimSpace(req.ConversationID)
	if convID == "" {
		convID = strings.TrimSpace(req.ID)
	}
	if convID == "" {
		convID = strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	}
	if convID == "" {
		convID = strings.TrimSpace(r.URL.Query().Get("id"))
	}

	if convID == "" {
		http.Error(w, `{"error":"conversation_id wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	if err := h.userStore.UnpinConversation(convID, claims.UserID); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":         true,
		"conversation_id": convID,
		"is_pinned":       false,
		"message":         "Sematkan percakapan berhasil dilepas",
	})
}

// PinMessage menyematkan pesan dalam percakapan (maksimal 3 pesan per room).
func (h *ChatHandler) PinMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		ConversationID string `json:"conversation_id"`
		RoomID         string `json:"room_id"`
		MessageID      string `json:"message_id"`
		ID             string `json:"id"`
		DurationHours  int    `json:"duration_hours"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	convID := strings.TrimSpace(req.ConversationID)
	if convID == "" {
		convID = strings.TrimSpace(req.RoomID)
	}
	msgID := strings.TrimSpace(req.MessageID)
	if msgID == "" {
		msgID = strings.TrimSpace(req.ID)
	}

	if convID == "" || msgID == "" {
		http.Error(w, `{"error":"conversation_id dan message_id wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	// Validasi bahwa user adalah member room
	if h.userStore != nil {
		isMember, err := h.userStore.IsUserInConversation(convID, claims.UserID)
		if err != nil || !isMember {
			http.Error(w, `{"error":"Anda bukan anggota dari percakapan ini"}`, http.StatusForbidden)
			return
		}
	}

	pin, err := h.messageStore.PinMessage(convID, msgID, claims.UserID, req.DurationHours)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	// Broadcast WS event TypeMessagePinned ke room
	if h.hub != nil {
		h.hub.BroadcastRoom(convID, ws.Message{
			Type:      ws.TypeMessagePinned,
			Room:      convID,
			ID:        msgID,
			Pinned:    pin,
			Timestamp: time.Now().UTC(),
		}, "")
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"pinned":  pin,
		"message": "Pesan berhasil disematkan",
	})
}

// UnpinMessage melepas sematan pesan dalam percakapan.
func (h *ChatHandler) UnpinMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		ConversationID string `json:"conversation_id"`
		RoomID         string `json:"room_id"`
		MessageID      string `json:"message_id"`
		ID             string `json:"id"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	convID := strings.TrimSpace(req.ConversationID)
	if convID == "" {
		convID = strings.TrimSpace(req.RoomID)
	}
	if convID == "" {
		convID = strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	}
	if convID == "" {
		convID = strings.TrimSpace(r.URL.Query().Get("room_id"))
	}

	msgID := strings.TrimSpace(req.MessageID)
	if msgID == "" {
		msgID = strings.TrimSpace(req.ID)
	}
	if msgID == "" {
		msgID = strings.TrimSpace(r.URL.Query().Get("message_id"))
	}
	if msgID == "" {
		msgID = strings.TrimSpace(r.URL.Query().Get("id"))
	}

	if convID == "" || msgID == "" {
		http.Error(w, `{"error":"conversation_id dan message_id wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	// Validasi bahwa user adalah member room
	if h.userStore != nil {
		isMember, err := h.userStore.IsUserInConversation(convID, claims.UserID)
		if err != nil || !isMember {
			http.Error(w, `{"error":"Anda bukan anggota dari percakapan ini"}`, http.StatusForbidden)
			return
		}
	}

	if err := h.messageStore.UnpinMessage(convID, msgID); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	// Broadcast WS event TypeMessageUnpinned ke room
	if h.hub != nil {
		h.hub.BroadcastRoom(convID, ws.Message{
			Type:      ws.TypeMessageUnpinned,
			Room:      convID,
			ID:        msgID,
			Timestamp: time.Now().UTC(),
		}, "")
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": "Sematan pesan berhasil dilepas",
	})
}

// GetPinnedMessages mengambil daftar pesan tersemat dalam room.
func (h *ChatHandler) GetPinnedMessages(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	convID := strings.TrimSpace(r.URL.Query().Get("room_id"))
	if convID == "" {
		convID = strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	}
	if convID == "" {
		http.Error(w, `{"error":"room_id wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	// Validasi bahwa user adalah member room
	if h.userStore != nil {
		isMember, err := h.userStore.IsUserInConversation(convID, claims.UserID)
		if err != nil || !isMember {
			http.Error(w, `{"error":"Anda bukan anggota dari percakapan ini"}`, http.StatusForbidden)
			return
		}
	}

	pins, err := h.messageStore.GetPinnedMessages(convID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"pinned":  pins,
	})
}

// SearchMessages mencari riwayat pesan teks dalam ruang obrolan (Sub-8.3.E).
func (h *ChatHandler) SearchMessages(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomID := strings.TrimSpace(r.URL.Query().Get("room_id"))
	if roomID == "" {
		roomID = strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		query = strings.TrimSpace(r.URL.Query().Get("query"))
	}

	if roomID == "" {
		http.Error(w, `{"error":"room_id wajib disertakan"}`, http.StatusBadRequest)
		return
	}
	if query == "" {
		http.Error(w, `{"error":"query pencarian (q) wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	// Validasi bahwa user adalah member room
	if h.userStore != nil {
		isMember, err := h.userStore.IsUserInConversation(roomID, claims.UserID)
		if err != nil || !isMember {
			http.Error(w, `{"error":"Anda bukan anggota dari percakapan ini"}`, http.StatusForbidden)
			return
		}
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	results, err := h.messageStore.SearchMessages(roomID, claims.UserID, query, limit)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"messages": results,
		"count":    len(results),
	})
}



