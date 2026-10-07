// Package authz — AuthService adalah Application Service yang mengelola
// semua use cases Authentication & Authorization.
//
// AuthService tidak mengandung HTTP parsing atau response formatting.
// Transport layer (auth_handler.go) bertanggung jawab atas itu.
package authz

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz/google"
	sharederrors "github.com/bms-del112/wuzz-chat/internal/shared/errors"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
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

	// Login Google (opsional; lihat SetGoogleAuth). Sengaja di luar AuthRepository agar tidak ikut tergantikan
	// saat SetRepository dipanggil.
	googleVerifier google.Verifier
	oauth          OAuthStore
	now            func() time.Time // hanya untuk tes; nil = time.Now

	// suspension menolak login/refresh akun yang ditangguhkan moderator (nil = tidak ada penangguhan).
	suspension *SuspensionPolicy
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

// SetSuspension menyuntikkan kebijakan penangguhan akun (opsional).
func (s *AuthService) SetSuspension(p *SuspensionPolicy) {
	s.suspension = p
}

// SetRepository menyuntikkan atau memperbarui implementasi AuthRepository.
func (s *AuthService) SetRepository(repo AuthRepository) {
	s.repo = repo
}


// --- Register Use Case ---

// RegisterInput adalah input untuk use case Register.
type RegisterInput struct {
	Ctx         context.Context
	Username    string
	DisplayName string
	Password    string
	DeviceID    string
	Platform    string // "web" | "android" | "ios"
	UserAgent   string
	IP          string
}

// Register memvalidasi input, membuat user baru, menghasilkan token JWT,
// menyimpan sesi, dan mendaftarkan device.
// Mengembalikan RegisterResult atau error yang sudah ter-type sesuai business rule.
func (s *AuthService) Register(input RegisterInput) (*RegisterResult, error) {
	ctx := input.Ctx
	if ctx == nil {
		ctx = context.Background()
	}
	tenantID := tenantshared.MustFromContext(ctx).TenantID()

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

	// Buat user (tenant-aware via context)
	userID, err := s.repo.CreateUserWithContext(ctx, username, displayName)
	if err != nil {
		return nil, err
	}

	// Simpan credential
	if err := s.repo.CreateCredential(userID, string(hash)); err != nil {
		log.Printf("⚠️ [AuthService.Register] Gagal menyimpan credential untuk user %s: %v", userID, err)
		return nil, err
	}

	// Generate JWT dengan tenant ID dan default systemRole 'user'
	tokenStr, claims, err := auth.GenerateTokenDetailedWithTenantAndRole(userID, username, displayName, tenantID, "user")
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
		platform := resolvePlatform(input.Platform, input.UserAgent)
		deviceName := parseDeviceName(input.UserAgent, platform)
		if err := s.repo.UpsertDevice(
			strings.TrimSpace(input.DeviceID), userID,
			deviceName, platform,
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
	Ctx             context.Context
	Username        string
	Password        string
	DeviceID        string
	Platform        string // "web" | "android" | "ios"
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
	ctx := input.Ctx
	if ctx == nil {
		ctx = context.Background()
	}
	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	username := strings.TrimSpace(input.Username)
	reqDeviceID := strings.TrimSpace(input.DeviceID)

	// Lookup user (tenant-aware via context)
	userID, displayName, err := s.repo.GetUserByUsernameWithContext(ctx, username)
	if err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	// Verifikasi password
	ok, err := s.repo.VerifyPasswordByUserID(userID, input.Password)
	if err != nil || !ok {
		return nil, nil, ErrInvalidCredentials
	}

	return s.finishLogin(ctx, tenantID, userID, username, displayName, loginDevice{
		DeviceID:        reqDeviceID,
		Platform:        input.Platform,
		ConfirmOverride: input.ConfirmOverride,
		KickDeviceID:    input.KickDeviceID,
		UserAgent:       input.UserAgent,
		IP:              input.IP,
	})
}

// loginDevice membawa data perangkat/klien yang dipakai finishLogin.
type loginDevice struct {
	DeviceID        string // sudah di-trim
	Platform        string
	ConfirmOverride bool
	KickDeviceID    string
	UserAgent       string
	IP              string
}

// finishLogin dijalankan setelah kredensial (password atau Google) terbukti sah: memeriksa kuota perangkat,
// menerbitkan JWT, mencatat sesi, dan mendaftarkan perangkat. Dipakai bersama oleh semua metode login.
func (s *AuthService) finishLogin(ctx context.Context, tenantID, userID, username, displayName string, dev loginDevice) (*LoginResult, *DeviceConflict, error) {
	reqDeviceID := dev.DeviceID

	// Kredensial sudah terbukti sah; akun yang ditangguhkan tidak boleh mendapat token baru lewat jalur apa pun.
	if s.suspension.IsSuspended(ctx, userID) {
		return nil, nil, ErrAccountSuspended
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
				if !dev.ConfirmOverride {
					// Kembalikan konflik — handler handle HTTP 409
					return nil, &DeviceConflict{
						ExistingDeviceID: devices[len(devices)-1].ID,
						UserID:           userID,
					}, nil
				}

				// ConfirmOverride=true: kick device yang dipilih atau tertua
				kickDeviceID := strings.TrimSpace(dev.KickDeviceID)
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

	systemRole := "user"
	if p, err := s.repo.GetUserByID(ctx, userID); err == nil && p != nil && p.SystemRole != "" {
		systemRole = p.SystemRole
	}

	// Generate JWT dengan tenant ID dan system_role
	tokenStr, claims, err := auth.GenerateTokenDetailedWithTenantAndRole(userID, username, displayName, tenantID, systemRole)
	if err != nil {
		return nil, nil, err
	}

	// Simpan sesi
	if claims != nil && reqDeviceID != "" {
		if err := s.repo.CreateSession(
			claims.ID, userID, reqDeviceID,
			dev.UserAgent, dev.IP,
			claims.ExpiresAt.Time,
		); err != nil {
			log.Printf("⚠️ [AuthService.Login] Gagal mencatat sesi (user: %s): %v", userID, err)
		}
	}

	// Daftarkan/perbarui device
	if reqDeviceID != "" {
		platform := resolvePlatform(dev.Platform, dev.UserAgent)
		deviceName := parseDeviceName(dev.UserAgent, platform)
		if err := s.repo.UpsertDevice(
			reqDeviceID, userID,
			deviceName, platform,
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
			exp = time.Now().Add(auth.TokenLifetime)
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
	if err := s.repo.RevokeToken(sessionID, time.Now().Add(auth.TokenLifetime)); err != nil {
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
			exp = time.Now().Add(auth.TokenLifetime)
		}
		_ = s.repo.RevokeToken(input.CurrentJTI, exp)
	}
	_ = s.repo.RevokeAllSessions(input.UserID, "")

	return nil
}

// --- Device Use Cases ---

// GetUserDevices mengambil semua perangkat aktif milik user.
func (s *AuthService) GetUserDevices(userID string) ([]DeviceRecord, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, domainError("unauthorized")
	}
	return s.repo.GetUserDevices(userID)
}

// DeactivateDevice menonaktifkan perangkat milik user.
func (s *AuthService) DeactivateDevice(deviceID, userID string) error {
	if strings.TrimSpace(deviceID) == "" || strings.TrimSpace(userID) == "" {
		return domainError("invalid device or user id")
	}
	return s.repo.DeactivateDevice(deviceID, userID)
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

// resolvePlatform menentukan platform perangkat ("web", "android", "ios").
// Mengutamakan parameter eksplisit, dengan fallback auto-detection dari User-Agent.
func resolvePlatform(platform, userAgent string) string {
	p := strings.ToLower(strings.TrimSpace(platform))
	switch p {
	case "android", "ios", "web":
		return p
	}

	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "android"):
		return "android"
	case strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") || strings.Contains(ua, "ios"):
		return "ios"
	default:
		return "web"
	}
}

// parseDeviceName membaca User-Agent string dan mengembalikan nama ramah untuk perangkat.
func parseDeviceName(userAgent, platform string) string {
	ua := strings.ToLower(userAgent)
	if strings.TrimSpace(ua) == "" {
		switch platform {
		case "android":
			return "Android Device"
		case "ios":
			return "iOS Device"
		default:
			return "Web Client"
		}
	}

	// Aplikasi mobile native: UA-nya memuat "Android" sehingga tanpa ini tampil "Browser on Android" di daftar perangkat.
	if strings.Contains(ua, "wuzzchat") || strings.Contains(ua, "okhttp") || strings.Contains(ua, "react-native") || strings.Contains(ua, "expo") {
		if strings.Contains(ua, "ios") || strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
			return "Aplikasi WuzzChat di iOS"
		}
		return "Aplikasi WuzzChat di Android"
	}

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

// --- Identity & User Lookup Use Cases ---

// SearchUsers mencari user lain untuk diajak chat (mengecualikan requesterID).
func (s *AuthService) SearchUsers(ctx context.Context, query, requesterID string) ([]UserSummary, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return []UserSummary{}, nil
	}
	return s.repo.SearchUsers(ctx, trimmed, requesterID)
}

// GetUserProfile mengambil profil publik user berdasarkan userID atau username.
func (s *AuthService) GetUserProfile(ctx context.Context, userID, username string) (*UserProfile, error) {
	cleanUID := strings.TrimSpace(userID)
	if cleanUID != "" {
		profile, err := s.repo.GetUserByID(ctx, cleanUID)
		if err != nil {
			return nil, err
		}
		if profile == nil {
			return nil, sharederrors.ErrNotFound
		}
		return profile, nil
	}

	cleanUName := strings.TrimSpace(username)
	if cleanUName != "" {
		cleanUName = strings.TrimPrefix(cleanUName, "@")
		profile, err := s.repo.GetUserByUsernameOrDisplayName(ctx, cleanUName)
		if err != nil {
			return nil, err
		}
		if profile == nil {
			return nil, sharederrors.ErrNotFound
		}
		return profile, nil
	}

	return nil, sharederrors.ErrInvalidInput
}


// --- Refresh Token Use Case (sliding renewal) ---

// ErrSessionExpired berarti sesi sudah melewati batas absolut (auth.MaxSessionAge) atau sesinya sudah tidak aktif.
var ErrSessionExpired = errors.New("sesi berakhir, silakan login ulang")

// RefreshInput adalah input untuk use case RefreshToken.
type RefreshInput struct {
	Claims    *auth.UserClaims // klaim token yang sudah divalidasi RequireJWT (belum kedaluwarsa & tidak dicabut)
	UserAgent string
	IP        string
}

// RefreshResult: Refreshed=false berarti token masih panjang sisa umurnya dan klien tetap memakai token lama.
type RefreshResult struct {
	Refreshed bool
	Token     string
	JTI       string
	ExpiresAt time.Time
}

// RefreshToken menerbitkan token baru bagi sesi yang masih sah bila sisa masa berlaku token kurang dari
// auth.RefreshWindow. Token lama dibiarkan habis alami (request yang sedang berjalan tidak gagal); record sesinya
// dicabut agar daftar sesi hanya menampilkan sesi baru. Refresh tidak menambah perangkat.
func (s *AuthService) RefreshToken(input RefreshInput) (*RefreshResult, error) {
	old := input.Claims
	if old == nil || old.ExpiresAt == nil {
		return nil, ErrSessionExpired
	}
	if s.suspension.IsSuspended(context.Background(), old.UserID) {
		return nil, ErrAccountSuspended
	}

	// Batas absolut sejak login awal.
	if time.Since(old.EffectiveAuthTime()) > auth.MaxSessionAge {
		return nil, ErrSessionExpired
	}

	// Token masih segar: tidak perlu diperbarui.
	if time.Until(old.ExpiresAt.Time) > auth.RefreshWindow {
		return &RefreshResult{Refreshed: false, ExpiresAt: old.ExpiresAt.Time}, nil
	}

	// Sesi harus masih tercatat aktif dan perangkatnya belum dikeluarkan.
	sessions, err := s.repo.GetActiveSessions(old.UserID)
	if err != nil {
		return nil, err
	}
	deviceID := ""
	for _, sess := range sessions {
		if sess.ID == old.ID {
			deviceID = sess.DeviceID
			break
		}
	}
	if deviceID == "" {
		return nil, ErrSessionExpired
	}
	devices, err := s.repo.GetUserDevices(old.UserID)
	if err != nil {
		return nil, err
	}
	deviceActive := false
	for _, d := range devices {
		if d.ID == deviceID {
			deviceActive = true
			break
		}
	}
	if !deviceActive {
		return nil, ErrSessionExpired
	}

	tokenStr, claims, err := auth.GenerateRefreshedToken(old)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateSession(claims.ID, old.UserID, deviceID, input.UserAgent, input.IP, claims.ExpiresAt.Time); err != nil {
		return nil, err
	}
	if err := s.repo.RevokeSession(old.ID, old.UserID); err != nil {
		log.Printf("⚠️ [AuthService.RefreshToken] Gagal mencabut record sesi lama %s: %v", old.ID, err)
	}

	return &RefreshResult{Refreshed: true, Token: tokenStr, JTI: claims.ID, ExpiresAt: claims.ExpiresAt.Time}, nil
}
