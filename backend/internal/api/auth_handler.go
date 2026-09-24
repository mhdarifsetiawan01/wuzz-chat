package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	authzinfra "github.com/bms-del112/wuzz-chat/internal/authz/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type AuthHandler struct {
	userStore    store.UserStore
	tokenStore   store.TokenStore
	sessionStore store.SessionStore
	deviceStore  store.DeviceStore
	hub          WebSocketHub
	authSvc      *authz.AuthService
}

func (h *AuthHandler) syncAuthRepo() {
	if h.userStore == nil {
		return
	}
	repo := authzinfra.NewSQLAuthRepository(h.userStore, h.sessionStore, h.deviceStore, h.tokenStore, nil)
	if h.authSvc == nil {
		h.authSvc = authz.NewAuthService(repo, h.hub)
	} else {
		h.authSvc.SetRepository(repo)
	}
}

func NewAuthHandler(us store.UserStore) *AuthHandler {
	h := &AuthHandler{userStore: us}
	h.syncAuthRepo()
	return h
}

// NewAuthHandlerWithService membuat AuthHandler dengan injeksi AuthService (Fase 2 Track B).
func NewAuthHandlerWithService(authSvc *authz.AuthService, us store.UserStore) *AuthHandler {
	h := &AuthHandler{
		authSvc:   authSvc,
		userStore: us,
	}
	if h.authSvc == nil {
		h.syncAuthRepo()
	}
	return h
}

func (h *AuthHandler) SetAuthService(authSvc *authz.AuthService) {
	h.authSvc = authSvc
	if h.hub != nil && h.authSvc != nil {
		h.authSvc.SetSessionKicker(h.hub)
	}
}

func (h *AuthHandler) SetTokenStore(ts store.TokenStore) {
	h.tokenStore = ts
	h.syncAuthRepo()
}

func (h *AuthHandler) SetSessionStore(ss store.SessionStore) {
	h.sessionStore = ss
	h.syncAuthRepo()
}

func (h *AuthHandler) SetDeviceStore(ds store.DeviceStore) {
	h.deviceStore = ds
	h.syncAuthRepo()
}

func (h *AuthHandler) SetHub(hub WebSocketHub) {
	h.hub = hub
	if h.authSvc != nil {
		h.authSvc.SetSessionKicker(hub)
	}
}

type RegisterRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
	DeviceID    string `json:"device_id"`
	Platform    string `json:"platform,omitempty"`
}

type LoginRequest struct {
	Username        string `json:"username"`
	Password        string `json:"password"`
	DeviceID        string `json:"device_id"`
	Platform        string `json:"platform,omitempty"`
	ConfirmOverride bool   `json:"confirm_override,omitempty"`
	KickDeviceID    string `json:"kick_device_id,omitempty"`
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

	if req.DeviceID == "" {
		req.DeviceID = strings.TrimSpace(r.Header.Get("X-Device-ID"))
	}
	platform := strings.TrimSpace(req.Platform)
	if platform == "" {
		platform = strings.TrimSpace(r.Header.Get("X-Device-Platform"))
	}
	res, err := h.authSvc.Register(authz.RegisterInput{
		Username:    req.Username,
		DisplayName: req.DisplayName,
		Password:    req.Password,
		DeviceID:    req.DeviceID,
		Platform:    platform,
		UserAgent:   r.UserAgent(),
		IP:          getClientIP(r),
	})
	if err != nil {
		if errors.Is(err, store.ErrUserExists) {
			http.Error(w, `{"error":"Username sudah digunakan, silakan pilih username lain"}`, http.StatusConflict)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	user, _ := h.userStore.GetUserByID(res.UserID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token: res.Token,
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
	platform := strings.TrimSpace(req.Platform)
	if platform == "" {
		platform = strings.TrimSpace(r.Header.Get("X-Device-Platform"))
	}

	res, conflict, err := h.authSvc.Login(authz.LoginInput{
		Username:        req.Username,
		Password:        req.Password,
		DeviceID:        req.DeviceID,
		Platform:        platform,
		ConfirmOverride: req.ConfirmOverride,
		KickDeviceID:    req.KickDeviceID,
		UserAgent:       r.UserAgent(),
		IP:              getClientIP(r),
	})
	if conflict != nil {
		var activeDevices []store.Device
		if h.deviceStore != nil {
			user, _ := h.userStore.GetUserByUsername(strings.TrimSpace(req.Username))
			if user != nil {
				activeDevices, _ = h.deviceStore.GetUserDevices(user.ID)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":          "DEVICE_LIMIT_REACHED",
			"code":           "DEVICE_LIMIT_REACHED",
			"message":        "Akun Anda saat ini sudah aktif di 2 perangkat lain.",
			"max_devices":    2,
			"active_devices": activeDevices,
		})
		return
	}
	if err != nil {
		http.Error(w, `{"error":"Username atau password salah"}`, http.StatusUnauthorized)
		return
	}
	user, _ := h.userStore.GetUserByID(res.UserID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token: res.Token,
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

	deviceID := strings.TrimSpace(r.Header.Get("X-Device-ID"))
	if deviceID == "" {
		deviceID = strings.TrimSpace(r.URL.Query().Get("device_id"))
	}
	if deviceID == "" && r.Body != nil {
		var req LogoutRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		deviceID = strings.TrimSpace(req.DeviceID)
	}

	var exp time.Time
	if claims.ExpiresAt != nil {
		exp = claims.ExpiresAt.Time
	}
	_ = h.authSvc.Logout(authz.LogoutInput{
		JTI:      claims.ID,
		UserID:   claims.UserID,
		DeviceID: deviceID,
		TokenExp: exp,
	})
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

	if err := h.authSvc.ChangePassword(authz.ChangePasswordInput{
		UserID:      claims.UserID,
		OldPassword: req.OldPassword,
		NewPassword: req.NewPassword,
		CurrentJTI:  claims.ID,
	}); err != nil {
		w.Header().Set("Content-Type", "application/json")
		if errors.Is(err, authz.ErrInvalidCredentials) {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Password lama salah",
			})
			return
		}
		if errors.Is(err, authz.ErrSamePassword) {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Password baru tidak boleh sama dengan password lama",
			})
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
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

	sessionInfos, err := h.authSvc.GetActiveSessions(claims.UserID, claims.ID)
	if err != nil {
		http.Error(w, `{"error":"Gagal mengambil daftar sesi"}`, http.StatusInternalServerError)
		return
	}
	sessions := make([]store.Session, 0, len(sessionInfos))
	for _, s := range sessionInfos {
		sessions = append(sessions, store.Session{
			ID:        s.ID,
			DeviceID:  s.DeviceID,
			UserAgent: s.UserAgent,
			IPAddress: s.IP,
			CreatedAt: s.CreatedAt,
			IsCurrent: s.IsCurrent,
		})
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

	if err := h.authSvc.RevokeSession(sessionID, claims.UserID); err != nil {
		http.Error(w, `{"error":"Gagal mencabut sesi"}`, http.StatusInternalServerError)
		return
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

	currentDeviceID := strings.TrimSpace(r.Header.Get("X-Device-ID"))
	if err := h.authSvc.RevokeAllOtherSessions(claims.UserID, claims.ID, currentDeviceID); err != nil {
		http.Error(w, `{"error":"Gagal mencabut sesi lain"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Seluruh sesi lain berhasil dicabut",
	})
}



