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
