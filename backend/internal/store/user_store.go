package store

import (
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

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
	Username       string    `json:"username"`
	DisplayName    string    `json:"display_name"`
	PasswordHash   string    `json:"-"`
	StatusMessage  string    `json:"status_message"`
	AvatarURL      string    `json:"avatar_url"`
	PublicKey      string    `json:"public_key,omitempty"`
	KeyVersion     int       `json:"key_version,omitempty"`
	ActiveDeviceID string    `json:"active_device_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// ConversationItem merepresentasikan entitas percakapan di daftar obrolan (Sidebar).
type ConversationItem struct {
	ID             string    `json:"id"`
	Type           string    `json:"type"` // "direct" atau "group"
	Title          string    `json:"title"`
	PeerID         string    `json:"peer_id,omitempty"`
	PeerNickname   string    `json:"peer_nickname,omitempty"`
	PeerPublicKey  string    `json:"peer_public_key,omitempty"`
	PeerAvatarURL  string    `json:"peer_avatar_url,omitempty"`
	LastMessage    string    `json:"last_message"`
	LastSender     string    `json:"last_sender"`
	LastStatus     string    `json:"last_status,omitempty"`
	UnreadCount    int       `json:"unread_count"`
	UpdatedAt      time.Time `json:"updated_at"`
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
	Authenticate(username, password string) (*User, error)
	GetUserByID(id string) (*User, error)
	GetUserByUsername(username string) (*User, error)
	GetUserByUsernameOrDisplayName(name string) (*User, error)
	UpdateProfile(userID, displayName, statusMessage, avatarURL string) (*User, error)
	UpdatePublicKey(userID, publicKey string) error
	UpdatePublicKeyWithDevice(userID, publicKey, deviceID string) (int, error)
	ForceResetPublicKey(userID, publicKey, deviceID string) (int, error)
	GetE2EEInfo(userID string) (publicKey string, keyVersion int, activeDeviceID string, err error)
	SearchUsers(query, excludeUserID string) ([]User, error)
	GetOrCreateDirectConversation(userA, userB string) (string, error)
	GetUserConversations(userID string) ([]ConversationItem, error)
	ClearConversation(conversationID, userID string) error
	GetConversationMemberUsernames(conversationID string) ([]string, error)
	IsUserInConversation(conversationID, userID string) (bool, error)
	SavePushSubscription(sub *PushSubscription) error
	DeletePushSubscription(endpoint string) error
	DeletePushSubscriptionByUser(userID, endpoint string) error
	GetPushSubscriptionsByUserID(userID string) ([]PushSubscription, error)
	GetPushSubscriptionsForRecipients(recipientUserIDs []string) ([]PushSubscription, error)
}

// SQLUserStore adalah implementasi UserStore menggunakan SQL (SQLite & Postgres).
type SQLUserStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLUserStore membuat instance SQLUserStore.
func NewSQLUserStore(db *sql.DB, driverName string) *SQLUserStore {
	return &SQLUserStore{
		db:         db,
		driverName: driverName,
	}
}

// Register mendaftarkan akun baru dengan password bcrypt.
func (s *SQLUserStore) Register(username, displayName, password string) (*User, error) {
	// Cek apakah username sudah ada
	existing, _ := s.GetUserByUsername(username)
	if existing != nil {
		return nil, ErrUserExists
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("gagal hash password: %w", err)
	}

	user := &User{
		ID:            uuid.New().String(),
		Username:      username,
		DisplayName:   displayName,
		PasswordHash:  string(hash),
		StatusMessage: "Tersedia untuk mengobrol",
		AvatarURL:     "",
		CreatedAt:     time.Now().UTC(),
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO users (id, username, display_name, password_hash, status_message, avatar_url, created_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7)`
	} else {
		query = `INSERT INTO users (id, username, display_name, password_hash, status_message, avatar_url, created_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?)`
	}

	_, err = s.db.Exec(query, user.ID, user.Username, user.DisplayName, user.PasswordHash, user.StatusMessage, user.AvatarURL, user.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("gagal simpan user: %w", err)
	}

	return user, nil
}

// Authenticate memverifikasi username & password.
func (s *SQLUserStore) Authenticate(username, password string) (*User, error) {
	user, err := s.GetUserByUsername(username)
	if err != nil {
		return nil, ErrUserNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidPass
	}

	return user, nil
}

// GetUserByID mengambil user berdasarkan ID.
func (s *SQLUserStore) GetUserByID(id string) (*User, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at FROM users WHERE id = $1`
	} else {
		query = `SELECT id, username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at FROM users WHERE id = ?`
	}

	row := s.db.QueryRow(query, id)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.StatusMessage, &u.AvatarURL, &u.PublicKey, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// GetUserByUsername mengambil user berdasarkan username.
func (s *SQLUserStore) GetUserByUsername(username string) (*User, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at FROM users WHERE LOWER(username) = LOWER($1)`
	} else {
		query = `SELECT id, username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at FROM users WHERE LOWER(username) = LOWER(?)`
	}

	row := s.db.QueryRow(query, username)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.StatusMessage, &u.AvatarURL, &u.PublicKey, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// GetUserByUsernameOrDisplayName mengambil user berdasarkan username ATAU display_name.
func (s *SQLUserStore) GetUserByUsernameOrDisplayName(name string) (*User, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at 
		         FROM users 
		         WHERE LOWER(username) = LOWER($1) OR LOWER(display_name) = LOWER($1) 
		         ORDER BY (CASE WHEN LOWER(username) = LOWER($1) THEN 0 ELSE 1 END), created_at DESC
		         LIMIT 1`
	} else {
		query = `SELECT id, username, display_name, password_hash, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at 
		         FROM users 
		         WHERE LOWER(username) = LOWER(?) OR LOWER(display_name) = LOWER(?) 
		         ORDER BY (CASE WHEN LOWER(username) = LOWER(?) THEN 0 ELSE 1 END), created_at DESC
		         LIMIT 1`
	}

	var row *sql.Row
	if s.driverName == "postgres" {
		row = s.db.QueryRow(query, name)
	} else {
		row = s.db.QueryRow(query, name, name, name)
	}

	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.StatusMessage, &u.AvatarURL, &u.PublicKey, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
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

// UpdatePublicKey memperbarui public_key (E2EE) milik user (backward-compatible).
func (s *SQLUserStore) UpdatePublicKey(userID, publicKey string) error {
	_, err := s.UpdatePublicKeyWithDevice(userID, publicKey, "")
	return err
}

// SearchUsers mencari user berdasarkan username atau display_name.
func (s *SQLUserStore) SearchUsers(query, excludeUserID string) ([]User, error) {
	searchPattern := "%" + query + "%"
	var sqlQuery string
	var rows *sql.Rows
	var err error

	if s.driverName == "postgres" {
		sqlQuery = `SELECT id, username, display_name, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at FROM users 
		            WHERE id != $1 AND (LOWER(username) LIKE LOWER($2) OR LOWER(display_name) LIKE LOWER($2)) 
		            ORDER BY username ASC LIMIT 20`
		rows, err = s.db.Query(sqlQuery, excludeUserID, searchPattern)
	} else {
		sqlQuery = `SELECT id, username, display_name, COALESCE(status_message, 'Tersedia untuk mengobrol'), COALESCE(avatar_url, ''), COALESCE(public_key, ''), created_at FROM users 
		            WHERE id != ? AND (LOWER(username) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?)) 
		            ORDER BY username ASC LIMIT 20`
		rows, err = s.db.Query(sqlQuery, excludeUserID, searchPattern, searchPattern)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.StatusMessage, &u.AvatarURL, &u.PublicKey, &u.CreatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}
	return users, nil
}

// GetOrCreateDirectConversation membuat atau mengembalikan ID percakapan 1-on-1 antar dua user.
func (s *SQLUserStore) GetOrCreateDirectConversation(userA, userB string) (string, error) {
	// 1. Cek terlebih dahulu apakah sudah ada percakapan direct aktif antara userA dan userB via relational membership
	var existingQuery string
	if s.driverName == "postgres" {
		existingQuery = `
			SELECT c.id FROM conversations c
			JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
			JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
			WHERE c.type = 'direct'
			LIMIT 1
		`
	} else {
		existingQuery = `
			SELECT c.id FROM conversations c
			JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
			JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
			WHERE c.type = 'direct'
			LIMIT 1
		`
	}

	var existingID string
	err := s.db.QueryRow(existingQuery, userA, userB).Scan(&existingID)
	if err == nil && existingID != "" {
		return existingID, nil
	}

	// 2. Tentukan ID percakapan deterministik bebas tabrakan (collision-free)
	var firstUser, secondUser string
	if userA < userB {
		firstUser, secondUser = userA, userB
	} else {
		firstUser, secondUser = userB, userA
	}

	directRoomID := fmt.Sprintf("dm_%s_%s", firstUser, secondUser)
	if len(directRoomID) > 128 {
		h := sha256.Sum256([]byte(firstUser + ":" + secondUser))
		directRoomID = fmt.Sprintf("dm_%x", h)
	}

	// 3. Simpan percakapan baru dan daftarkan kedua user sebagai anggota
	now := time.Now().UTC()
	if s.driverName == "postgres" {
		_, err = s.db.Exec(`INSERT INTO conversations (id, type, title, created_at, updated_at) VALUES ($1, 'direct', '', $2, $2) ON CONFLICT (id) DO NOTHING`, directRoomID, now)
		if err == nil {
			_, _ = s.db.Exec(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3), ($1, $4, $3) ON CONFLICT DO NOTHING`, directRoomID, userA, now, userB)
		}
	} else {
		_, err = s.db.Exec(`INSERT OR IGNORE INTO conversations (id, type, title, created_at, updated_at) VALUES (?, 'direct', '', ?, ?)`, directRoomID, now, now)
		if err == nil {
			_, _ = s.db.Exec(`INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?), (?, ?, ?)`, directRoomID, userA, now, directRoomID, userB, now)
		}
	}

	return directRoomID, nil
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

// GetUserConversations mengambil daftar obrolan aktif milik seorang user.
func (s *SQLUserStore) GetUserConversations(userID string) ([]ConversationItem, error) {
	// 1. Ambil seluruh percakapan beserta data lawan bicara (peer) jika direct chat dalam 1 query
	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT 
				c.id, 
				c.type, 
				c.title, 
				c.updated_at, 
				cm.cleared_at,
				COALESCE(peer.id, '') AS peer_id,
				COALESCE(peer.display_name, '') AS peer_nickname,
				COALESCE(peer.public_key, '') AS peer_public_key,
				COALESCE(peer.avatar_url, '') AS peer_avatar_url
			FROM conversations c
			JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = $1
			LEFT JOIN conversation_members peer_cm ON c.id = peer_cm.conversation_id AND peer_cm.user_id != $1 AND c.type = 'direct'
			LEFT JOIN users peer ON peer_cm.user_id = peer.id
			ORDER BY c.updated_at DESC
		`
	} else {
		query = `
			SELECT 
				c.id, 
				c.type, 
				c.title, 
				c.updated_at, 
				cm.cleared_at,
				COALESCE(peer.id, '') AS peer_id,
				COALESCE(peer.display_name, '') AS peer_nickname,
				COALESCE(peer.public_key, '') AS peer_public_key,
				COALESCE(peer.avatar_url, '') AS peer_avatar_url
			FROM conversations c
			JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ?
			LEFT JOIN conversation_members peer_cm ON c.id = peer_cm.conversation_id AND peer_cm.user_id != ? AND c.type = 'direct'
			LEFT JOIN users peer ON peer_cm.user_id = peer.id
			ORDER BY c.updated_at DESC
		`
	}

	var rows *sql.Rows
	var err error
	if s.driverName == "postgres" {
		rows, err = s.db.Query(query, userID)
	} else {
		rows, err = s.db.Query(query, userID, userID)
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
		if err := rows.Scan(
			&rc.item.ID,
			&rc.item.Type,
			&rc.item.Title,
			&rc.item.UpdatedAt,
			&rc.clearedAt,
			&rc.item.PeerID,
			&rc.item.PeerNickname,
			&rc.item.PeerPublicKey,
			&rc.item.PeerAvatarURL,
		); err != nil {
			continue
		}
		if rc.item.Type == "direct" && rc.item.Title == "" {
			rc.item.Title = rc.item.PeerNickname
		}
		rawConvs = append(rawConvs, rc)
	}
	rows.Close()

	if len(rawConvs) == 0 {
		return []ConversationItem{}, nil
	}

	currentUser, _ := s.GetUserByID(userID)
	currentName := ""
	currentUsername := ""
	if currentUser != nil {
		currentName = currentUser.DisplayName
		currentUsername = currentUser.Username
	}

	// 2. Ambil pesan terakhir untuk semua percakapan dalam 1 query menggunakan CTE & ROW_NUMBER()
	type lastMsg struct {
		snippet   string
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
					m.from_nickname,
					COALESCE(m.status, 'sent') AS status,
					m.created_at,
					ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC) as rn
				FROM messages m
				JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = $1
				WHERE (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			)
			SELECT room_id, snippet, from_nickname, status, created_at
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
					m.from_nickname,
					COALESCE(m.status, 'sent') AS status,
					m.created_at,
					ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC) as rn
				FROM messages m
				JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = ?
				WHERE (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			)
			SELECT room_id, snippet, from_nickname, status, created_at
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
			if err := msgRows.Scan(&roomID, &lm.snippet, &lm.sender, &lm.status, &lm.createdAt); err == nil {
				lastMessages[roomID] = lm
			}
		}
		msgRows.Close()
	}

	// 3. Ambil unread count untuk semua percakapan dalam 1 query
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
			  AND LOWER(m.from_nickname) != LOWER($2)
			  AND LOWER(m.from_nickname) != LOWER($3)
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
			  AND LOWER(m.from_nickname) != LOWER(?)
			  AND LOWER(m.from_nickname) != LOWER(?)
			  AND m.status != 'read'
			GROUP BY m.room_id
		`
	}

	unreadRows, err := s.db.Query(unreadQuery, userID, currentName, currentUsername)
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
			rc.item.LastStatus = lm.status
			rc.item.UpdatedAt = lm.createdAt
		}

		rc.item.UnreadCount = unreadCounts[rc.item.ID]
		items = append(items, rc.item)
	}

	// Urutkan percakapan secara dinamis berdasarkan waktu pesan/update terbaru (descending)
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].UpdatedAt.After(items[j].UpdatedAt)
	})

	return items, nil
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

	// 1. Cek apakah user terdaftar sebagai member resmi di tabel conversation_members
	var query string
	if s.driverName == "postgres" {
		query = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
	} else {
		query = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
	}

	var count int
	err := s.db.QueryRow(query, conversationID, userID).Scan(&count)
	if err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// 2. Cek apakah room ini terdaftar di tabel conversations
	// Jika room adalah percakapan terdaftar dan user BUKAN anggota -> tolak (false)
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

	// 3. Jika berupa direct message pattern 'dm_...' tapi belum tersimpan di DB
	// Tolak akses jika formatnya direct message untuk mencegah akses liar
	if strings.HasPrefix(conversationID, "dm_") {
		return false, nil
	}

	// 4. Untuk room publik / ad-hoc group biasa (misal 'room-123', 'room-kopi'), siapapun yang memegang link diizinkan
	return true, nil
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



