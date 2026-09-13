package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists   = errors.New("username sudah digunakan")
	ErrUserNotFound = errors.New("user tidak ditemukan")
	ErrInvalidPass  = errors.New("password salah")
)

// User merepresentasikan entitas akun user terdaftar.
type User struct {
	ID            string    `json:"id"`
	Username      string    `json:"username"`
	DisplayName   string    `json:"display_name"`
	PasswordHash  string    `json:"-"`
	StatusMessage string    `json:"status_message"`
	AvatarURL     string    `json:"avatar_url"`
	PublicKey     string    `json:"public_key,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// ConversationItem merepresentasikan entitas percakapan di daftar obrolan (Sidebar).
type ConversationItem struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"` // "direct" atau "group"
	Title         string    `json:"title"`
	PeerID        string    `json:"peer_id,omitempty"`
	PeerNickname  string    `json:"peer_nickname,omitempty"`
	PeerPublicKey string    `json:"peer_public_key,omitempty"`
	LastMessage   string    `json:"last_message"`
	LastSender    string    `json:"last_sender"`
	LastStatus    string    `json:"last_status,omitempty"`
	UnreadCount   int       `json:"unread_count"`
	UpdatedAt     time.Time `json:"updated_at"`
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
	SearchUsers(query, excludeUserID string) ([]User, error)
	GetOrCreateDirectConversation(userA, userB string) (string, error)
	GetUserConversations(userID string) ([]ConversationItem, error)
	ClearConversation(conversationID, userID string) error
	GetConversationMemberUsernames(conversationID string) ([]string, error)
	IsUserInConversation(conversationID, userID string) (bool, error)
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

// UpdatePublicKey memperbarui public_key (E2EE) milik user.
func (s *SQLUserStore) UpdatePublicKey(userID, publicKey string) error {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE users SET public_key = $1 WHERE id = $2`
	} else {
		query = `UPDATE users SET public_key = ? WHERE id = ?`
	}

	_, err := s.db.Exec(query, strings.TrimSpace(publicKey), userID)
	if err != nil {
		return fmt.Errorf("gagal update public key: %w", err)
	}
	return nil
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
	// Pastikan urutan deterministik untuk mencari room direct yang sudah ada
	var firstUser, secondUser string
	if userA < userB {
		firstUser, secondUser = userA, userB
	} else {
		firstUser, secondUser = userB, userA
	}

	directRoomID := fmt.Sprintf("dm_%s_%s", safePrefix(firstUser, 8), safePrefix(secondUser, 8))

	// Periksa apakah percakapan sudah ada
	var existingID string
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id FROM conversations WHERE id = $1`
	} else {
		query = `SELECT id FROM conversations WHERE id = ?`
	}

	err := s.db.QueryRow(query, directRoomID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}

	// Buat conversation baru
	now := time.Now().UTC()
	if s.driverName == "postgres" {
		_, err = s.db.Exec(`INSERT INTO conversations (id, type, title, created_at, updated_at) VALUES ($1, 'direct', '', $2, $2)`, directRoomID, now)
		if err == nil {
			_, _ = s.db.Exec(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3), ($1, $4, $3)`, directRoomID, userA, now, userB)
		}
	} else {
		_, err = s.db.Exec(`INSERT INTO conversations (id, type, title, created_at, updated_at) VALUES (?, 'direct', '', ?, ?)`, directRoomID, now, now)
		if err == nil {
			_, _ = s.db.Exec(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?), (?, ?, ?)`, directRoomID, userA, now, directRoomID, userB, now)
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
	// Query percakapan yang diikuti user
	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT c.id, c.type, c.title, c.updated_at, cm.cleared_at
			FROM conversations c
			JOIN conversation_members cm ON c.id = cm.conversation_id
			WHERE cm.user_id = $1
			ORDER BY c.updated_at DESC
		`
	} else {
		query = `
			SELECT c.id, c.type, c.title, c.updated_at, cm.cleared_at
			FROM conversations c
			JOIN conversation_members cm ON c.id = cm.conversation_id
			WHERE cm.user_id = ?
			ORDER BY c.updated_at DESC
		`
	}

	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	currentUser, _ := s.GetUserByID(userID)
	currentName := ""
	currentUsername := ""
	if currentUser != nil {
		currentName = currentUser.DisplayName
		currentUsername = currentUser.Username
	}

	var items []ConversationItem
	for rows.Next() {
		var item ConversationItem
		var clearedAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.Type, &item.Title, &item.UpdatedAt, &clearedAt); err != nil {
			continue
		}

		// Jika direct message, cari nama peer (lawan bicara) dan public key-nya
		if item.Type == "direct" {
			var peerQuery string
			if s.driverName == "postgres" {
				peerQuery = `SELECT u.id, u.display_name, COALESCE(u.public_key, '') FROM users u 
				             JOIN conversation_members cm ON u.id = cm.user_id 
				             WHERE cm.conversation_id = $1 AND u.id != $2 LIMIT 1`
			} else {
				peerQuery = `SELECT u.id, u.display_name, COALESCE(u.public_key, '') FROM users u 
				             JOIN conversation_members cm ON u.id = cm.user_id 
				             WHERE cm.conversation_id = ? AND u.id != ? LIMIT 1`
			}
			_ = s.db.QueryRow(peerQuery, item.ID, userID).Scan(&item.PeerID, &item.PeerNickname, &item.PeerPublicKey)
			if item.Title == "" {
				item.Title = item.PeerNickname
			}
		}

		// Ambil pesan terakhir (termasuk format snippet untuk media)
		var msgQuery string
		var msgErr error
		var msgTime time.Time

		if clearedAt.Valid {
			if s.driverName == "postgres" {
				msgQuery = `SELECT 
					CASE 
						WHEN content IS NOT NULL AND content != '' THEN content
						WHEN media_type = 'image' THEN '📷 Foto'
						WHEN media_type = 'audio' THEN '🎙️ Pesan Suara'
						WHEN media_type = 'video' THEN '🎥 Video'
						WHEN media_url IS NOT NULL AND media_url != '' THEN '📎 ' || COALESCE(NULLIF(file_name, ''), 'Berkas')
						ELSE ''
					END AS snippet, 
					from_nickname, COALESCE(status, 'sent'), created_at 
				FROM messages WHERE room_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 1`
			} else {
				msgQuery = `SELECT 
					CASE 
						WHEN content IS NOT NULL AND content != '' THEN content
						WHEN media_type = 'image' THEN '📷 Foto'
						WHEN media_type = 'audio' THEN '🎙️ Pesan Suara'
						WHEN media_type = 'video' THEN '🎥 Video'
						WHEN media_url IS NOT NULL AND media_url != '' THEN '📎 ' || COALESCE(NULLIF(file_name, ''), 'Berkas')
						ELSE ''
					END AS snippet, 
					from_nickname, COALESCE(status, 'sent'), created_at 
				FROM messages WHERE room_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1`
			}
			msgErr = s.db.QueryRow(msgQuery, item.ID, clearedAt.Time).Scan(&item.LastMessage, &item.LastSender, &item.LastStatus, &msgTime)
			if msgErr == sql.ErrNoRows {
				// Percakapan telah di-clear oleh user dan belum ada pesan baru -> sembunyikan dari sidebar
				continue
			}
		} else {
			if s.driverName == "postgres" {
				msgQuery = `SELECT 
					CASE 
						WHEN content IS NOT NULL AND content != '' THEN content
						WHEN media_type = 'image' THEN '📷 Foto'
						WHEN media_type = 'audio' THEN '🎙️ Pesan Suara'
						WHEN media_type = 'video' THEN '🎥 Video'
						WHEN media_url IS NOT NULL AND media_url != '' THEN '📎 ' || COALESCE(NULLIF(file_name, ''), 'Berkas')
						ELSE ''
					END AS snippet, 
					from_nickname, COALESCE(status, 'sent'), created_at 
				FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`
			} else {
				msgQuery = `SELECT 
					CASE 
						WHEN content IS NOT NULL AND content != '' THEN content
						WHEN media_type = 'image' THEN '📷 Foto'
						WHEN media_type = 'audio' THEN '🎙️ Pesan Suara'
						WHEN media_type = 'video' THEN '🎥 Video'
						WHEN media_url IS NOT NULL AND media_url != '' THEN '📎 ' || COALESCE(NULLIF(file_name, ''), 'Berkas')
						ELSE ''
					END AS snippet, 
					from_nickname, COALESCE(status, 'sent'), created_at 
				FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1`
			}
			msgErr = s.db.QueryRow(msgQuery, item.ID).Scan(&item.LastMessage, &item.LastSender, &item.LastStatus, &msgTime)
		}

		if msgErr == nil {
			item.UpdatedAt = msgTime
		}

		// Hitung jumlah pesan belum dibaca dari lawan bicara
		var unreadQuery string
		if clearedAt.Valid {
			if s.driverName == "postgres" {
				unreadQuery = `SELECT COUNT(*) FROM messages 
				               WHERE room_id = $1 
				                 AND LOWER(from_nickname) != LOWER($2) 
				                 AND LOWER(from_nickname) != LOWER($3) 
				                 AND status != 'read'
				                 AND created_at > $4`
			} else {
				unreadQuery = `SELECT COUNT(*) FROM messages 
				               WHERE room_id = ? 
				                 AND LOWER(from_nickname) != LOWER(?) 
				                 AND LOWER(from_nickname) != LOWER(?) 
				                 AND status != 'read'
				                 AND created_at > ?`
			}
			_ = s.db.QueryRow(unreadQuery, item.ID, currentName, currentUsername, clearedAt.Time).Scan(&item.UnreadCount)
		} else {
			if s.driverName == "postgres" {
				unreadQuery = `SELECT COUNT(*) FROM messages 
				               WHERE room_id = $1 
				                 AND LOWER(from_nickname) != LOWER($2) 
				                 AND LOWER(from_nickname) != LOWER($3) 
				                 AND status != 'read'`
			} else {
				unreadQuery = `SELECT COUNT(*) FROM messages 
				               WHERE room_id = ? 
				                 AND LOWER(from_nickname) != LOWER(?) 
				                 AND LOWER(from_nickname) != LOWER(?) 
				                 AND status != 'read'`
			}
			_ = s.db.QueryRow(unreadQuery, item.ID, currentName, currentUsername).Scan(&item.UnreadCount)
		}

		items = append(items, item)
	}

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



