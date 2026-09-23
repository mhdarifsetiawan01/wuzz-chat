package authz

import "time"

// AuthRepository mendefinisikan semua operasi data yang dibutuhkan oleh AuthService.
// Implementasi ada di authz/infra/sql_repository.go (adapter ke store lama).
//
// Setiap method group sesuai sub-domain:
//   - Identity: lookup & create user
//   - Credential: password management
//   - Session: sesi JWT per perangkat
//   - Device: device registry
//   - Token: JTI revocation
//   - Transfer: device key transfer
type AuthRepository interface {
	// --- Identity ---

	// GetUserByUsername mencari user berdasarkan username (case-insensitive).
	// Mengembalikan (userID, displayName, error).
	GetUserByUsername(username string) (userID string, displayName string, err error)

	// CreateUser membuat user baru dan mengembalikan userID (UUID).
	CreateUser(username, displayName string) (userID string, err error)

	// GetActiveDeviceID mengembalikan active_device_id dari tabel users.
	GetActiveDeviceID(userID string) (deviceID string, err error)

	// UpdateActiveDevice menyetel active_device_id untuk user.
	UpdateActiveDevice(userID, deviceID string) error

	// ClearActiveDevice mengosongkan active_device_id jika deviceID cocok (device-aware logout).
	ClearActiveDevice(userID, deviceID string) error

	// --- Credential ---

	// GetPasswordHash mengambil bcrypt password hash dari user_credentials.
	GetPasswordHash(userID string) (hash string, err error)

	// CreateCredential membuat record credential baru (password) untuk user.
	CreateCredential(userID, passwordHash string) error

	// UpdatePassword memperbarui bcrypt password hash dan mencatat revocation timestamp.
	UpdatePassword(userID, newHash string, revokedAt time.Time) error

	// VerifyPasswordByUserID memvalidasi password plain vs hash di database.
	// Mengembalikan true jika cocok.
	VerifyPasswordByUserID(userID, plainPassword string) (bool, error)

	// --- Session ---

	// CreateSession menyimpan record sesi baru.
	CreateSession(jti, userID, deviceID, userAgent, ip string, expiresAt time.Time) error

	// GetActiveSessions mengambil semua sesi aktif (non-revoked) untuk user.
	GetActiveSessions(userID string) ([]SessionInfo, error)

	// RevokeSession mencabut satu sesi berdasarkan JTI dan userID.
	RevokeSession(jti, userID string) error

	// RevokeAllSessions mencabut semua sesi user kecuali exceptJTI (digunakan saat ganti password).
	RevokeAllSessions(userID, exceptJTI string) error

	// --- Token Revocation ---

	// RevokeToken menambahkan JTI ke blacklist token.
	RevokeToken(jti string, expiresAt time.Time) error

	// IsTokenRevoked memeriksa apakah JTI ada di blacklist.
	IsTokenRevoked(jti string) (bool, error)

	// IsUserRevokedBefore memeriksa apakah semua token user sebelum waktu tertentu telah direvoke.
	IsUserRevokedBefore(userID string, issuedAt time.Time) (bool, error)

	// --- Device ---

	// UpsertDevice menyimpan atau memperbarui record device (idempotent).
	UpsertDevice(deviceID, userID, name, platform string) error

	// GetUserDevices mengambil semua device aktif milik user.
	GetUserDevices(userID string) ([]DeviceRecord, error)

	// DeactivateDevice menonaktifkan device berdasarkan deviceID.
	DeactivateDevice(deviceID, userID string) error

	// --- Transfer ---

	// CreateTransferToken menyimpan token transfer E2EE ephemeral (TTL 5 menit).
	CreateTransferToken(userID, token, encryptedBundle string, ttl time.Duration) error

	// ConsumeTransferToken mengambil dan menghapus token transfer (atomic single-use).
	ConsumeTransferToken(token, targetUserID, targetDeviceID string) (*TransferRecord, error)
}

// DeviceRecord merepresentasikan satu perangkat terdaftar milik user.
type DeviceRecord struct {
	ID         string
	UserID     string
	Name       string
	Platform   string
	IsActive   bool
	LastSeenAt time.Time
}

// TransferRecord merepresentasikan data yang dikembalikan saat consume transfer token.
type TransferRecord struct {
	UserID          string
	EncryptedBundle string
}
