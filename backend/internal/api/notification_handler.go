package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

// NotificationHandler menangani endpoint REST untuk Web Push VAPID dan Subscription management.
type NotificationHandler struct {
	pushService *push.Service
	userStore   store.UserStore
}

// NewNotificationHandler membuat instance baru NotificationHandler.
func NewNotificationHandler(pushService *push.Service, userStore store.UserStore) *NotificationHandler {
	return &NotificationHandler{
		pushService: pushService,
		userStore:   userStore,
	}
}

// PushSubscribeRequest merepresentasikan payload body saat client mendaftarkan subscription.
type PushSubscribeRequest struct {
	Platform string `json:"platform"` // "web", "android", "ios"
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// PushUnsubscribeRequest merepresentasikan payload body saat client menghapus subscription.
type PushUnsubscribeRequest struct {
	Endpoint string `json:"endpoint"`
}

// GetVAPIDPublicKey mengembalikan VAPID public key untuk negosiasi PushManager di browser.
func (h *NotificationHandler) GetVAPIDPublicKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	pubKey := ""
	if h.pushService != nil {
		pubKey = h.pushService.VAPIDPublicKey()
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"public_key": pubKey,
	})
}

// Subscribe mendaftarkan token/endpoint push notification milik pengguna yang sedang login.
func (h *NotificationHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok || claims == nil || claims.UserID == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req PushSubscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Format JSON tidak valid"}`, http.StatusBadRequest)
		return
	}

	endpoint := strings.TrimSpace(req.Endpoint)
	if endpoint == "" {
		http.Error(w, `{"error":"Endpoint subscription wajib diisi"}`, http.StatusBadRequest)
		return
	}

	platform := strings.ToLower(strings.TrimSpace(req.Platform))
	if platform == "" {
		platform = "web"
	}

	tenantID := "default"
	if claims.TenantID != "" {
		tenantID = claims.TenantID
	}

	sub := &store.PushSubscription{
		ID:        uuid.New().String(),
		TenantID:  tenantID,
		UserID:    claims.UserID,
		Platform:  platform,
		Endpoint:  endpoint,
		P256dhKey: strings.TrimSpace(req.Keys.P256dh),
		AuthKey:   strings.TrimSpace(req.Keys.Auth),
		CreatedAt: time.Now().UTC(),
	}

	if h.userStore != nil {
		if err := h.userStore.SavePushSubscription(sub); err != nil {
			http.Error(w, `{"error":"Gagal menyimpan push subscription"}`, http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"message": "Push notification berhasil didaftarkan",
	})
}

// Unsubscribe mencabut subscription push notification tertentu dari database.
func (h *NotificationHandler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok || claims == nil || claims.UserID == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req PushUnsubscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Format JSON tidak valid"}`, http.StatusBadRequest)
		return
	}

	endpoint := strings.TrimSpace(req.Endpoint)
	if endpoint != "" && h.userStore != nil {
		_ = h.userStore.DeletePushSubscriptionByUser(claims.UserID, endpoint)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"message": "Push notification berhasil dinonaktifkan",
	})
}
