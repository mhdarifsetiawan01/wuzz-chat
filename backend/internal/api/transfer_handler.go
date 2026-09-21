package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// WebSocketHub mendefinisikan kontrak minimal untuk menendang koneksi klien lama saat sesi dialihkan.
type WebSocketHub interface {
	KickClientByUserID(userID, exceptDeviceID, reason string)
}

// TransferHandler mengelola pembuatan dan konsumsi sesi pemindahan kunci E2EE via QR Code.
type TransferHandler struct {
	transferStore store.TransferStore
	sessionStore  store.SessionStore
	hub           WebSocketHub
}

// NewTransferHandler membuat instance baru TransferHandler dengan WebSocketHub opsional.
func NewTransferHandler(transferStore store.TransferStore, hub ...WebSocketHub) *TransferHandler {
	var h WebSocketHub
	if len(hub) > 0 {
		h = hub[0]
	}
	return &TransferHandler{
		transferStore: transferStore,
		hub:           h,
	}
}

// SetHub menyuntikkan instance WebSocketHub ke TransferHandler.
func (h *TransferHandler) SetHub(hub WebSocketHub) {
	h.hub = hub
}

// SetSessionStore menyuntikkan instance SessionStore ke TransferHandler.
func (h *TransferHandler) SetSessionStore(ss store.SessionStore) {
	h.sessionStore = ss
}

type CreateTransferRequest struct {
	SessionToken    string `json:"session_token"`
	EncryptedBundle string `json:"encrypted_bundle"`
}

type ConsumeTransferRequest struct {
	SessionToken string `json:"session_token"`
	DeviceID     string `json:"device_id"`
}

// CreateSession membuat sesi transfer key baru (dijalankan oleh device lama/aktif).
func (h *TransferHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreateTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload JSON tidak valid"}`, http.StatusBadRequest)
		return
	}

	req.SessionToken = strings.TrimSpace(req.SessionToken)
	req.EncryptedBundle = strings.TrimSpace(req.EncryptedBundle)

	if len(req.SessionToken) < 16 || len(req.SessionToken) > 128 {
		http.Error(w, `{"error":"session_token tidak valid (panjang minimal 16 dan maksimal 128 karakter)"}`, http.StatusBadRequest)
		return
	}

	if req.EncryptedBundle == "" {
		http.Error(w, `{"error":"encrypted_bundle tidak boleh kosong"}`, http.StatusBadRequest)
		return
	}

	if len(req.EncryptedBundle) > 65536 {
		http.Error(w, `{"error":"encrypted_bundle melebihi batas ukuran 64KB"}`, http.StatusBadRequest)
		return
	}

	// Buat transfer session dengan TTL 5 menit (300 detik)
	err := h.transferStore.CreateTransferSession(claims.UserID, req.SessionToken, req.EncryptedBundle, 5*time.Minute)
	if err != nil {
		http.Error(w, `{"error":"Gagal menyimpan sesi transfer"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "success",
		"expires_in": 300,
	})
}

// ConsumeSession mengambil bundle terenkripsi secara one-time dan mengalihkan active_device_id ke device baru.
func (h *TransferHandler) ConsumeSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req ConsumeTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload JSON tidak valid"}`, http.StatusBadRequest)
		return
	}

	req.SessionToken = strings.TrimSpace(req.SessionToken)
	req.DeviceID = strings.TrimSpace(req.DeviceID)

	if req.SessionToken == "" {
		http.Error(w, `{"error":"session_token wajib diisi"}`, http.StatusBadRequest)
		return
	}

	bundle, err := h.transferStore.ConsumeTransferSession(req.SessionToken, claims.UserID, req.DeviceID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case errors.Is(err, store.ErrTransferNotFound):
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Sesi transfer tidak ditemukan atau token salah."})
		case errors.Is(err, store.ErrTransferAlreadyUsed):
			w.WriteHeader(http.StatusGone)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Sesi transfer ini sudah pernah digunakan.",
				"code":  "SESSION_ALREADY_USED",
			})
		case errors.Is(err, store.ErrTransferExpired):
			w.WriteHeader(http.StatusGone)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Sesi transfer telah kedaluwarsa. Silakan buat QR code baru di perangkat lama.",
				"code":  "SESSION_EXPIRED",
			})
		case errors.Is(err, store.ErrTransferUnauthorized):
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Sesi transfer ini bukan milik akun Anda."})
		default:
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Terjadi kesalahan sistem saat memproses transfer."})
		}
		return
	}

	// Single Device Enforcement: Segera tendang sesi WebSocket perangkat lama
	if h.hub != nil {
		h.hub.KickClientByUserID(claims.UserID, req.DeviceID, "SESSION_REPLACED: Kunci keamanan telah dipindahkan ke perangkat baru.")
	}

	// Revoke seluruh sesi login perangkat lain milik pengguna ini (Phase 1: Active Session Management)
	if h.sessionStore != nil && claims.ID != "" {
		if err := h.sessionStore.RevokeAllOtherSessions(claims.UserID, claims.ID); err != nil {
			log.Printf("⚠️ Gagal mencabut sesi perangkat lain saat transfer kunci (user: %s): %v", claims.UserID, err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":           "success",
		"encrypted_bundle": bundle,
	})
}
