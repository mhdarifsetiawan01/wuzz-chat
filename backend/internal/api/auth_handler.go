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
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	userStore    store.UserStore
	tokenStore   store.TokenStore
	sessionStore store.SessionStore
	deviceStore  store.DeviceStore
	hub          WebSocketHub
}

func NewAuthHandler(us store.UserStore) *AuthHandler {
	return &AuthHandler{userStore: us}
}

func (h *AuthHandler) SetTokenStore(ts store.TokenStore) {
	h.tokenStore = ts
}

func (h *AuthHandler) SetSessionStore(ss store.SessionStore) {
	h.sessionStore = ss
}

func (h *AuthHandler) SetDeviceStore(ds store.DeviceStore) {
	h.deviceStore = ds
}

func (h *AuthHandler) SetHub(hub WebSocketHub) {
	h.hub = hub
}

type RegisterRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
	DeviceID    string `json:"device_id"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	DeviceID string `json:"device_id"`
}

type AuthResponse struct {
	Token string      `json:"token"`
	User  *store.User `json:"user"`
}

func getClientIP(r *http.Request) string {
	if cfIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cfIP != "" {
		return cfIP
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx != -1 {
		return host[:idx]
	}
	return host
}

// parseDeviceName membaca User-Agent string dan mengembalikan nama ramah untuk perangkat.
// Contoh output: "Chrome on Windows", "Safari on iPhone", "Firefox on Android"
func parseDeviceName(userAgent string) string {
	ua := strings.ToLower(userAgent)

	// Deteksi OS
	os := "Unknown OS"
	switch {
	case strings.Contains(ua, "windows"):
		os = "Windows"
	case strings.Contains(ua, "iphone"):
		os = "iPhone"
	case strings.Contains(ua, "ipad"):
		os = "iPad"
	case strings.Contains(ua, "android"):
		os = "Android"
	case strings.Contains(ua, "mac os"):
		os = "Mac"
	case strings.Contains(ua, "linux"):
		os = "Linux"
	}

	// Deteksi browser
	browser := "Browser"
	switch {
	case strings.Contains(ua, "edg/"):
		browser = "Edge"
	case strings.Contains(ua, "chrome") && !strings.Contains(ua, "chromium"):
		browser = "Chrome"
	case strings.Contains(ua, "firefox"):
		browser = "Firefox"
	case strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome"):
		browser = "Safari"
	case strings.Contains(ua, "opera") || strings.Contains(ua, "opr/"):
		browser = "Opera"
	}

	return browser + " on " + os
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	// Batasi ukuran request body maksimal 64 KB (Anti-DoS)
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid atau ukuran melebihi batas (maks 64KB)"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	// Validasi input pendaftaran (panjang, karakter, dan filter kata terlarang)
	if err := auth.ValidateRegistration(req.Username, req.DisplayName, req.Password); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	user, err := h.userStore.Register(req.Username, req.DisplayName, req.Password)
	if err != nil {
		if err == store.ErrUserExists {
			http.Error(w, `{"error":"Username sudah digunakan, silakan pilih username lain"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"Gagal mendaftarkan user"}`, http.StatusInternalServerError)
		return
	}

	token, claims, err := auth.GenerateTokenDetailed(user.ID, user.Username, user.DisplayName)
	if err != nil {
		http.Error(w, `{"error":"Gagal generate token"}`, http.StatusInternalServerError)
		return
	}

	if req.DeviceID == "" {
		req.DeviceID = strings.TrimSpace(r.Header.Get("X-Device-ID"))
	}

	if h.sessionStore != nil && claims != nil {
		sess := &store.Session{
			ID:           claims.ID,
			UserID:       user.ID,
			DeviceID:     strings.TrimSpace(req.DeviceID),
			UserAgent:    r.UserAgent(),
			IPAddress:    getClientIP(r),
			IsRevoked:    false,
			CreatedAt:    time.Now().UTC(),
			ExpiresAt:    claims.ExpiresAt.Time,
			LastActiveAt: time.Now().UTC(),
		}
		if err := h.sessionStore.CreateSession(sess); err != nil {
			log.Printf("⚠️ Gagal mencatat sesi registrasi (user: %s): %v", user.ID, err)
		}
	}

	// Daftarkan perangkat yang registrasi
	if h.deviceStore != nil && strings.TrimSpace(req.DeviceID) != "" {
		device := &store.Device{
			ID:        strings.TrimSpace(req.DeviceID),
			UserID:    user.ID,
			Name:      parseDeviceName(r.UserAgent()),
			Platform:  "web",
			UserAgent: r.UserAgent(),
			IPAddress: getClientIP(r),
			IsActive:  true,
			CreatedAt: time.Now().UTC(),
		}
		if err := h.deviceStore.RegisterOrUpdateDevice(device); err != nil {
			log.Printf("⚠️ Gagal mendaftarkan device saat registrasi (user: %s, device: %s): %v", user.ID, req.DeviceID, err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	if req.DeviceID == "" {
		req.DeviceID = strings.TrimSpace(r.Header.Get("X-Device-ID"))
	}

	user, err := h.userStore.Authenticate(strings.TrimSpace(req.Username), req.Password)
	if err != nil {
		http.Error(w, `{"error":"Username atau password salah"}`, http.StatusUnauthorized)
		return
	}

	token, claims, err := auth.GenerateTokenDetailed(user.ID, user.Username, user.DisplayName)
	if err != nil {
		http.Error(w, `{"error":"Gagal generate token"}`, http.StatusInternalServerError)
		return
	}

	if h.sessionStore != nil && claims != nil {
		sess := &store.Session{
			ID:           claims.ID,
			UserID:       user.ID,
			DeviceID:     strings.TrimSpace(req.DeviceID),
			UserAgent:    r.UserAgent(),
			IPAddress:    getClientIP(r),
			IsRevoked:    false,
			CreatedAt:    time.Now().UTC(),
			ExpiresAt:    claims.ExpiresAt.Time,
			LastActiveAt: time.Now().UTC(),
		}
		if err := h.sessionStore.CreateSession(sess); err != nil {
			log.Printf("⚠️ Gagal mencatat sesi login (user: %s): %v", user.ID, err)
		}
	}

	// Daftarkan atau perbarui perangkat yang login
	if h.deviceStore != nil && strings.TrimSpace(req.DeviceID) != "" {
		device := &store.Device{
			ID:        strings.TrimSpace(req.DeviceID),
			UserID:    user.ID,
			Name:      parseDeviceName(r.UserAgent()),
			Platform:  "web",
			UserAgent: r.UserAgent(),
			IPAddress: getClientIP(r),
			IsActive:  true,
			CreatedAt: time.Now().UTC(),
		}
		if err := h.deviceStore.RegisterOrUpdateDevice(device); err != nil {
			log.Printf("⚠️ Gagal mendaftarkan device (user: %s, device: %s): %v", user.ID, req.DeviceID, err)
			// Non-fatal: login tetap berhasil meskipun device registration gagal
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user,
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	user, err := h.userStore.GetUserByID(claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"User tidak ditemukan"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

type UpdateProfileRequest struct {
	DisplayName   string `json:"display_name"`
	StatusMessage string `json:"status_message"`
	AvatarURL     string `json:"avatar_url"`
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.StatusMessage = strings.TrimSpace(req.StatusMessage)
	req.AvatarURL = strings.TrimSpace(req.AvatarURL)

	updatedUser, err := h.userStore.UpdateProfile(claims.UserID, req.DisplayName, req.StatusMessage, req.AvatarURL)
	if err != nil {
		http.Error(w, `{"error":"Gagal memperbarui profil"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(updatedUser)
}

type UpdatePublicKeyRequest struct {
	PublicKey string `json:"public_key"`
	DeviceID  string `json:"device_id"`
}

// UpdatePublicKey memperbarui kunci publik kriptografi E2EE milik user saat ini.
func (h *AuthHandler) UpdatePublicKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req UpdatePublicKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	req.PublicKey = strings.TrimSpace(req.PublicKey)
	if req.PublicKey == "" {
		http.Error(w, `{"error":"public_key tidak boleh kosong"}`, http.StatusBadRequest)
		return
	}
	if len(req.PublicKey) > 4096 {
		http.Error(w, `{"error":"public_key melebihi batas ukuran maksimum"}`, http.StatusBadRequest)
		return
	}

	keyVersion, err := h.userStore.UpdatePublicKeyWithDevice(claims.UserID, req.PublicKey, req.DeviceID)
	if err != nil {
		if errors.Is(err, store.ErrKeyConflict) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error":       "KEY_ALREADY_REGISTERED",
				"message":     "Akun ini sudah aktif di perangkat lain. Kunci keamanan tidak dapat ditimpa otomatis.",
				"key_version": keyVersion,
			})
			return
		}
		http.Error(w, `{"error":"Gagal memperbarui kunci publik"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "ok",
		"message":     "Kunci publik berhasil disimpan",
		"public_key":  req.PublicKey,
		"key_version": keyVersion,
	})
}

type ResetPublicKeyRequest struct {
	PublicKey string `json:"public_key"`
	DeviceID  string `json:"device_id"`
	Password  string `json:"password"`
}

// ResetPublicKey mereset paksa kunci publik E2EE ke perangkat baru dan menaikkan key_version setelah verifikasi password.
func (h *AuthHandler) ResetPublicKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req ResetPublicKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	req.PublicKey = strings.TrimSpace(req.PublicKey)
	if req.PublicKey == "" {
		http.Error(w, `{"error":"public_key tidak boleh kosong"}`, http.StatusBadRequest)
		return
	}
	if len(req.PublicKey) > 4096 {
		http.Error(w, `{"error":"public_key melebihi batas ukuran maksimum"}`, http.StatusBadRequest)
		return
	}

	if req.Password == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Password wajib diisi untuk verifikasi identitas reset kunci",
		})
		return
	}

	validPass, err := h.userStore.VerifyPassword(claims.UserID, req.Password)
	if err != nil || !validPass {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Password salah. Verifikasi identitas reset kunci gagal.",
		})
		return
	}

	newKeyVer, err := h.userStore.ForceResetPublicKey(claims.UserID, req.PublicKey, req.DeviceID)
	if err != nil {
		http.Error(w, `{"error":"Gagal mereset kunci publik"}`, http.StatusInternalServerError)
		return
	}

	// Single Device Enforcement & Keamanan E2EE:
	// Segera tendang sesi WebSocket perangkat lama karena kunci enkripsi telah di-reset
	if h.hub != nil {
		h.hub.KickClientByUserID(claims.UserID, req.DeviceID, "SESSION_REPLACED: Kunci keamanan telah di-reset dari perangkat lain.")
	}

	// Revoke seluruh sesi login perangkat lain milik pengguna ini (Phase 1: Active Session Management)
	if h.sessionStore != nil && claims.ID != "" {
		if err := h.sessionStore.RevokeAllOtherSessions(claims.UserID, claims.ID); err != nil {
			log.Printf("⚠️ Gagal mencabut sesi perangkat lain saat reset kunci (user: %s): %v", claims.UserID, err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "ok",
		"message":     "Kunci publik berhasil di-reset ke perangkat baru",
		"public_key":  req.PublicKey,
		"key_version": newKeyVer,
	})
}

type LogoutRequest struct {
	DeviceID string `json:"device_id"`
}

// Logout menangani proses logout pengguna, mencabut JWT aktif, dan melepaskan sesi active_device_id di database.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Revoke token JTI jika tokenStore terpasang dan claims memiliki JTI
	if h.tokenStore != nil && claims.ID != "" {
		exp := time.Now().Add(7 * 24 * time.Hour)
		if claims.ExpiresAt != nil {
			exp = claims.ExpiresAt.Time
		}
		if err := h.tokenStore.RevokeToken(claims.ID, claims.UserID, exp); err != nil {
			log.Printf("⚠️ Gagal mencabut token jti %s saat logout: %v", claims.ID, err)
		}
	}

	// Revoke sesi di sessionStore (Phase 1: Session Foundation)
	if h.sessionStore != nil && claims.ID != "" {
		if err := h.sessionStore.RevokeSession(claims.ID, claims.UserID); err != nil {
			log.Printf("⚠️ Gagal mencabut sesi %s saat logout: %v", claims.ID, err)
		}
	}

	deviceID := strings.TrimSpace(r.Header.Get("X-Device-ID"))
	if deviceID == "" {
		deviceID = strings.TrimSpace(r.URL.Query().Get("device_id"))
	}
	if deviceID == "" && r.Body != nil {
		var req LogoutRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		deviceID = strings.TrimSpace(req.DeviceID)
	}

	if err := h.userStore.ClearActiveDevice(claims.UserID, deviceID); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Gagal melepaskan sesi perangkat aktif saat logout",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Berhasil logout dan melepaskan sesi perangkat aktif",
	})
}

type VerifyPasswordRequest struct {
	Password string `json:"password"`
}

// VerifyPassword memvalidasi password user untuk keperluan re-autentikasi / pre-check.
func (h *AuthHandler) VerifyPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req VerifyPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	if req.Password == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Password wajib diisi",
		})
		return
	}

	valid, err := h.userStore.VerifyPassword(claims.UserID, req.Password)
	if err != nil || !valid {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "error",
			"verified": false,
			"error":    "Password salah",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "ok",
		"verified": true,
		"message":  "Password terverifikasi",
	})
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// ChangePassword memverifikasi password lama, memperbarui ke password baru, dan mencabut semua token aktif user.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	if req.OldPassword == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Password lama wajib diisi",
		})
		return
	}

	// 1. Verifikasi password lama
	valid, err := h.userStore.VerifyPassword(claims.UserID, req.OldPassword)
	if err != nil || !valid {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Password lama salah",
		})
		return
	}

	// 2. Validasi kekuatan password baru
	if err := auth.ValidatePassword(req.NewPassword); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

	if req.OldPassword == req.NewPassword {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Password baru tidak boleh sama dengan password lama",
		})
		return
	}

	// 3. Hash password baru dengan bcrypt
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error":"Gagal memproses password baru"}`, http.StatusInternalServerError)
		return
	}

	// 4. Update database
	if err := h.userStore.ChangePassword(claims.UserID, string(newHash)); err != nil {
		http.Error(w, `{"error":"Gagal memperbarui password"}`, http.StatusInternalServerError)
		return
	}

	// 5. Invalidate / Revoke semua token aktif user ini
	if h.tokenStore != nil {
		if claims.ID != "" {
			exp := time.Now().Add(7 * 24 * time.Hour)
			if claims.ExpiresAt != nil {
				exp = claims.ExpiresAt.Time
			}
			_ = h.tokenStore.RevokeToken(claims.ID, claims.UserID, exp)
		}
		if err := h.tokenStore.RevokeAllUserTokens(claims.UserID); err != nil {
			log.Printf("⚠️ Gagal mencabut token user %s saat ganti password: %v", claims.UserID, err)
		}
	}

	// 6. Cabut semua sesi di sessionStore (Phase 1: Session Foundation)
	if h.sessionStore != nil {
		if err := h.sessionStore.RevokeAllOtherSessions(claims.UserID, ""); err != nil {
			log.Printf("⚠️ Gagal mencabut sesi user %s saat ganti password: %v", claims.UserID, err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Password berhasil diubah. Semua sesi aktif telah dicabut. Silakan login kembali.",
	})
}

// GetActiveSessions mengembalikan daftar sesi login aktif milik pengguna.
func (h *AuthHandler) GetActiveSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	sessions := make([]store.Session, 0)
	if h.sessionStore != nil {
		var err error
		sessions, err = h.sessionStore.GetActiveSessions(claims.UserID, claims.ID)
		if err != nil {
			http.Error(w, `{"error":"Gagal mengambil daftar sesi"}`, http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"sessions": sessions,
	})
}

// RevokeSession mencabut satu sesi tertentu dari jarak jauh (remote logout).
func (h *AuthHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	sessionID := strings.TrimPrefix(r.URL.Path, "/api/auth/sessions/")
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		http.Error(w, `{"error":"Session ID wajib disertakan"}`, http.StatusBadRequest)
		return
	}

	if h.sessionStore != nil {
		if err := h.sessionStore.RevokeSession(sessionID, claims.UserID); err != nil {
			http.Error(w, `{"error":"Gagal mencabut sesi"}`, http.StatusInternalServerError)
			return
		}
	}

	if h.tokenStore != nil {
		_ = h.tokenStore.RevokeToken(sessionID, claims.UserID, time.Now().Add(7*24*time.Hour))
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Sesi berhasil dicabut",
	})
}

// RevokeAllOtherSessions mencabut seluruh sesi aktif milik user selain sesi yang sedang digunakan saat ini.
func (h *AuthHandler) RevokeAllOtherSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if h.sessionStore != nil {
		if err := h.sessionStore.RevokeAllOtherSessions(claims.UserID, claims.ID); err != nil {
			http.Error(w, `{"error":"Gagal mencabut sesi lain"}`, http.StatusInternalServerError)
			return
		}
	}

	// Tendang koneksi WebSocket perangkat lain jika terhubung
	if h.hub != nil {
		currentDeviceID := strings.TrimSpace(r.Header.Get("X-Device-ID"))
		h.hub.KickClientByUserID(claims.UserID, currentDeviceID, "SESSION_REVOKED: Sesi login Anda telah dicabut dari jarak jauh.")
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Seluruh sesi lain berhasil dicabut",
	})
}


