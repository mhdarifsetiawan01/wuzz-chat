// Package authz menyediakan domain Authentication & Authorization.
// Ini adalah Application Layer yang mengelola use cases:
// login, register, logout, session management, device management, dan device transfer.
//
// Dependency Direction (Clean Architecture):
//
//	Transport (auth_handler.go) → authz.AuthService → authz.AuthRepository (interface)
//	                                                  ↑
//	                                      authz/infra/sql_repository.go (implementation)
package authz

import "time"

// --- Login & Register Results ---

// RegisterResult dikembalikan saat registrasi berhasil.
type RegisterResult struct {
	Token  string
	JTI    string
	UserID string
}

// LoginResult dikembalikan saat login berhasil.
type LoginResult struct {
	Token    string
	JTI      string
	UserID   string
	DeviceID string
}

// DeviceConflict dikembalikan saat login mendeteksi perangkat aktif lain.
// Handler harus mengembalikan HTTP 409 Conflict dan menyertakan data ini.
type DeviceConflict struct {
	ExistingDeviceID string
}

// TransferResult dikembalikan saat consume transfer token berhasil.
type TransferResult struct {
	UserID          string
	EncryptedBundle string
}

// --- Session & Device Entities ---

// SessionInfo merepresentasikan satu sesi aktif yang dikembalikan ke pengguna.
type SessionInfo struct {
	ID        string
	DeviceID  string
	UserAgent string
	IP        string
	CreatedAt time.Time
	IsCurrent bool
}

// --- Identity & User Lookup Entities ---

// UserSummary merepresentasikan ringkasan profil user untuk hasil pencarian kontak.
type UserSummary struct {
	ID            string `json:"id"`
	Username      string `json:"username"`
	DisplayName   string `json:"display_name"`
	StatusMessage string `json:"status_message"`
	AvatarURL     string `json:"avatar_url"`
	IsVerified    bool   `json:"is_verified"`
	PublicKey     string `json:"public_key,omitempty"`
}

// UserProfile merepresentasikan profil publik lengkap dari seorang pengguna.
type UserProfile struct {
	ID             string    `json:"id"`
	Username       string    `json:"username"`
	DisplayName    string    `json:"display_name"`
	StatusMessage  string    `json:"status_message"`
	AvatarURL      string    `json:"avatar_url"`
	IsVerified     bool      `json:"is_verified"`
	PublicKey      string    `json:"public_key,omitempty"`
	KeyVersion     int       `json:"key_version,omitempty"`
	ActiveDeviceID string    `json:"active_device_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

