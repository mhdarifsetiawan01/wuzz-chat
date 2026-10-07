package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/authz/google"
	sharederrors "github.com/bms-del112/wuzz-chat/internal/shared/errors"
	sharedvalidator "github.com/bms-del112/wuzz-chat/internal/shared/validator"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Kode error mesin-terbaca untuk klien. Pesan manusia ada di field "error".
const (
	codeGoogleNotConfigured  = "GOOGLE_NOT_CONFIGURED"
	codeGoogleTokenInvalid   = "GOOGLE_TOKEN_INVALID"
	codeGoogleReauthStale    = "GOOGLE_REAUTH_STALE"
	codeGoogleMismatch       = "GOOGLE_MISMATCH"
	codeGoogleNotLinked      = "GOOGLE_NOT_LINKED"
	codeGoogleTakenByOther   = "GOOGLE_LINKED_TO_OTHER_ACCOUNT"
	codeAccountHasGoogle     = "ACCOUNT_ALREADY_HAS_GOOGLE"
	codeLinkTokenInvalid     = "LINK_TOKEN_INVALID"
	codeUsernameTaken        = "USERNAME_TAKEN"
	codeInvalidCredentials   = "INVALID_CREDENTIALS"
	codeTenantNotAllowed     = "GOOGLE_TENANT_NOT_ALLOWED"
	codePasswordUnavailable  = "PASSWORD_LOGIN_UNAVAILABLE"
	codeGoogleSameAccount    = "GOOGLE_SAME_ACCOUNT"
	codeGoogleReplaceLimit   = "GOOGLE_REPLACE_LIMIT"
	codeDeviceLimitReached   = "DEVICE_LIMIT_REACHED"
	codeValidation           = "VALIDATION_ERROR"
	codeServer               = "SERVER_ERROR"
	maxGoogleRequestBodySize = 16 * 1024
)

func writeAuthJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeAuthError(w http.ResponseWriter, status int, code, message string) {
	writeAuthJSON(w, status, map[string]string{"error": message, "code": code})
}

// writeGoogleError memetakan error domain/store ke respons HTTP. Error tak dikenal menjadi 500 generik (detail hanya di log).
func writeGoogleError(w http.ResponseWriter, err error, context string) {
	switch {
	case errors.Is(err, authz.ErrAccountSuspended):
		WriteAccountSuspended(w)
	case errors.Is(err, google.ErrNotConfigured):
		writeAuthError(w, http.StatusServiceUnavailable, codeGoogleNotConfigured, "Login Google belum tersedia")
	case errors.Is(err, google.ErrInvalidIDToken):
		writeAuthError(w, http.StatusUnauthorized, codeGoogleTokenInvalid, "Verifikasi akun Google gagal, coba lagi")
	case errors.Is(err, authz.ErrGoogleReauthStale):
		writeAuthError(w, http.StatusUnauthorized, codeGoogleReauthStale, err.Error())
	case errors.Is(err, authz.ErrGoogleMismatch):
		writeAuthError(w, http.StatusUnauthorized, codeGoogleMismatch, err.Error())
	case errors.Is(err, auth.ErrInvalidLinkToken):
		writeAuthError(w, http.StatusUnauthorized, codeLinkTokenInvalid, "Sesi verifikasi Google kedaluwarsa, silakan mulai ulang")
	case errors.Is(err, authz.ErrInvalidCredentials):
		writeAuthError(w, http.StatusUnauthorized, codeInvalidCredentials, "Username atau password salah")
	case errors.Is(err, sharederrors.ErrOAuthSubjectTaken):
		writeAuthError(w, http.StatusConflict, codeGoogleTakenByOther, err.Error())
	case errors.Is(err, sharederrors.ErrOAuthAlreadyLinked):
		writeAuthError(w, http.StatusConflict, codeAccountHasGoogle, err.Error())
	case errors.Is(err, sharederrors.ErrOAuthNotLinked):
		writeAuthError(w, http.StatusNotFound, codeGoogleNotLinked, err.Error())
	case errors.Is(err, store.ErrUserExists):
		writeAuthError(w, http.StatusConflict, codeUsernameTaken, "Username sudah digunakan, silakan pilih username lain")
	case errors.Is(err, authz.ErrGoogleTenantNotAllowed):
		writeAuthError(w, http.StatusForbidden, codeTenantNotAllowed, err.Error())
	case errors.Is(err, authz.ErrPasswordLoginUnavailable):
		writeAuthError(w, http.StatusConflict, codePasswordUnavailable, err.Error())
	case errors.Is(err, sharederrors.ErrOAuthReplaceLimit):
		writeAuthError(w, http.StatusTooManyRequests, codeGoogleReplaceLimit, err.Error())
	case errors.Is(err, authz.ErrGoogleSame):
		writeAuthError(w, http.StatusBadRequest, codeGoogleSameAccount, err.Error())
	case sharedvalidator.IsValidationError(err):
		writeAuthError(w, http.StatusBadRequest, codeValidation, err.Error())
	default:
		log.Printf("[Auth] ❌ %s: %v", context, err)
		writeAuthError(w, http.StatusInternalServerError, codeServer, "Terjadi kesalahan, coba lagi")
	}
}

// writeDeviceConflict mengirim 409 DEVICE_LIMIT_REACHED dengan format yang sama seperti login password.
func (h *AuthHandler) writeDeviceConflict(w http.ResponseWriter, conflict *authz.DeviceConflict) {
	var activeDevices []store.Device
	if h.deviceStore != nil && conflict.UserID != "" {
		activeDevices, _ = h.deviceStore.GetUserDevices(conflict.UserID)
	}
	writeAuthJSON(w, http.StatusConflict, map[string]any{
		"error":          codeDeviceLimitReached,
		"code":           codeDeviceLimitReached,
		"message":        "Akun Anda saat ini sudah aktif di 2 perangkat lain.",
		"max_devices":    2,
		"active_devices": activeDevices,
	})
}

// decodeGoogleBody membatasi ukuran dan mendekode JSON. Mengembalikan false (dan sudah menulis 400) bila gagal.
func decodeGoogleBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxGoogleRequestBodySize)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeAuthError(w, http.StatusBadRequest, codeValidation, "Payload tidak valid")
		return false
	}
	return true
}

func (h *AuthHandler) googleReady(w http.ResponseWriter) bool {
	if h.authSvc == nil || !h.authSvc.GoogleEnabled() {
		writeAuthError(w, http.StatusServiceUnavailable, codeGoogleNotConfigured, "Login Google belum tersedia")
		return false
	}
	return true
}

type googleDeviceFields struct {
	DeviceID        string `json:"device_id"`
	Platform        string `json:"platform,omitempty"`
	ConfirmOverride bool   `json:"confirm_override,omitempty"`
	KickDeviceID    string `json:"kick_device_id,omitempty"`
}

func (h *AuthHandler) googleDevice(r *http.Request, f googleDeviceFields) authz.GoogleDevice {
	deviceID := strings.TrimSpace(f.DeviceID)
	if deviceID == "" {
		deviceID = strings.TrimSpace(r.Header.Get("X-Device-ID"))
	}
	platform := strings.TrimSpace(f.Platform)
	if platform == "" {
		platform = strings.TrimSpace(r.Header.Get("X-Device-Platform"))
	}
	return authz.GoogleDevice{
		DeviceID:        deviceID,
		Platform:        platform,
		ConfirmOverride: f.ConfirmOverride,
		KickDeviceID:    f.KickDeviceID,
		UserAgent:       r.UserAgent(),
		IP:              getClientIP(r),
	}
}

func (h *AuthHandler) respondWithSession(w http.ResponseWriter, r *http.Request, status int, userID, token string) {
	user, _ := h.userStore.GetUserByID(userID)
	writeAuthJSON(w, status, h.newAuthResponse(r, token, user))
}

// --- POST /api/auth/google ---

type googleSignInRequest struct {
	IDToken string `json:"id_token"`
	googleDeviceFields
}

// GoogleSignIn menukar ID token Google dengan sesi. Bila akun Google belum tertaut, membalas 200 dengan
// code=GOOGLE_NOT_LINKED dan link_token untuk langkah berikutnya (daftar baru atau tautkan akun lama).
func (h *AuthHandler) GoogleSignIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAuthError(w, http.StatusMethodNotAllowed, codeValidation, "Method tidak diizinkan")
		return
	}
	if !h.googleReady(w) {
		return
	}
	var req googleSignInRequest
	if !decodeGoogleBody(w, r, &req) {
		return
	}

	res, err := h.authSvc.GoogleSignIn(r.Context(), req.IDToken, h.googleDevice(r, req.googleDeviceFields))
	if err != nil {
		log.Printf("[Auth] ❌ Google sign-in gagal ip=%s: %v", getClientIP(r), err)
		writeGoogleError(w, err, "Google sign-in")
		return
	}
	switch {
	case res.NotLinked != nil:
		writeAuthJSON(w, http.StatusOK, map[string]any{
			"code":       codeGoogleNotLinked,
			"link_token": res.NotLinked.LinkToken,
			"email":      res.NotLinked.Email,
			"expires_in": int(auth.LinkTokenTTL.Seconds()),
		})
	case res.Conflict != nil:
		h.writeDeviceConflict(w, res.Conflict)
	default:
		log.Printf("[Auth] ✅ Google sign-in: user_id=%s ip=%s", res.Login.UserID, getClientIP(r))
		h.respondWithSession(w, r, http.StatusOK, res.Login.UserID, res.Login.Token)
	}
}

// --- POST /api/auth/google/register ---

type googleRegisterRequest struct {
	LinkToken   string `json:"link_token"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	googleDeviceFields
}

// GoogleRegister membuat akun baru (tanpa password) dari token penautan hasil GoogleSignIn.
func (h *AuthHandler) GoogleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAuthError(w, http.StatusMethodNotAllowed, codeValidation, "Method tidak diizinkan")
		return
	}
	if !h.googleReady(w) {
		return
	}
	var req googleRegisterRequest
	if !decodeGoogleBody(w, r, &req) {
		return
	}

	res, err := h.authSvc.GoogleRegister(r.Context(), authz.GoogleRegisterInput{
		LinkToken:   req.LinkToken,
		Username:    req.Username,
		DisplayName: req.DisplayName,
		Device:      h.googleDevice(r, req.googleDeviceFields),
	})
	if err != nil {
		log.Printf("[Auth] ❌ Google register gagal username=%q ip=%s: %v", strings.TrimSpace(req.Username), getClientIP(r), err)
		writeGoogleError(w, err, "Google register")
		return
	}
	log.Printf("[Auth] ✅ Google register: username=%q user_id=%s ip=%s", strings.TrimSpace(req.Username), res.UserID, getClientIP(r))
	h.respondWithSession(w, r, http.StatusCreated, res.UserID, res.Token)
}

// --- POST /api/auth/google/link ---

type googleLinkRequest struct {
	LinkToken string `json:"link_token"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	googleDeviceFields
}

// GoogleLinkExisting menautkan akun Google (dari token penautan) ke akun lama dengan username + password, lalu login.
func (h *AuthHandler) GoogleLinkExisting(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAuthError(w, http.StatusMethodNotAllowed, codeValidation, "Method tidak diizinkan")
		return
	}
	if !h.googleReady(w) {
		return
	}
	var req googleLinkRequest
	if !decodeGoogleBody(w, r, &req) {
		return
	}

	res, conflict, err := h.authSvc.GoogleLinkExisting(r.Context(), authz.GoogleLinkInput{
		LinkToken: req.LinkToken,
		Username:  req.Username,
		Password:  req.Password,
		Device:    h.googleDevice(r, req.googleDeviceFields),
	})
	if conflict != nil {
		h.writeDeviceConflict(w, conflict)
		return
	}
	if err != nil {
		log.Printf("[Auth] ❌ Google link gagal username=%q ip=%s: %v", strings.TrimSpace(req.Username), getClientIP(r), err)
		writeGoogleError(w, err, "Google link")
		return
	}
	h.linkFreeze.Invalidate(res.UserID)
	log.Printf("[Auth] ✅ Google link: username=%q user_id=%s ip=%s", strings.TrimSpace(req.Username), res.UserID, getClientIP(r))
	h.respondWithSession(w, r, http.StatusOK, res.UserID, res.Token)
}

// --- /api/auth/me/google (JWT) ---

type manageGoogleRequest struct {
	IDToken    string `json:"id_token"`     // POST: akun Google yang ditautkan; PUT: akun Google baru
	OldIDToken string `json:"old_id_token"` // PUT: bukti akun Google lama
	Password   string `json:"password"`     // DELETE: bukti kepemilikan akun
}

// ManageGoogle menangani tautan Google pada akun yang sedang login:
// POST = tautkan, PUT = ganti akun Google, DELETE = putuskan (butuh password).
func (h *AuthHandler) ManageGoogle(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeAuthError(w, http.StatusUnauthorized, codeServer, "Unauthorized")
		return
	}
	switch r.Method {
	case http.MethodPost, http.MethodPut, http.MethodDelete:
	default:
		writeAuthError(w, http.StatusMethodNotAllowed, codeValidation, "Method tidak diizinkan")
		return
	}
	if !h.googleReady(w) {
		return
	}
	var req manageGoogleRequest
	if !decodeGoogleBody(w, r, &req) {
		return
	}

	var err error
	switch r.Method {
	case http.MethodPost:
		err = h.authSvc.LinkGoogleToAccount(r.Context(), claims.UserID, req.IDToken)
	case http.MethodPut:
		err = h.authSvc.ReplaceGoogle(r.Context(), claims.UserID, req.OldIDToken, req.IDToken)
	case http.MethodDelete:
		err = h.authSvc.UnlinkGoogle(r.Context(), claims.UserID, req.Password)
	default:
		writeAuthError(w, http.StatusMethodNotAllowed, codeValidation, "Method tidak diizinkan")
		return
	}
	if err != nil {
		log.Printf("[Auth] ❌ Kelola Google (%s) gagal user_id=%s: %v", r.Method, claims.UserID, err)
		writeGoogleError(w, err, "Kelola Google")
		return
	}
	h.linkFreeze.Invalidate(claims.UserID) // status beku harus langsung mengikuti tautan baru/yang diputus
	log.Printf("[Auth] ✅ Kelola Google (%s) sukses user_id=%s", r.Method, claims.UserID)
	writeAuthJSON(w, http.StatusOK, map[string]any{"status": "ok", "google_linked": r.Method != http.MethodDelete})
}

// verifyOwnership memeriksa bukti kepemilikan untuk aksi sensitif: ID token Google segar ATAU password.
// Mengembalikan true bila lolos. Bila gagal, respons error sudah ditulis dengan kode status lama (401 untuk bukti salah).
func (h *AuthHandler) verifyOwnership(w http.ResponseWriter, r *http.Request, userID, password, googleIDToken, wrongPasswordMsg string) bool {
	if strings.TrimSpace(googleIDToken) != "" {
		if h.authSvc == nil {
			writeAuthError(w, http.StatusServiceUnavailable, codeGoogleNotConfigured, "Login Google belum tersedia")
			return false
		}
		if err := h.authSvc.VerifyGoogleReauth(r.Context(), userID, googleIDToken); err != nil {
			writeGoogleError(w, err, "Re-auth Google")
			return false
		}
		return true
	}
	valid, err := h.userStore.VerifyPassword(userID, password)
	if err != nil || !valid {
		writeAuthError(w, http.StatusUnauthorized, codeInvalidCredentials, wrongPasswordMsg)
		return false
	}
	return true
}
