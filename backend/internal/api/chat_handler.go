package api

import (
	"encoding/json"
	"net/http"
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
	if !req.DeleteForEveryone && (r.URL.Query().Get("for_everyone") == "true" || r.URL.Query().Get("delete_for_everyone") == "true") {
		req.DeleteForEveryone = true
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

