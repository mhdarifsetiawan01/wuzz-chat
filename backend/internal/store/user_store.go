package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists   = errors.New("username sudah digunakan")
	ErrUserNotFound = errors.New("user tidak ditemukan")
	ErrInvalidPass  = errors.New("password salah")
	ErrKeyConflict  = errors.New("KEY_ALREADY_REGISTERED")
)

// User merepresentasikan entitas akun user terdaftar.
type User struct {
	ID             string    `json:"id"`
	TenantID       string    `json:"tenant_id,omitempty"`
	ExternalUserID string    `json:"external_user_id,omitempty"`
	Username       string    `json:"username"`
	DisplayName    string    `json:"display_name"`
	PasswordHash   string    `json:"-"`
	StatusMessage  string    `json:"status_message"`
	AvatarURL      string    `json:"avatar_url"`
	IsVerified     bool      `json:"is_verified"`
	PublicKey      string    `json:"public_key,omitempty"`
	KeyVersion     int       `json:"key_version,omitempty"`
	ActiveDeviceID string    `json:"active_device_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// ConversationItem merepresentasikan entitas percakapan di daftar obrolan (Sidebar).
type ConversationItem struct {
	ID             string    `json:"id"`
	TenantID       string    `json:"tenant_id,omitempty"`
	Type           string    `json:"type"` // "direct" atau "group"
	Title          string    `json:"title"`
	AvatarURL      string    `json:"avatar_url,omitempty"`
	Description    string    `json:"description,omitempty"`
	IsPublic       bool      `json:"is_public,omitempty"`
	GroupUsername  string    `json:"group_username,omitempty"`
	ParentID       string    `json:"parent_id,omitempty"`
	Role           string    `json:"role,omitempty"`
	PeerID         string    `json:"peer_id,omitempty"`
	PeerNickname   string    `json:"peer_nickname,omitempty"`
	PeerPublicKey  string    `json:"peer_public_key,omitempty"`
	PeerAvatarURL  string    `json:"peer_avatar_url,omitempty"`
	PeerIsVerified bool      `json:"peer_is_verified,omitempty"`
	LastMessage    string    `json:"last_message"`
	LastSender     string    `json:"last_sender"`
	LastSenderID   string     `json:"last_sender_id,omitempty"`
	LastStatus     string     `json:"last_status,omitempty"`
	IsPinned       bool       `json:"is_pinned"`
	PinnedAt       *time.Time `json:"pinned_at,omitempty"`
	UnreadCount    int        `json:"unread_count"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// PushSubscription merepresentasikan entitas token/kunci push notification per perangkat.
type PushSubscription struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Platform  string    `json:"platform"` // "web", "android", "ios"
	Endpoint  string    `json:"endpoint"`
	P256dhKey string    `json:"p256dh_key,omitempty"`
	AuthKey   string    `json:"auth_key,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// UserStore mendefinisikan kontrak operasi user dan percakapan.
type UserStore interface {
	Register(username, displayName, password string) (*User, error)
	RegisterWithContext(ctx context.Context, username, displayName, password string) (*User, error)
	Authenticate(username, password string) (*User, error)
	GetUserByID(id string) (*User, error)
	GetByExternalIDWithContext(ctx context.Context, externalUserID string) (*User, error)
	UpsertExternalUserWithContext(ctx context.Context, externalUserID, displayName, avatarURL string) (*User, error)
	GetUserByUsername(username string) (*User, error)
	GetUserByUsernameWithContext(ctx context.Context, username string) (*User, error)
	GetUserByUsernameOrDisplayName(name string) (*User, error)
	GetUserByUsernameOrDisplayNameWithContext(ctx context.Context, name string) (*User, error)
	UpdateProfile(userID, displayName, statusMessage, avatarURL string) (*User, error)
	UpdatePublicKey(userID, publicKey string) error
	UpdatePublicKeyWithDevice(userID, publicKey, deviceID string) (int, error)
	ForceResetPublicKey(userID, publicKey, deviceID string) (int, error)
	ClearActiveDevice(userID string, deviceID ...string) error
	SetActiveDevice(userID, deviceID string) error
	GetE2EEInfo(userID string) (publicKey string, keyVersion int, activeDeviceID string, err error)
	SearchUsers(query, excludeUserID string) ([]User, error)
	SearchUsersWithContext(ctx context.Context, query, excludeUserID string) ([]User, error)
	GetOrCreateDirectConversation(userA, userB string) (string, error)
	GetOrCreateDirectConversationWithContext(ctx context.Context, userA, userB string) (string, error)
	GetUserConversations(userID string) ([]ConversationItem, error)
	GetUserConversationsWithContext(ctx context.Context, userID string) ([]ConversationItem, error)
	PinConversation(conversationID, userID string) error
	UnpinConversation(conversationID, userID string) error
	ClearConversation(conversationID, userID string) error
	GetConversationMemberUsernames(conversationID string) ([]string, error)
	IsUserInConversation(conversationID, userID string) (bool, error)
	IsConversationExpired(conversationID string) bool
	SavePushSubscription(sub *PushSubscription) error
	DeletePushSubscription(endpoint string) error
	DeletePushSubscriptionByUser(userID, endpoint string) error
	GetPushSubscriptionsByUserID(userID string) ([]PushSubscription, error)
	GetPushSubscriptionsForRecipients(recipientUserIDs []string) ([]PushSubscription, error)
	ChangePassword(userID, newPasswordHash string) error
	VerifyPassword(userID, plainPassword string) (bool, error)
}

// SQLUserStore adalah implementasi UserStore menggunakan SQL (SQLite & Postgres).
type SQLUserStore struct {
	db              *sql.DB
	driverName      string
	credentialStore CredentialStore // nil = belum diset, backward-compatible
}

// NewSQLUserStore membuat instance SQLUserStore.
func NewSQLUserStore(db *sql.DB, driverName string) *SQLUserStore {
	return &SQLUserStore{
		db:         db,
		driverName: driverName,
	}
}

// SetCredentialStore menyuntikkan CredentialStore ke SQLUserStore.
// Dipanggil di main.go setelah kedua store dibuat.
func (s *SQLUserStore) SetCredentialStore(cs CredentialStore) {
	s.credentialStore = cs
}

// RegisterWithContext mendaftarkan akun baru dengan password bcrypt dan isolasi tenant_id dari context.
func (s *SQLUserStore) RegisterWithContext(ctx context.Context, username, displayName, password string) (*User, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	// Cek apakah username sudah ada dalam tenant yang sama
	existing, _ := s.GetUserByUsernameWithContext(ctx, username)
	if existing != nil {
		return nil, ErrUserExists
	}

	var hash []byte
	var err error
	if password != "" {
		hash, err = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("gagal hash password: %w", err)
		}
	}

	user := &User{
		ID:            uuid.New().String(),
		TenantID:      tenantID,
		Username:      username,
		DisplayName:   displayName,
		PasswordHash:  string(hash),
		StatusMessage: "Tersedia untuk mengobrol",
		AvatarURL:     "",
		CreatedAt:     time.Now().UTC(),
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO users (id, tenant_id, username, display_name, password_hash, status_message, avatar_url, created_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	} else {
		query = `INSERT INTO users (id, tenant_id, username, display_name, password_hash, status_message, avatar_url, created_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err = s.db.Exec(query, user.ID, user.TenantID, user.Username, user.DisplayName, user.PasswordHash, user.StatusMessage, user.AvatarURL, user.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("gagal simpan user: %w", err)
	}

	// [Phase 3] Dual-write: simpan password hash ke user_credentials juga jika credentialStore diset.
	if s.credentialStore != nil && user.PasswordHash != "" {
		_ = s.credentialStore.CreateCredential(&UserCredential{
			UserID:     user.ID,
			Type:       "password",
			Identifier: user.Username,
			SecretData: user.PasswordHash,
			Name:       "Password Akun",
			CreatedAt:  user.CreatedAt,
		})
	}

	return user, nil
}

// Register mendaftarkan akun baru dengan password bcrypt (menggunakan default tenant context).
func (s *SQLUserStore) Register(username, displayName, password string) (*User, error) {
	return s.RegisterWithContext(context.Background(), username, displayName, password)
}

// Authenticate memverifikasi username & password.
// Dual-Read Strategy:
//   [1] Coba baca dari user_credentials (jalur baru)
//   [2] Fallback ke users.password_hash (jalur lama)
//   [3] Auto-backfill ke user_credentials jika login via fallback
func (s *SQLUserStore) Authenticate(username, password string) (*User, error) {
	user, err := s.GetUserByUsername(username)
	if err != nil {
		return nil, ErrUserNotFound
	}

	// [1] Coba jalur baru: user_credentials
	if s.credentialStore != nil {
		cred, _ := s.credentialStore.GetPasswordCredential(user.ID)
		if cred != nil {
			if err := bcrypt.CompareHashAndPassword([]byte(cred.SecretData), []byte(password)); err != nil {
				return nil, ErrInvalidPass
			}
			return user, nil
		}
		// cred == nil: user lama belum di-backfill, lanjut ke fallback
	}

	// [2] Fallback: jalur lama via users.password_hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidPass
	}

	// [3] Auto-backfill: isi user_credentials supaya login berikutnya pakai jalur baru
	if s.credentialStore != nil {
		_ = s.credentialStore.CreateCredential(&UserCredential{
			UserID:     user.ID,
			Type:       "password",
			Identifier: user.Username,
			SecretData: user.PasswordHash,
			Name:       "Password Akun",
		})
	}

	return user, nil
}

// ChangePassword memperbarui password_hash user yang terdaftar.
func (s *SQLUserStore) ChangePassword(userID, newPasswordHash string) error {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE users SET password_hash = $1 WHERE id = $2`
	} else {
		query = `UPDATE users SET password_hash = ? WHERE id = ?`
	}

	res, err := s.db.Exec(query, newPasswordHash, userID)
	if err != nil {
		return fmt.Errorf("gagal update password: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}

	// [Phase 3] Sync perubahan password ke user_credentials juga.
	if s.credentialStore != nil {
		_ = s.credentialStore.UpdatePasswordCredential(userID, newPasswordHash)
	}

	return nil
}

// VerifyPassword memvalidasi apakah plainPassword cocok dengan password_hash user saat ini.
func (s *SQLUserStore) VerifyPassword(userID, plainPassword string) (bool, error) {
	user, err := s.GetUserByID(userID)
	if err != nil {
		return false, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(plainPassword)); err != nil {
		return false, nil
	}
	return true, nil
}

// GetUserByID mengambil user berdasarkan ID.
func (s *SQLUserStore) GetUserByID(id string) (*User, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, COALESCE(tenant_id, 'default'), COALESCE(external_user_id, ''), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users WHERE id = $1`
	} else {
		query = `SELECT id, COALESCE(tenant_id, 'default'), COALESCE(external_user_id, ''), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users WHERE id = ?`
	}

	row := s.db.QueryRow(query, id)
	var u User
	if err := row.Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.StatusMessage, &u.AvatarURL, &u.IsVerified, &u.PublicKey, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// GetByExternalIDWithContext mengambil user berdasarkan external_user_id dan tenant_id dari context.
func (s *SQLUserStore) GetByExternalIDWithContext(ctx context.Context, externalUserID string) (*User, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, COALESCE(tenant_id, 'default'), COALESCE(external_user_id, ''), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users WHERE tenant_id = $1 AND external_user_id = $2`
	} else {
		query = `SELECT id, COALESCE(tenant_id, 'default'), COALESCE(external_user_id, ''), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users WHERE tenant_id = ? AND external_user_id = ?`
	}

	row := s.db.QueryRowContext(ctx, query, tenantID, externalUserID)
	var u User
	if err := row.Scan(&u.ID, &u.TenantID, &u.ExternalUserID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.StatusMessage, &u.AvatarURL, &u.IsVerified, &u.PublicKey, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func sanitizeExternalUsername(input string) string {
	input = strings.TrimSpace(strings.ToLower(input))
	var sb strings.Builder
	for _, r := range input {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			sb.WriteRune(r)
		}
	}
	s := sb.String()
	if s == "" {
		return "user"
	}
	if len(s) > 40 {
		return s[:40]
	}
	return s
}

// UpsertExternalUserWithContext melakukan atomic upsert user eksternal pada tenant yang aktif di context.
// Jika user belum ada, dibuat baru (JIT). Jika sudah ada, display_name dan avatar_url diperbarui jika diberikan.
func (s *SQLUserStore) UpsertExternalUserWithContext(ctx context.Context, externalUserID, displayName, avatarURL string) (*User, error) {
	externalUserID = strings.TrimSpace(externalUserID)
	if externalUserID == "" {
		return nil, errors.New("external_user_id tidak boleh kosong")
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	// 1. Cek apakah user sudah ada
	existing, err := s.GetByExternalIDWithContext(ctx, externalUserID)
	if err == nil && existing != nil {
		updateDisp := strings.TrimSpace(displayName)
		updateAvatar := strings.TrimSpace(avatarURL)

		if updateDisp != "" || updateAvatar != "" {
			var updateQuery string
			var args []interface{}
			if s.driverName == "postgres" {
				updateQuery = `UPDATE users 
				               SET display_name = CASE WHEN $1 != '' THEN $1 ELSE display_name END,
				                   avatar_url = CASE WHEN $2 != '' THEN $2 ELSE avatar_url END
				               WHERE id = $3 AND tenant_id = $4`
				args = []interface{}{updateDisp, updateAvatar, existing.ID, tenantID}
			} else {
				updateQuery = `UPDATE users 
				               SET display_name = CASE WHEN ? != '' THEN ? ELSE display_name END,
				                   avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END
				               WHERE id = ? AND tenant_id = ?`
				args = []interface{}{updateDisp, updateDisp, updateAvatar, updateAvatar, existing.ID, tenantID}
			}
			if _, err := s.db.ExecContext(ctx, updateQuery, args...); err != nil {
				return nil, fmt.Errorf("gagal update external user: %w", err)
			}

			if updateDisp != "" {
				existing.DisplayName = updateDisp
			}
			if updateAvatar != "" {
				existing.AvatarURL = updateAvatar
			}
		}
		return existing, nil
	}

	// 2. Buat user baru (JIT Provisioning)
	cleanName := strings.TrimSpace(displayName)
	if cleanName == "" {
		cleanName = externalUserID
	}

	baseUser := sanitizeExternalUsername(externalUserID)
	candidateUsername := "ext_" + baseUser
	if len(candidateUsername) > 60 {
		candidateUsername = candidateUsername[:60]
	}

	// Pastikan username unik di tenant
	checkUser, _ := s.GetUserByUsernameWithContext(ctx, candidateUsername)
	if checkUser != nil {
		randHex := make([]byte, 3)
		_, _ = rand.Read(randHex)
		candidateUsername = fmt.Sprintf("ext_%s_%s", baseUser, hex.EncodeToString(randHex))
		if len(candidateUsername) > 64 {
			candidateUsername = candidateUsername[:64]
		}
	}

	newUser := &User{
		ID:             uuid.New().String(),
		TenantID:       tenantID,
		ExternalUserID: externalUserID,
		Username:       candidateUsername,
		DisplayName:    cleanName,
		PasswordHash:   "JIT_EXTERNAL_PROVISIONED",
		StatusMessage:  "Tersedia untuk mengobrol",
		AvatarURL:      strings.TrimSpace(avatarURL),
		CreatedAt:      time.Now().UTC(),
	}

	var insertQuery string
	if s.driverName == "postgres" {
		insertQuery = `INSERT INTO users (id, tenant_id, external_user_id, username, display_name, password_hash, status_message, avatar_url, created_at)
		               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	} else {
		insertQuery = `INSERT INTO users (id, tenant_id, external_user_id, username, display_name, password_hash, status_message, avatar_url, created_at)
		               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err = s.db.ExecContext(ctx, insertQuery,
		newUser.ID, newUser.TenantID, newUser.ExternalUserID,
		newUser.Username, newUser.DisplayName, newUser.PasswordHash,
		newUser.StatusMessage, newUser.AvatarURL, newUser.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("gagal insert external user: %w", err)
	}

	return newUser, nil
}

// GetUserByUsernameWithContext mengambil user berdasarkan username dan tenant_id dari context.
func (s *SQLUserStore) GetUserByUsernameWithContext(ctx context.Context, username string) (*User, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, COALESCE(tenant_id, 'default'), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)`
	} else {
		query = `SELECT id, COALESCE(tenant_id, 'default'), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users WHERE tenant_id = ? AND LOWER(username) = LOWER(?)`
	}

	row := s.db.QueryRow(query, tenantID, username)
	var u User
	if err := row.Scan(&u.ID, &u.TenantID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.StatusMessage, &u.AvatarURL, &u.IsVerified, &u.PublicKey, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// GetUserByUsername mengambil user berdasarkan username (default tenant).
func (s *SQLUserStore) GetUserByUsername(username string) (*User, error) {
	return s.GetUserByUsernameWithContext(context.Background(), username)
}

// GetUserByUsernameOrDisplayNameWithContext mengambil user berdasarkan username ATAU display_name dan tenant_id dari context.
func (s *SQLUserStore) GetUserByUsernameOrDisplayNameWithContext(ctx context.Context, name string) (*User, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	var query string
	var row *sql.Row
	if s.driverName == "postgres" {
		query = `SELECT id, COALESCE(tenant_id, 'default'), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at 
		         FROM users 
		         WHERE tenant_id = $1 AND (LOWER(username) = LOWER($2) OR LOWER(display_name) = LOWER($2)) 
		         ORDER BY (CASE WHEN LOWER(username) = LOWER($2) THEN 0 ELSE 1 END), created_at DESC
		         LIMIT 1`
		row = s.db.QueryRow(query, tenantID, name)
	} else {
		query = `SELECT id, COALESCE(tenant_id, 'default'), username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at 
		         FROM users 
		         WHERE tenant_id = ? AND (LOWER(username) = LOWER(?) OR LOWER(display_name) = LOWER(?)) 
		         ORDER BY (CASE WHEN LOWER(username) = LOWER(?) THEN 0 ELSE 1 END), created_at DESC
		         LIMIT 1`
		row = s.db.QueryRow(query, tenantID, name, name, name)
	}

	var u User
	if err := row.Scan(&u.ID, &u.TenantID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.StatusMessage, &u.AvatarURL, &u.IsVerified, &u.PublicKey, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// GetUserByUsernameOrDisplayName mengambil user berdasarkan username ATAU display_name.
func (s *SQLUserStore) GetUserByUsernameOrDisplayName(name string) (*User, error) {
	return s.GetUserByUsernameOrDisplayNameWithContext(context.Background(), name)
}

// UpdateProfile memperbarui display_name, status_message, dan avatar_url milik user.
func (s *SQLUserStore) UpdateProfile(userID, displayName, statusMessage, avatarURL string) (*User, error) {
	user, err := s.GetUserByID(userID)
	if err != nil {
		return nil, err
	}

	if displayName != "" {
		user.DisplayName = displayName
	}
	if statusMessage != "" {
		user.StatusMessage = statusMessage
	}
	if avatarURL != "" {
		user.AvatarURL = avatarURL
	}

	var query string
	if s.driverName == "postgres" {
		query = `UPDATE users SET display_name = $1, status_message = $2, avatar_url = $3 WHERE id = $4`
	} else {
		query = `UPDATE users SET display_name = ?, status_message = ?, avatar_url = ? WHERE id = ?`
	}

	_, err = s.db.Exec(query, user.DisplayName, user.StatusMessage, user.AvatarURL, user.ID)
	if err != nil {
		return nil, fmt.Errorf("gagal update profil: %w", err)
	}

	return user, nil
}

// GetE2EEInfo mengambil informasi E2EE user saat ini (public_key, key_version, active_device_id).
func (s *SQLUserStore) GetE2EEInfo(userID string) (string, int, string, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT COALESCE(public_key, ''), COALESCE(key_version, 1), COALESCE(active_device_id, '') FROM users WHERE id = $1`
	} else {
		query = `SELECT COALESCE(public_key, ''), COALESCE(key_version, 1), COALESCE(active_device_id, '') FROM users WHERE id = ?`
	}

	var pubKey, activeDev string
	var keyVer int
	err := s.db.QueryRow(query, userID).Scan(&pubKey, &keyVer, &activeDev)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", 0, "", ErrUserNotFound
		}
		return "", 0, "", fmt.Errorf("gagal query E2EE info: %w", err)
	}
	return pubKey, keyVer, activeDev, nil
}

// UpdatePublicKeyWithDevice memperbarui public_key dan active_device_id secara aman.
// Jika user sudah memiliki public_key dan active_device_id berbeda dari deviceID yang dikirim,
// operasi ini menolak update dan mengembalikan ErrKeyConflict beserta key_version saat ini.
func (s *SQLUserStore) UpdatePublicKeyWithDevice(userID, publicKey, deviceID string) (int, error) {
	pubKey, keyVer, activeDev, err := s.GetE2EEInfo(userID)
	if err != nil {
		return 0, err
	}

	trimmedKey := strings.TrimSpace(publicKey)
	trimmedDev := strings.TrimSpace(deviceID)

	// Jika sudah ada key terdaftar dan ada device terdaftar yang BERBEDA dari deviceID ini
	if pubKey != "" && activeDev != "" && trimmedDev != "" && activeDev != trimmedDev {
		// Multi-Device Phase 5: Jika kunci yang dikirim IDENTIK dengan kunci di server,
		// perangkat ke-2 sudah mendapatkan kunci via QR Transfer → Izinkan tanpa menimpa active_device_id.
		if strings.TrimSpace(pubKey) == trimmedKey {
			return keyVer, nil
		}
		return keyVer, ErrKeyConflict
	}

	// Jika deviceID kosong tapi sudah ada activeDev terdaftar, tolak jika key berbeda
	if pubKey != "" && activeDev != "" && trimmedDev == "" && pubKey != trimmedKey {
		return keyVer, ErrKeyConflict
	}

	if keyVer < 1 {
		keyVer = 1
	}

	devToSave := activeDev
	if trimmedDev != "" {
		devToSave = trimmedDev
	}

	var query string
	if s.driverName == "postgres" {
		query = `UPDATE users SET public_key = $1, active_device_id = $2, key_version = $3 WHERE id = $4`
	} else {
		query = `UPDATE users SET public_key = ?, active_device_id = ?, key_version = ? WHERE id = ?`
	}

	_, err = s.db.Exec(query, trimmedKey, devToSave, keyVer, userID)
	if err != nil {
		return 0, fmt.Errorf("gagal update public key dengan device: %w", err)
	}
	return keyVer, nil
}

// ForceResetPublicKey memaksa reset public_key ke device baru dan menaikkan key_version.
func (s *SQLUserStore) ForceResetPublicKey(userID, publicKey, deviceID string) (int, error) {
	_, keyVer, _, err := s.GetE2EEInfo(userID)
	if err != nil {
		return 0, err
	}

	newKeyVer := keyVer + 1
	trimmedKey := strings.TrimSpace(publicKey)
	trimmedDev := strings.TrimSpace(deviceID)

	var query string
	if s.driverName == "postgres" {
		query = `UPDATE users SET public_key = $1, active_device_id = $2, key_version = $3 WHERE id = $4`
	} else {
		query = `UPDATE users SET public_key = ?, active_device_id = ?, key_version = ? WHERE id = ?`
	}

	_, err = s.db.Exec(query, trimmedKey, trimmedDev, newKeyVer, userID)
	if err != nil {
		return 0, fmt.Errorf("gagal force reset public key: %w", err)
	}
	return newKeyVer, nil
}

// ClearActiveDevice mengosongkan active_device_id user saat logout sehingga perangkat baru dapat login tanpa konflik.
// Jika deviceID diberikan (tidak kosong), hanya kosongkan jika active_device_id saat ini cocok atau sudah kosong.
// Hal ini mencegah perangkat non-aktif/penantang menghapus sesi milik perangkat aktif sah.
func (s *SQLUserStore) ClearActiveDevice(userID string, deviceID ...string) error {
	var targetDev string
	if len(deviceID) > 0 {
		targetDev = strings.TrimSpace(deviceID[0])
	}

	var query string
	var err error
	if targetDev != "" {
		if s.driverName == "postgres" {
			query = `UPDATE users SET active_device_id = '' WHERE id = $1 AND (active_device_id = $2 OR active_device_id = '')`
		} else {
			query = `UPDATE users SET active_device_id = '' WHERE id = ? AND (active_device_id = ? OR active_device_id = '')`
		}
		_, err = s.db.Exec(query, userID, targetDev)
	} else {
		if s.driverName == "postgres" {
			query = `UPDATE users SET active_device_id = '' WHERE id = $1`
		} else {
			query = `UPDATE users SET active_device_id = '' WHERE id = ?`
		}
		_, err = s.db.Exec(query, userID)
	}

	if err != nil {
		return fmt.Errorf("gagal mengosongkan active_device_id: %w", err)
	}
	return nil
}

// SetActiveDevice memperbarui active_device_id milik user ke perangkat tertentu.
func (s *SQLUserStore) SetActiveDevice(userID, deviceID string) error {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE users SET active_device_id = $1 WHERE id = $2`
	} else {
		query = `UPDATE users SET active_device_id = ? WHERE id = ?`
	}
	_, err := s.db.Exec(query, deviceID, userID)
	if err != nil {
		return fmt.Errorf("SetActiveDevice: %w", err)
	}
	return nil
}

// UpdatePublicKey memperbarui public_key (E2EE) milik user (backward-compatible).
func (s *SQLUserStore) UpdatePublicKey(userID, publicKey string) error {
	_, err := s.UpdatePublicKeyWithDevice(userID, publicKey, "")
	return err
}

// SearchUsers mencari user berdasarkan username atau display_name.
// SearchUsersWithContext mencari user lain dalam tenant yang sama (mengecualikan excludeUserID).
func (s *SQLUserStore) SearchUsersWithContext(ctx context.Context, query, excludeUserID string) ([]User, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	searchPattern := "%" + query + "%"
	var sqlQuery string
	var rows *sql.Rows
	var err error

	if s.driverName == "postgres" {
		sqlQuery = `SELECT id, COALESCE(tenant_id, 'default'), username, display_name, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users 
		            WHERE tenant_id = $1 AND id != $2 AND (LOWER(username) LIKE LOWER($3) OR LOWER(display_name) LIKE LOWER($3)) 
		            ORDER BY username ASC LIMIT 20`
		rows, err = s.db.Query(sqlQuery, tenantID, excludeUserID, searchPattern)
	} else {
		sqlQuery = `SELECT id, COALESCE(tenant_id, 'default'), username, display_name, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(is_verified, false), COALESCE(public_key, ''), created_at FROM users 
		            WHERE tenant_id = ? AND id != ? AND (LOWER(username) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?)) 
		            ORDER BY username ASC LIMIT 20`
		rows, err = s.db.Query(sqlQuery, tenantID, excludeUserID, searchPattern, searchPattern)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.TenantID, &u.Username, &u.DisplayName, &u.StatusMessage, &u.AvatarURL, &u.IsVerified, &u.PublicKey, &u.CreatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}
	return users, nil
}

// SearchUsers mencari user lain untuk diajak chat (mengecualikan excludeUserID).
func (s *SQLUserStore) SearchUsers(query, excludeUserID string) ([]User, error) {
	return s.SearchUsersWithContext(context.Background(), query, excludeUserID)
}

// GetOrCreateDirectConversationWithContext membuat atau mengembalikan ID percakapan 1-on-1 antar dua user terisolasi per tenant.
func (s *SQLUserStore) GetOrCreateDirectConversationWithContext(ctx context.Context, userA, userB string) (string, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	// Jika tenant default, ambil tenant_id dari userA jika terdaftar di tenant kustom
	if tenantID == tenantshared.DefaultTenantID {
		var uTenant string
		if s.driverName == "postgres" {
			_ = s.db.QueryRow(`SELECT COALESCE(tenant_id, 'default') FROM users WHERE id = $1`, userA).Scan(&uTenant)
		} else {
			_ = s.db.QueryRow(`SELECT COALESCE(tenant_id, 'default') FROM users WHERE id = ?`, userA).Scan(&uTenant)
		}
		if uTenant != "" {
			tenantID = uTenant
		}
	}

	// 1. Cek terlebih dahulu apakah sudah ada percakapan direct aktif antara userA dan userB dalam tenant yang sama
	var existingQuery string
	if s.driverName == "postgres" {
		existingQuery = `
			SELECT c.id FROM conversations c
			JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
			JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
			WHERE c.tenant_id = $3 AND c.type = 'direct'
			LIMIT 1
		`
	} else {
		existingQuery = `
			SELECT c.id FROM conversations c
			JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
			JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
			WHERE c.tenant_id = ? AND c.type = 'direct'
			LIMIT 1
		`
	}

	var existingID string
	err := s.db.QueryRow(existingQuery, userA, userB, tenantID).Scan(&existingID)
	if err == nil && existingID != "" {
		return existingID, nil
	}

	// 2. Tentukan ID percakapan deterministik bebas tabrakan (collision-free) dengan scope tenant
	var firstUser, secondUser string
	if userA < userB {
		firstUser, secondUser = userA, userB
	} else {
		firstUser, secondUser = userB, userA
	}

	directRoomID := fmt.Sprintf("dm_%s_%s_%s", tenantID, firstUser, secondUser)
	if len(directRoomID) > 128 {
		h := sha256.Sum256([]byte(tenantID + ":" + firstUser + ":" + secondUser))
		directRoomID = fmt.Sprintf("dm_%x", h)
	}

	// 3. Simpan percakapan baru dan daftarkan kedua user sebagai anggota
	now := time.Now().UTC()
	if s.driverName == "postgres" {
		_, err = s.db.Exec(`INSERT INTO conversations (id, tenant_id, type, title, created_at, updated_at) VALUES ($1, $2, 'direct', '', $3, $3) ON CONFLICT (id) DO NOTHING`, directRoomID, tenantID, now)
		if err == nil {
			_, _ = s.db.Exec(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3), ($1, $4, $3) ON CONFLICT DO NOTHING`, directRoomID, userA, now, userB)
		}
	} else {
		_, err = s.db.Exec(`INSERT OR IGNORE INTO conversations (id, tenant_id, type, title, created_at, updated_at) VALUES (?, ?, 'direct', '', ?, ?)`, directRoomID, tenantID, now, now)
		if err == nil {
			_, _ = s.db.Exec(`INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?), (?, ?, ?)`, directRoomID, userA, now, directRoomID, userB, now)
		}
	}

	return directRoomID, nil
}

// GetOrCreateDirectConversation membuat atau mengembalikan ID percakapan 1-on-1 antar dua user.
func (s *SQLUserStore) GetOrCreateDirectConversation(userA, userB string) (string, error) {
	return s.GetOrCreateDirectConversationWithContext(context.Background(), userA, userB)
}

// ClearConversation mencatat waktu pembersihan percakapan (cleared_at) untuk userID tertentu.
// Riwayat percakapan tidak akan terhapus bagi lawan bicara.
func (s *SQLUserStore) ClearConversation(conversationID, userID string) error {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE conversation_members SET cleared_at = $1 WHERE conversation_id = $2 AND user_id = $3`
	} else {
		query = `UPDATE conversation_members SET cleared_at = ? WHERE conversation_id = ? AND user_id = ?`
	}
	res, err := s.db.Exec(query, now, conversationID, userID)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("percakapan atau keanggotaan tidak ditemukan")
	}
	return nil
}

// PinConversation menandai percakapan sebagai pinned untuk user tertentu.
func (s *SQLUserStore) PinConversation(conversationID, userID string) error {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE conversation_members SET is_pinned = TRUE, pinned_at = $1 WHERE conversation_id = $2 AND user_id = $3`
	} else {
		query = `UPDATE conversation_members SET is_pinned = TRUE, pinned_at = ? WHERE conversation_id = ? AND user_id = ?`
	}
	res, err := s.db.Exec(query, now, conversationID, userID)
	if err != nil {
		return fmt.Errorf("gagal pin percakapan: %w", err)
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("percakapan atau keanggotaan tidak ditemukan")
	}
	return nil
}

// UnpinConversation melepas tanda pinned percakapan untuk user tertentu.
func (s *SQLUserStore) UnpinConversation(conversationID, userID string) error {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE conversation_members SET is_pinned = FALSE, pinned_at = NULL WHERE conversation_id = $1 AND user_id = $2`
	} else {
		query = `UPDATE conversation_members SET is_pinned = FALSE, pinned_at = NULL WHERE conversation_id = ? AND user_id = ?`
	}
	res, err := s.db.Exec(query, conversationID, userID)
	if err != nil {
		return fmt.Errorf("gagal unpin percakapan: %w", err)
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("percakapan atau keanggotaan tidak ditemukan")
	}
	return nil
}

// GetUserConversationsWithContext mengambil daftar obrolan aktif milik seorang user yang terisolasi per tenant.
func (s *SQLUserStore) GetUserConversationsWithContext(ctx context.Context, userID string) ([]ConversationItem, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	// Jika tenant context bernilai default, cek apakah user terdaftar pada tenant kustom
	if tenantID == tenantshared.DefaultTenantID {
		var uTenant string
		if s.driverName == "postgres" {
			_ = s.db.QueryRow(`SELECT COALESCE(tenant_id, 'default') FROM users WHERE id = $1`, userID).Scan(&uTenant)
		} else {
			_ = s.db.QueryRow(`SELECT COALESCE(tenant_id, 'default') FROM users WHERE id = ?`, userID).Scan(&uTenant)
		}
		if uTenant != "" {
			tenantID = uTenant
		}
	}

	// 1. Ambil seluruh percakapan beserta data lawan bicara (peer) jika direct chat dalam 1 query
	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT 
				c.id, 
				COALESCE(c.tenant_id, 'default') AS conv_tenant_id,
				c.type, 
				c.title, 
				c.updated_at, 
				cm.cleared_at,
				COALESCE(cm.is_pinned, false) AS is_pinned,
				cm.pinned_at,
				COALESCE(peer.id, '') AS peer_id,
				COALESCE(peer.display_name, '') AS peer_nickname,
				COALESCE(peer.public_key, '') AS peer_public_key,
				COALESCE(peer.avatar_url, '') AS peer_avatar_url,
				COALESCE(peer.is_verified, false) AS peer_is_verified,
				COALESCE(c.avatar_url, '') AS conv_avatar_url,
				COALESCE(c.description, '') AS conv_description,
				COALESCE(c.is_public, false) AS conv_is_public,
				COALESCE(c.group_username, '') AS conv_group_username,
				COALESCE(c.parent_id, '') AS conv_parent_id,
				COALESCE(cm.role, 'member') AS my_role
			FROM conversations c
			JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = $1
			LEFT JOIN conversation_members peer_cm ON c.id = peer_cm.conversation_id AND peer_cm.user_id != $1 AND c.type = 'direct'
			LEFT JOIN users peer ON peer_cm.user_id = peer.id
			WHERE c.tenant_id = $2 AND (c.parent_id IS NULL OR c.parent_id = '')
			ORDER BY c.updated_at DESC
		`
	} else {
		query = `
			SELECT 
				c.id, 
				COALESCE(c.tenant_id, 'default') AS conv_tenant_id,
				c.type, 
				c.title, 
				c.updated_at, 
				cm.cleared_at,
				COALESCE(cm.is_pinned, false) AS is_pinned,
				cm.pinned_at,
				COALESCE(peer.id, '') AS peer_id,
				COALESCE(peer.display_name, '') AS peer_nickname,
				COALESCE(peer.public_key, '') AS peer_public_key,
				COALESCE(peer.avatar_url, '') AS peer_avatar_url,
				COALESCE(peer.is_verified, false) AS peer_is_verified,
				COALESCE(c.avatar_url, '') AS conv_avatar_url,
				COALESCE(c.description, '') AS conv_description,
				COALESCE(c.is_public, false) AS conv_is_public,
				COALESCE(c.group_username, '') AS conv_group_username,
				COALESCE(c.parent_id, '') AS conv_parent_id,
				COALESCE(cm.role, 'member') AS my_role
			FROM conversations c
			JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ?
			LEFT JOIN conversation_members peer_cm ON c.id = peer_cm.conversation_id AND peer_cm.user_id != ? AND c.type = 'direct'
			LEFT JOIN users peer ON peer_cm.user_id = peer.id
			WHERE c.tenant_id = ? AND (c.parent_id IS NULL OR c.parent_id = '')
			ORDER BY c.updated_at DESC
		`
	}

	var rows *sql.Rows
	var err error
	if s.driverName == "postgres" {
		rows, err = s.db.Query(query, userID, tenantID)
	} else {
		rows, err = s.db.Query(query, userID, userID, tenantID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rawConv struct {
		item      ConversationItem
		clearedAt sql.NullTime
	}
	var rawConvs []rawConv

	for rows.Next() {
		var rc rawConv
		var convAvatarURL, convDesc, convGroupUsername, convParentID, myRole string
		var convIsPublic bool
		if err := rows.Scan(
			&rc.item.ID,
			&rc.item.TenantID,
			&rc.item.Type,
			&rc.item.Title,
			&rc.item.UpdatedAt,
			&rc.clearedAt,
			&rc.item.IsPinned,
			&rc.item.PinnedAt,
			&rc.item.PeerID,
			&rc.item.PeerNickname,
			&rc.item.PeerPublicKey,
			&rc.item.PeerAvatarURL,
			&rc.item.PeerIsVerified,
			&convAvatarURL,
			&convDesc,
			&convIsPublic,
			&convGroupUsername,
			&convParentID,
			&myRole,
		); err != nil {
			continue
		}
		rc.item.AvatarURL = convAvatarURL
		rc.item.Description = convDesc
		rc.item.IsPublic = convIsPublic
		rc.item.GroupUsername = convGroupUsername
		rc.item.ParentID = convParentID
		rc.item.Role = myRole

		if rc.item.Type == "direct" && rc.item.Title == "" {
			rc.item.Title = rc.item.PeerNickname
		}
		rawConvs = append(rawConvs, rc)
	}
	rows.Close()

	if len(rawConvs) == 0 {
		return []ConversationItem{}, nil
	}

	// 2. Ambil pesan terakhir untuk semua percakapan dalam 1 query menggunakan CTE & ROW_NUMBER()
	type lastMsg struct {
		snippet   string
		senderID  string
		sender    string
		status    string
		createdAt time.Time
	}
	lastMessages := make(map[string]lastMsg)

	var lastMsgQuery string
	if s.driverName == "postgres" {
		lastMsgQuery = `
			WITH RankedMessages AS (
				SELECT 
					m.room_id,
					CASE 
						WHEN m.content IS NOT NULL AND m.content != '' THEN m.content
						WHEN m.media_type = 'image' THEN '📷 Foto'
						WHEN m.media_type = 'audio' THEN '🎙️ Pesan Suara'
						WHEN m.media_type = 'video' THEN '🎥 Video'
						WHEN m.media_url IS NOT NULL AND m.media_url != '' THEN '📎 ' || COALESCE(NULLIF(m.file_name, ''), 'Berkas')
						ELSE ''
					END AS snippet,
					m.from_id,
					m.from_nickname,
					COALESCE(m.status, 'sent') AS status,
					m.created_at,
					ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC) as rn
				FROM messages m
				JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = $1
				WHERE (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			)
			SELECT room_id, snippet, from_id, from_nickname, status, created_at
			FROM RankedMessages
			WHERE rn = 1
		`
	} else {
		lastMsgQuery = `
			WITH RankedMessages AS (
				SELECT 
					m.room_id,
					CASE 
						WHEN m.content IS NOT NULL AND m.content != '' THEN m.content
						WHEN m.media_type = 'image' THEN '📷 Foto'
						WHEN m.media_type = 'audio' THEN '🎙️ Pesan Suara'
						WHEN m.media_type = 'video' THEN '🎥 Video'
						WHEN m.media_url IS NOT NULL AND m.media_url != '' THEN '📎 ' || COALESCE(NULLIF(m.file_name, ''), 'Berkas')
						ELSE ''
					END AS snippet,
					m.from_id,
					m.from_nickname,
					COALESCE(m.status, 'sent') AS status,
					m.created_at,
					ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC) as rn
				FROM messages m
				JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = ?
				WHERE (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			)
			SELECT room_id, snippet, from_id, from_nickname, status, created_at
			FROM RankedMessages
			WHERE rn = 1
		`
	}

	msgRows, err := s.db.Query(lastMsgQuery, userID)
	if err == nil {
		defer msgRows.Close()
		for msgRows.Next() {
			var roomID string
			var lm lastMsg
			if err := msgRows.Scan(&roomID, &lm.snippet, &lm.senderID, &lm.sender, &lm.status, &lm.createdAt); err == nil {
				lastMessages[roomID] = lm
			}
		}
		msgRows.Close()
	}

	// 3. Ambil unread count untuk semua percakapan dalam 1 query (UUID-based filter)
	unreadCounts := make(map[string]int)
	var unreadQuery string
	if s.driverName == "postgres" {
		unreadQuery = `
			SELECT 
				m.room_id, 
				COUNT(*) 
			FROM messages m
			JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = $1
			WHERE (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			  AND m.from_id != $1
			  AND m.status != 'read'
			GROUP BY m.room_id
		`
	} else {
		unreadQuery = `
			SELECT 
				m.room_id, 
				COUNT(*) 
			FROM messages m
			JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = ?
			WHERE (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			  AND m.from_id != ?
			  AND m.status != 'read'
			GROUP BY m.room_id
		`
	}

	var unreadRows *sql.Rows
	if s.driverName == "postgres" {
		unreadRows, err = s.db.Query(unreadQuery, userID)
	} else {
		unreadRows, err = s.db.Query(unreadQuery, userID, userID)
	}
	if err == nil {
		defer unreadRows.Close()
		for unreadRows.Next() {
			var roomID string
			var count int
			if err := unreadRows.Scan(&roomID, &count); err == nil {
				unreadCounts[roomID] = count
			}
		}
		unreadRows.Close()
	}

	// 4. Susun item hasil dengan filter privacy (cleared_at)
	var items []ConversationItem
	for _, rc := range rawConvs {
		lm, hasMsg := lastMessages[rc.item.ID]
		if rc.clearedAt.Valid && !hasMsg {
			// Percakapan telah di-clear oleh user dan belum ada pesan baru -> sembunyikan dari sidebar
			continue
		}

		if hasMsg {
			rc.item.LastMessage = lm.snippet
			rc.item.LastSender = lm.sender
			rc.item.LastSenderID = lm.senderID
			rc.item.LastStatus = lm.status
			rc.item.UpdatedAt = lm.createdAt
		}

		rc.item.UnreadCount = unreadCounts[rc.item.ID]
		items = append(items, rc.item)
	}

	// Urutkan percakapan secara dinamis:
	// Prioritaskan percakapan yang di-pin (IsPinned = true),
	// jika keduanya di-pin, urutkan berdasarkan PinnedAt terbaru (atau UpdatedAt),
	// jika tidak di-pin, urutkan berdasarkan UpdatedAt terbaru.
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].IsPinned != items[j].IsPinned {
			return items[i].IsPinned
		}
		if items[i].IsPinned && items[j].IsPinned {
			if items[i].PinnedAt != nil && items[j].PinnedAt != nil {
				return items[i].PinnedAt.After(*items[j].PinnedAt)
			}
		}
		return items[i].UpdatedAt.After(items[j].UpdatedAt)
	})

	return items, nil
}

// GetUserConversations mengambil daftar obrolan aktif milik seorang user (default context).
func (s *SQLUserStore) GetUserConversations(userID string) ([]ConversationItem, error) {
	return s.GetUserConversationsWithContext(context.Background(), userID)
}

// GetConversationMemberUsernames mengambil seluruh username dan display_name anggota dalam suatu percakapan.
func (s *SQLUserStore) GetConversationMemberUsernames(conversationID string) ([]string, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT u.id, u.username, u.display_name FROM users u 
		         JOIN conversation_members cm ON u.id = cm.user_id 
		         WHERE cm.conversation_id = $1`
	} else {
		query = `SELECT u.id, u.username, u.display_name FROM users u 
		         JOIN conversation_members cm ON u.id = cm.user_id 
		         WHERE cm.conversation_id = ?`
	}

	rows, err := s.db.Query(query, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var id, username, displayName string
		if err := rows.Scan(&id, &username, &displayName); err == nil {
			if id != "" {
				names = append(names, id)
			}
			if username != "" {
				names = append(names, username)
			}
			if displayName != "" && displayName != username {
				names = append(names, displayName)
			}
		}
	}

	return names, nil
}

// IsUserInConversation memeriksa apakah user dengan userID tertentu adalah anggota sah dari conversationID.
func (s *SQLUserStore) IsUserInConversation(conversationID, userID string) (bool, error) {
	if conversationID == "" || userID == "" {
		return false, nil
	}

	// 1. Cek apakah ini subgrup (punya parent_id)
	var parentID sql.NullString
	var convExists bool
	var parentCheckQuery string
	if s.driverName == "postgres" {
		parentCheckQuery = `SELECT parent_id FROM conversations WHERE id = $1`
	} else {
		parentCheckQuery = `SELECT parent_id FROM conversations WHERE id = ?`
	}
	err := s.db.QueryRow(parentCheckQuery, conversationID).Scan(&parentID)
	if err == nil {
		convExists = true
		// Strict Parent-Membership Gate: Jika ini subgrup, user WAJIB terdaftar di grup induk!
		if parentID.Valid && strings.TrimSpace(parentID.String) != "" {
			var pCount int
			var pQuery string
			if s.driverName == "postgres" {
				pQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
			} else {
				pQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
			}
			if pErr := s.db.QueryRow(pQuery, parentID.String, userID).Scan(&pCount); pErr != nil || pCount == 0 {
				return false, nil
			}
		}
	}

	// 2. Cek apakah user terdaftar sebagai member di tabel conversation_members
	var query string
	if s.driverName == "postgres" {
		query = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
	} else {
		query = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
	}

	var count int
	err = s.db.QueryRow(query, conversationID, userID).Scan(&count)
	if err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// 3. Cek apakah room ini terdaftar di tabel conversations
	// Jika room adalah percakapan terdaftar dan user BUKAN anggota -> tolak (false)
	if convExists {
		return false, nil
	}
	var convQuery string
	if s.driverName == "postgres" {
		convQuery = `SELECT COUNT(*) FROM conversations WHERE id = $1`
	} else {
		convQuery = `SELECT COUNT(*) FROM conversations WHERE id = ?`
	}

	var convCount int
	_ = s.db.QueryRow(convQuery, conversationID).Scan(&convCount)
	if convCount > 0 {
		return false, nil
	}

	// 4. Jika berupa direct message pattern 'dm_...' tapi belum tersimpan di DB
	// Tolak akses jika formatnya direct message untuk mencegah akses liar
	if strings.HasPrefix(conversationID, "dm_") {
		return false, nil
	}

	// 5. Untuk room publik / ad-hoc group biasa (misal 'room-123', 'room-kopi'), siapapun yang memegang link diizinkan
	return true, nil
}

// IsConversationExpired memeriksa apakah suatu percakapan / subgrup telah mencapai batas masa aktif (expires_at) atau berstatus 'expired'.
func (s *SQLUserStore) IsConversationExpired(conversationID string) bool {
	conversationID = strings.TrimSpace(conversationID)
	if conversationID == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var query string
	if s.driverName == "postgres" {
		query = `SELECT COALESCE(status, 'active'), expires_at FROM conversations WHERE id = $1`
	} else {
		query = `SELECT COALESCE(status, 'active'), expires_at FROM conversations WHERE id = ?`
	}

	var status string
	var expiresAt *time.Time
	err := s.db.QueryRowContext(ctx, query, conversationID).Scan(&status, &expiresAt)
	if err != nil {
		return false
	}
	if status == "expired" {
		return true
	}
	if expiresAt != nil && expiresAt.Before(time.Now().UTC()) {
		return true
	}
	return false
}

// safePrefix mengembalikan substring awal secara aman tanpa memicu panic jika panjang s < maxLen.
func safePrefix(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}

// SavePushSubscription menyimpan atau memperbarui token/endpoint push notification.
func (s *SQLUserStore) SavePushSubscription(sub *PushSubscription) error {
	if sub == nil || sub.UserID == "" || sub.Endpoint == "" {
		return errors.New("parameter push subscription tidak valid")
	}

	if sub.ID == "" {
		sub.ID = uuid.New().String()
	}
	if sub.Platform == "" {
		sub.Platform = "web"
	}
	if sub.CreatedAt.IsZero() {
		sub.CreatedAt = time.Now().UTC()
	}

	// Hapus subscription lama dengan endpoint yang sama jika ada (clean replace)
	var delQuery string
	if s.driverName == "postgres" {
		delQuery = `DELETE FROM push_subscriptions WHERE endpoint = $1`
	} else {
		delQuery = `DELETE FROM push_subscriptions WHERE endpoint = ?`
	}
	_, _ = s.db.Exec(delQuery, sub.Endpoint)

	var insertQuery string
	if s.driverName == "postgres" {
		insertQuery = `INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh_key, auth_key, created_at)
		               VALUES ($1, $2, $3, $4, $5, $6, $7)`
	} else {
		insertQuery = `INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh_key, auth_key, created_at)
		               VALUES (?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.Exec(insertQuery, sub.ID, sub.UserID, sub.Platform, sub.Endpoint, sub.P256dhKey, sub.AuthKey, sub.CreatedAt)
	return err
}

// DeletePushSubscription menghapus push subscription berdasarkan endpoint.
func (s *SQLUserStore) DeletePushSubscription(endpoint string) error {
	if endpoint == "" {
		return nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `DELETE FROM push_subscriptions WHERE endpoint = $1`
	} else {
		query = `DELETE FROM push_subscriptions WHERE endpoint = ?`
	}

	_, err := s.db.Exec(query, endpoint)
	return err
}

// DeletePushSubscriptionByUser menghapus push subscription milik user tertentu berdasarkan endpoint.
func (s *SQLUserStore) DeletePushSubscriptionByUser(userID, endpoint string) error {
	if userID == "" || endpoint == "" {
		return nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`
	} else {
		query = `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`
	}

	_, err := s.db.Exec(query, userID, endpoint)
	return err
}

// GetPushSubscriptionsByUserID mengambil seluruh push subscription aktif untuk satu user ID.
func (s *SQLUserStore) GetPushSubscriptionsByUserID(userID string) ([]PushSubscription, error) {
	if userID == "" {
		return []PushSubscription{}, nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, user_id, platform, endpoint, p256dh_key, auth_key, created_at
		         FROM push_subscriptions WHERE user_id = $1`
	} else {
		query = `SELECT id, user_id, platform, endpoint, p256dh_key, auth_key, created_at
		         FROM push_subscriptions WHERE user_id = ?`
	}

	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []PushSubscription
	for rows.Next() {
		var sub PushSubscription
		if err := rows.Scan(&sub.ID, &sub.UserID, &sub.Platform, &sub.Endpoint, &sub.P256dhKey, &sub.AuthKey, &sub.CreatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}

	return subs, rows.Err()
}

// GetPushSubscriptionsForRecipients mengambil push subscriptions untuk sekumpulan user ID.
func (s *SQLUserStore) GetPushSubscriptionsForRecipients(recipientUserIDs []string) ([]PushSubscription, error) {
	if len(recipientUserIDs) == 0 {
		return []PushSubscription{}, nil
	}

	// Filter deduplikasi dan non-empty
	seen := make(map[string]bool)
	var cleanIDs []string
	for _, id := range recipientUserIDs {
		if id != "" && !seen[id] {
			seen[id] = true
			cleanIDs = append(cleanIDs, id)
		}
	}
	if len(cleanIDs) == 0 {
		return []PushSubscription{}, nil
	}

	var placeholders []string
	var args []interface{}
	for i, id := range cleanIDs {
		if s.driverName == "postgres" {
			placeholders = append(placeholders, fmt.Sprintf("$%d", i+1))
		} else {
			placeholders = append(placeholders, "?")
		}
		args = append(args, id)
	}

	query := fmt.Sprintf(`SELECT id, user_id, platform, endpoint, p256dh_key, auth_key, created_at
	                      FROM push_subscriptions WHERE user_id IN (%s)`, strings.Join(placeholders, ", "))

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []PushSubscription
	for rows.Next() {
		var sub PushSubscription
		if err := rows.Scan(&sub.ID, &sub.UserID, &sub.Platform, &sub.Endpoint, &sub.P256dhKey, &sub.AuthKey, &sub.CreatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}

	return subs, rows.Err()
}



