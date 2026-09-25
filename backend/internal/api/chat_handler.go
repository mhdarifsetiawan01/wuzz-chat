package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	authzinfra "github.com/bms-del112/wuzz-chat/internal/authz/infra"
	"github.com/bms-del112/wuzz-chat/internal/messaging"
	messaginginfra "github.com/bms-del112/wuzz-chat/internal/messaging/infra"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

type ChatHandler struct {
	userStore    store.UserStore
	messageStore store.MessageStore
	service      *messaging.MessageService
	authSvc      *authz.AuthService
	hub          *ws.Hub
}

func NewChatHandler(us store.UserStore, ms store.MessageStore) *ChatHandler {
	repo := messaginginfra.NewSQLMessagingRepository(ms, us)
	service := messaging.NewMessageService(repo, repo, repo, nil)
	var authSvc *authz.AuthService
	if us != nil {
		authRepo := authzinfra.NewSQLAuthRepository(us, nil, nil, nil, nil)
		authSvc = authz.NewAuthService(authRepo, nil)
	}
	return &ChatHandler{
		userStore:    us,
		messageStore: ms,
		service:      service,
		authSvc:      authSvc,
	}
}

// NewChatHandlerWithService membuat ChatHandler dengan injeksi MessageService dan AuthService.
func NewChatHandlerWithService(service *messaging.MessageService, us store.UserStore, ms store.MessageStore, authSvc ...*authz.AuthService) *ChatHandler {
	if service == nil && (us != nil || ms != nil) {
		repo := messaginginfra.NewSQLMessagingRepository(ms, us)
		service = messaging.NewMessageService(repo, repo, repo, nil)
	}
	var aSvc *authz.AuthService
	if len(authSvc) > 0 && authSvc[0] != nil {
		aSvc = authSvc[0]
	} else if us != nil {
		authRepo := authzinfra.NewSQLAuthRepository(us, nil, nil, nil, nil)
		aSvc = authz.NewAuthService(authRepo, nil)
	}
	return &ChatHandler{
		service:      service,
		userStore:    us,
		messageStore: ms,
		authSvc:      aSvc,
	}
}

// SetAuthService menyuntikkan AuthService ke ChatHandler.
func (h *ChatHandler) SetAuthService(authSvc *authz.AuthService) {
	h.authSvc = authSvc
}

// SetMessageService menyuntikkan MessageService ke ChatHandler.
func (h *ChatHandler) SetMessageService(service *messaging.MessageService) {
	h.service = service
	if h.hub != nil && service != nil {
		service.SetBroadcaster(h.hub)
	}
}

func (h *ChatHandler) SetHub(hub *ws.Hub) {
	h.hub = hub
	if h.service != nil {
		h.service.SetBroadcaster(hub)
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
		_ = json.NewEncoder(w).Encode([]authz.UserSummary{})
		return
	}

	if h.authSvc != nil {
		users, err := h.authSvc.SearchUsers(r.Context(), query, claims.UserID)
		if err != nil {
			http.Error(w, `{"error":"Gagal mencari user"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(users)
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

	conversations, err := h.service.GetConversations(r.Context(), claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"Gagal mengambil daftar percakapan"}`, http.StatusInternalServerError)
		return
	}
	if conversations == nil {
		conversations = []messaging.Conversation{}
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

	roomID, err := h.service.StartDirectChat(r.Context(), claims.UserID, req.TargetUserID)
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

	if err := h.service.ClearConversation(r.Context(), conversationID, claims.UserID); err != nil {
		if strings.Contains(err.Error(), "Akses ditolak") {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
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

	if userID == "" && username == "" {
		http.Error(w, `{"error":"parameter id atau username wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	if h.authSvc != nil {
		profile, err := h.authSvc.GetUserProfile(r.Context(), userID, username)
		if err != nil || profile == nil {
			http.Error(w, `{"error":"User tidak ditemukan"}`, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(profile)
		return
	}

	var user *store.User
	var err error

	callerTenant := tenantshared.MustFromContext(r.Context()).TenantID()

	if userID != "" {
		user, err = h.userStore.GetUserByID(userID)
		if err == nil && user != nil && user.TenantID != callerTenant {
			user = nil
			err = store.ErrUserNotFound
		}
	} else if username != "" {
		cleanUsername := strings.TrimPrefix(username, "@")
		user, err = h.userStore.GetUserByUsernameWithContext(r.Context(), cleanUsername)
		if err != nil {
			user, err = h.userStore.GetUserByUsernameOrDisplayNameWithContext(r.Context(), cleanUsername)
		}
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
	if h.authSvc != nil {
		profile, err := h.authSvc.GetUserProfile(r.Context(), cleanID, cleanID)
		if err != nil || profile == nil {
			http.Error(w, `{"error":"User tidak ditemukan"}`, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"user_id":    profile.ID,
			"public_key": profile.PublicKey,
		})
		return
	}

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

	_, err := h.service.DeleteMessage(r.Context(), messaging.DeleteMessageInput{
		MessageID:         msgID,
		UserID:            claims.UserID,
		DeleteForEveryone: req.DeleteForEveryone,
	})
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

	updatedMsg, err := h.service.EditMessage(r.Context(), messaging.EditMessageInput{
		MessageID: msgID,
		UserID:    claims.UserID,
		Content:   newContent,
	})
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

	forwardedMsgs, err := h.service.ForwardMessage(r.Context(), messaging.ForwardMessageInput{
		SourceMessageID:  msgID,
		SenderID:         claims.UserID,
		SenderNickname:   claims.Username,
		TargetRoomIDs:    req.TargetRoomIDs,
		PlaintextContent: req.PlaintextContent,
	})
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "tidak ditemukan") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusNotFound)
			return
		}
		if strings.Contains(errMsg, "bukan anggota") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusForbidden)
			return
		}
		if strings.Contains(errMsg, "maksimal") || strings.Contains(errMsg, "minimal") || strings.Contains(errMsg, "wajib") || strings.Contains(errMsg, "tidak boleh kosong") || strings.Contains(errMsg, "tidak dapat meneruskan") {
			http.Error(w, `{"error":"`+errMsg+`"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"Gagal meneruskan pesan: `+errMsg+`"}`, http.StatusInternalServerError)
		return
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

	if err := h.service.PinConversation(r.Context(), convID, claims.UserID); err != nil {
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

	if err := h.service.UnpinConversation(r.Context(), convID, claims.UserID); err != nil {
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

	pin, err := h.service.PinMessage(r.Context(), messaging.PinMessageInput{
		ConversationID: convID,
		MessageID:      msgID,
		UserID:         claims.UserID,
		DurationHours:  req.DurationHours,
	})
	if err != nil {
		if strings.Contains(err.Error(), "bukan anggota") {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
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

	err := h.service.UnpinMessage(r.Context(), messaging.UnpinMessageInput{
		ConversationID: convID,
		MessageID:      msgID,
		UserID:         claims.UserID,
	})
	if err != nil {
		if strings.Contains(err.Error(), "bukan anggota") {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
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

	pins, err := h.service.GetPinnedMessages(r.Context(), convID, claims.UserID)
	if err != nil {
		if strings.Contains(err.Error(), "bukan anggota") {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
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

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	results, err := h.service.SearchMessages(r.Context(), roomID, claims.UserID, query, limit)
	if err != nil {
		if strings.Contains(err.Error(), "bukan anggota") {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
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

// UpdateReceipt memproses laporan tanda terima pesan (delivered / read) dari background service worker atau REST client.
func (h *ChatHandler) UpdateReceipt(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		MessageID string `json:"message_id"`
		RoomID    string `json:"room_id"`
		Status    string `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	req.MessageID = strings.TrimSpace(req.MessageID)
	req.RoomID = strings.TrimSpace(req.RoomID)
	req.Status = strings.ToLower(strings.TrimSpace(req.Status))

	if req.RoomID == "" || (req.Status != "delivered" && req.Status != "read") {
		http.Error(w, `{"error":"Field room_id dan status valid ('delivered'|'read') wajib diisi"}`, http.StatusBadRequest)
		return
	}

	err := h.service.UpdateReceipt(r.Context(), messaging.UpdateReceiptInput{
		MessageID: req.MessageID,
		RoomID:    req.RoomID,
		UserID:    claims.UserID,
		Status:    req.Status,
	})
	if err != nil {
		if strings.Contains(err.Error(), "Akses ditolak") {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"status":  req.Status,
	})
}



