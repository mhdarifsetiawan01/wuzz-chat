// Package authz — AuthService adalah Application Service yang mengelola
// semua use cases Authentication & Authorization.
//
// AuthService tidak mengandung HTTP parsing atau response formatting.
// Transport layer (auth_handler.go) bertanggung jawab atas itu.
package authz

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	sharedvalidator "github.com/bms-del112/wuzz-chat/internal/shared/validator"
	"golang.org/x/crypto/bcrypt"
)

// SessionKicker adalah interface minimal untuk menendang koneksi WebSocket.
// Diimplementasikan oleh *ws.Hub — menggunakan interface untuk menghindari
// circular import antara authz/ dan ws/.
type SessionKicker interface {
	KickClientByUserID(userID, exceptDeviceID, closeMessage string)
	KickClientByDeviceID(userID, deviceID, closeMessage string)
}

// AuthService mengorkestrasi use cases Auth & Identity.
// Tidak ada HTTP concerns di sini — hanya business logic murni.
type AuthService struct {
	repo   AuthRepository
	kicker SessionKicker // optional, bisa nil jika Hub belum diinit
}

// NewAuthService membuat instance AuthService baru.
// kicker boleh nil — operasi kick akan di-skip jika nil.
func NewAuthService(repo AuthRepository, kicker SessionKicker) *AuthService {
	return &AuthService{
		repo:   repo,
		kicker: kicker,
	}
}

// SetSessionKicker menyuntikkan implementasi SessionKicker setelah service dibuat.
// Diperlukan untuk menghindari circular dependency saat wiring di main.go.
func (s *AuthService) SetSessionKicker(kicker SessionKicker) {
	s.kicker = kicker
}

// SetRepository menyuntikkan atau memperbarui implementasi AuthRepository.
func (s *AuthService) SetRepository(repo AuthRepository) {
	s.repo = repo
}


// --- Register Use Case ---

// RegisterInput adalah input untuk use case Register.
type RegisterInput struct {
	Username    string
	DisplayName string
	Password    string
	DeviceID    string
	UserAgent   string
	IP          string
}

// Register memvalidasi input, membuat user baru, menghasilkan token JWT,
// menyimpan sesi, dan mendaftarkan device.
// Mengembalikan RegisterResult atau error yang sudah ter-type sesuai business rule.
func (s *AuthService) Register(input RegisterInput) (*RegisterResult, error) {
	username := strings.TrimSpace(input.Username)
	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		displayName = username
	}

	// Validasi input (panjang, karakter, filter kata terlarang)
	if err := sharedvalidator.ValidateRegistration(username, displayName, input.Password); err != nil {
		return nil, err
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// Buat user
	userID, err := s.repo.CreateUser(username, displayName)
	if err != nil {
		return nil, err
	}

	// Simpan credential
	if err := s.repo.CreateCredential(userID, string(hash)); err != nil {
		log.Printf("⚠️ [AuthService.Register] Gagal menyimpan credential untuk user %s: %v", userID, err)
		return nil, err
	}

	// Generate JWT
	tokenStr, claims, err := auth.GenerateTokenDetailed(userID, username, displayName)
	if err != nil {
		return nil, err
	}

	// Simpan sesi
	if claims != nil && strings.TrimSpace(input.DeviceID) != "" {
		if err := s.repo.CreateSession(
			claims.ID, userID,
			strings.TrimSpace(input.DeviceID),
			input.UserAgent, input.IP,
			claims.ExpiresAt.Time,
		); err != nil {
			log.Printf("⚠️ [AuthService.Register] Gagal mencatat sesi (user: %s): %v", userID, err)
		}
	}

	// Daftarkan device
	if strings.TrimSpace(input.DeviceID) != "" {
		if err := s.repo.UpsertDevice(
			strings.TrimSpace(input.DeviceID), userID,
			parseDeviceName(input.UserAgent), "web",
		); err != nil {
			log.Printf("⚠️ [AuthService.Register] Gagal mendaftarkan device (user: %s, device: %s): %v", userID, input.DeviceID, err)
		}
	}

	return &RegisterResult{
		Token:  tokenStr,
		JTI:    claims.ID,
		UserID: userID,
	}, nil
}

// --- Login Use Case ---

// LoginInput adalah input untuk use case Login.
type LoginInput struct {
	Username        string
	Password        string
	DeviceID        string
	ConfirmOverride bool
	KickDeviceID    string
	UserAgent       string
	IP              string
}

const maxActiveDevices = 2

// Login mengautentikasi user, memeriksa kuota device, dan menghasilkan token JWT.
// Jika device baru melebihi kuota dan ConfirmOverride=false, mengembalikan *DeviceConflict.
// Jika ConfirmOverride=true, melakukan kick device tertua sebelum login.
func (s *AuthService) Login(input LoginInput) (*LoginResult, *DeviceConflict, error) {
	username := strings.TrimSpace(input.Username)
	reqDeviceID := strings.TrimSpace(input.DeviceID)

	// Lookup user
	userID, _, err := s.repo.GetUserByUsername(username)
	if err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	// Verifikasi password
	ok, err := s.repo.VerifyPasswordByUserID(userID, input.Password)
	if err != nil || !ok {
		return nil, nil, ErrInvalidCredentials
	}

	// Cek kuota device aktif
	if reqDeviceID != "" {
		devices, err := s.repo.GetUserDevices(userID)
		if err == nil {
			var isExistingDevice bool
			for _, d := range devices {
				if d.ID == reqDeviceID {
					isExistingDevice = true
					break
				}
			}

			if !isExistingDevice && len(devices) >= maxActiveDevices {
				if !input.ConfirmOverride {
					// Kembalikan konflik — handler handle HTTP 409
					return nil, &DeviceConflict{
						ExistingDeviceID: devices[len(devices)-1].ID,
					}, nil
				}

				// ConfirmOverride=true: kick device yang dipilih atau tertua
				kickDeviceID := strings.TrimSpace(input.KickDeviceID)
				if kickDeviceID == "" && len(devices) > 0 {
					kickDeviceID = devices[len(devices)-1].ID
				}

				if kickDeviceID != "" {
					_ = s.repo.DeactivateDevice(kickDeviceID, userID)
					// Tendang WS jika ada
					if s.kicker != nil {
						s.kicker.KickClientByDeviceID(userID, kickDeviceID, "SESSION_REPLACED: Akun Anda dibuka dari perangkat baru.")
					}
				}
			}
		}
	}

	// Lookup displayname & username untuk token
	_, displayName, err := s.repo.GetUserByUsername(username)
	if err != nil {
		displayName = username
	}

	// Generate JWT
	tokenStr, claims, err := auth.GenerateTokenDetailed(userID, username, displayName)
	if err != nil {
		return nil, nil, err
	}

	// Simpan sesi
	if claims != nil && reqDeviceID != "" {
		if err := s.repo.CreateSession(
			claims.ID, userID, reqDeviceID,
			input.UserAgent, input.IP,
			claims.ExpiresAt.Time,
		); err != nil {
			log.Printf("⚠️ [AuthService.Login] Gagal mencatat sesi (user: %s): %v", userID, err)
		}
	}

	// Daftarkan/perbarui device
	if reqDeviceID != "" {
		if err := s.repo.UpsertDevice(
			reqDeviceID, userID,
			parseDeviceName(input.UserAgent), "web",
		); err != nil {
			log.Printf("⚠️ [AuthService.Login] Gagal mendaftarkan device (user: %s, device: %s): %v", userID, reqDeviceID, err)
		}
	}

	return &LoginResult{
		Token:    tokenStr,
		JTI:      claims.ID,
		UserID:   userID,
		DeviceID: reqDeviceID,
	}, nil, nil
}

// --- Logout Use Case ---

// LogoutInput adalah input untuk use case Logout.
type LogoutInput struct {
	JTI      string
	UserID   string
	DeviceID string
	TokenExp time.Time
}

// Logout mencabut token JTI, merevoke sesi, dan melepaskan active_device_id.
func (s *AuthService) Logout(input LogoutInput) error {
	// Revoke JTI
	if input.JTI != "" {
		exp := input.TokenExp
		if exp.IsZero() {
			exp = time.Now().Add(7 * 24 * time.Hour)
		}
		if err := s.repo.RevokeToken(input.JTI, exp); err != nil {
			log.Printf("⚠️ [AuthService.Logout] Gagal mencabut token jti %s: %v", input.JTI, err)
		}
		if err := s.repo.RevokeSession(input.JTI, input.UserID); err != nil {
			log.Printf("⚠️ [AuthService.Logout] Gagal mencabut sesi %s: %v", input.JTI, err)
		}
	}

	// Lepas active_device_id (device-aware: hanya clear jika deviceID cocok)
	if err := s.repo.ClearActiveDevice(input.UserID, input.DeviceID); err != nil {
		return err
	}
	return nil
}

// --- GetActiveSessions Use Case ---

// GetActiveSessions mengambil daftar sesi aktif user. currentJTI digunakan untuk menandai sesi saat ini.
func (s *AuthService) GetActiveSessions(userID, currentJTI string) ([]SessionInfo, error) {
	sessions, err := s.repo.GetActiveSessions(userID)
	if err != nil {
		return nil, err
	}
	// Tandai sesi yang sedang aktif
	for i := range sessions {
		if sessions[i].ID == currentJTI {
			sessions[i].IsCurrent = true
		}
	}
	return sessions, nil
}

// --- RevokeSession Use Case ---

// RevokeSession mencabut satu sesi berdasarkan sessionID (JTI).
// Hanya mencabut jika sesi tersebut milik actorUserID (IDOR guard).
func (s *AuthService) RevokeSession(sessionID, actorUserID string) error {
	if err := s.repo.RevokeSession(sessionID, actorUserID); err != nil {
		return err
	}
	if err := s.repo.RevokeToken(sessionID, time.Now().Add(7*24*time.Hour)); err != nil {
		log.Printf("⚠️ [AuthService.RevokeSession] Gagal mencabut token untuk sesi %s: %v", sessionID, err)
	}
	return nil
}

// --- RevokeAllOtherSessions Use Case ---

// RevokeAllOtherSessions mencabut semua sesi user kecuali exceptJTI.
// Jika currentDeviceID disertakan, kick WS perangkat lain.
func (s *AuthService) RevokeAllOtherSessions(userID, exceptJTI, currentDeviceID string) error {
	if err := s.repo.RevokeAllSessions(userID, exceptJTI); err != nil {
		return err
	}
	if s.kicker != nil && currentDeviceID != "" {
		s.kicker.KickClientByUserID(userID, currentDeviceID, "SESSION_REVOKED: Sesi login Anda telah dicabut dari jarak jauh.")
	}
	return nil
}

// --- ChangePassword Use Case ---

// ChangePasswordInput adalah input untuk use case ChangePassword.
type ChangePasswordInput struct {
	UserID      string
	OldPassword string
	NewPassword string
	CurrentJTI  string
	TokenExp    time.Time
}

// ChangePassword memverifikasi password lama, memperbarui ke baru, dan merevoke semua sesi.
func (s *AuthService) ChangePassword(input ChangePasswordInput) error {
	// 1. Verifikasi password lama
	ok, err := s.repo.VerifyPasswordByUserID(input.UserID, input.OldPassword)
	if err != nil || !ok {
		return ErrInvalidCredentials
	}

	// 2. Validasi password baru
	if err := sharedvalidator.ValidatePassword(input.NewPassword); err != nil {
		return err
	}

	if input.OldPassword == input.NewPassword {
		return ErrSamePassword
	}

	// 3. Hash password baru
	newHash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	// 4. Update database
	if err := s.repo.UpdatePassword(input.UserID, string(newHash), time.Now().UTC()); err != nil {
		return err
	}

	// 5. Revoke token aktif
	if input.CurrentJTI != "" {
		exp := input.TokenExp
		if exp.IsZero() {
			exp = time.Now().Add(7 * 24 * time.Hour)
		}
		_ = s.repo.RevokeToken(input.CurrentJTI, exp)
	}
	_ = s.repo.RevokeAllSessions(input.UserID, "")

	return nil
}

// --- Transfer Use Case ---

// CreateTransferToken membuat token transfer E2EE ephemeral untuk migrasi kunci antar perangkat.
func (s *AuthService) CreateTransferToken(userID, encryptedBundle string) (string, error) {
	token := generateSecureToken()
	ttl := 5 * time.Minute
	if err := s.repo.CreateTransferToken(userID, token, encryptedBundle, ttl); err != nil {
		return "", err
	}
	return token, nil
}

// ConsumeTransferToken mengambil dan menghapus token transfer (atomic single-use).
// Setelah berhasil, menendang koneksi WS perangkat lama jika diperlukan.
func (s *AuthService) ConsumeTransferToken(token, targetUserID, newDeviceID string) (*TransferResult, error) {
	record, err := s.repo.ConsumeTransferToken(token, targetUserID, newDeviceID)
	if err != nil {
		return nil, err
	}

	return &TransferResult{
		UserID:          record.UserID,
		EncryptedBundle: record.EncryptedBundle,
	}, nil
}

// --- Domain Errors ---

var (
	ErrInvalidCredentials = domainError("username atau password salah")
	ErrSamePassword       = domainError("password baru tidak boleh sama dengan password lama")
)

type domainError string

func (e domainError) Error() string { return string(e) }

// --- Helpers ---

// parseDeviceName membaca User-Agent string dan mengembalikan nama ramah untuk perangkat.
func parseDeviceName(userAgent string) string {
	ua := strings.ToLower(userAgent)

	osName := "Unknown OS"
	switch {
	case strings.Contains(ua, "windows"):
		osName = "Windows"
	case strings.Contains(ua, "iphone"):
		osName = "iPhone"
	case strings.Contains(ua, "ipad"):
		osName = "iPad"
	case strings.Contains(ua, "android"):
		osName = "Android"
	case strings.Contains(ua, "mac os"):
		osName = "Mac"
	case strings.Contains(ua, "linux"):
		osName = "Linux"
	}

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

	return browser + " on " + osName
}

// generateSecureToken membuat token string acak 32-byte URL-safe (base64 URL encoding).
func generateSecureToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}
