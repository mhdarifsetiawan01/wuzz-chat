package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type ChatHandler struct {
	userStore    store.UserStore
	messageStore store.MessageStore
}

func NewChatHandler(us store.UserStore, ms store.MessageStore) *ChatHandler {
	return &ChatHandler{
		userStore:    us,
		messageStore: ms,
	}
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

