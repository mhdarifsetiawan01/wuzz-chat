package store

import (
	"database/sql"
	"errors"
	"fmt"
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
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"display_name"`
	PasswordHash string    `json:"-"`
	AvatarURL    string    `json:"avatar_url"`
	CreatedAt    time.Time `json:"created_at"`
}

// ConversationItem merepresentasikan entitas percakapan di daftar obrolan (Sidebar).
type ConversationItem struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"` // "direct" atau "group"
	Title        string    `json:"title"`
	PeerID       string    `json:"peer_id,omitempty"`
	PeerNickname string    `json:"peer_nickname,omitempty"`
	LastMessage  string    `json:"last_message"`
	LastSender   string    `json:"last_sender"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// UserStore mendefinisikan kontrak operasi user dan percakapan.
type UserStore interface {
	Register(username, displayName, password string) (*User, error)
	Authenticate(username, password string) (*User, error)
	GetUserByID(id string) (*User, error)
	GetUserByUsername(username string) (*User, error)
	SearchUsers(query, excludeUserID string) ([]User, error)
	GetOrCreateDirectConversation(userA, userB string) (string, error)
	GetUserConversations(userID string) ([]ConversationItem, error)
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
		ID:           uuid.New().String(),
		Username:     username,
		DisplayName:  displayName,
		PasswordHash: string(hash),
		AvatarURL:    "",
		CreatedAt:    time.Now().UTC(),
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO users (id, username, display_name, password_hash, avatar_url, created_at)
		         VALUES ($1, $2, $3, $4, $5, $6)`
	} else {
		query = `INSERT INTO users (id, username, display_name, password_hash, avatar_url, created_at)
		         VALUES (?, ?, ?, ?, ?, ?)`
	}

	_, err = s.db.Exec(query, user.ID, user.Username, user.DisplayName, user.PasswordHash, user.AvatarURL, user.CreatedAt)
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
		query = `SELECT id, username, display_name, password_hash, avatar_url, created_at FROM users WHERE id = $1`
	} else {
		query = `SELECT id, username, display_name, password_hash, avatar_url, created_at FROM users WHERE id = ?`
	}

	row := s.db.QueryRow(query, id)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.AvatarURL, &u.CreatedAt); err != nil {
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
		query = `SELECT id, username, display_name, password_hash, avatar_url, created_at FROM users WHERE LOWER(username) = LOWER($1)`
	} else {
		query = `SELECT id, username, display_name, password_hash, avatar_url, created_at FROM users WHERE LOWER(username) = LOWER(?)`
	}

	row := s.db.QueryRow(query, username)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.PasswordHash, &u.AvatarURL, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// SearchUsers mencari user berdasarkan username atau display_name.
func (s *SQLUserStore) SearchUsers(query, excludeUserID string) ([]User, error) {
	searchPattern := "%" + query + "%"
	var sqlQuery string
	var rows *sql.Rows
	var err error

	if s.driverName == "postgres" {
		sqlQuery = `SELECT id, username, display_name, avatar_url, created_at FROM users 
		            WHERE id != $1 AND (LOWER(username) LIKE LOWER($2) OR LOWER(display_name) LIKE LOWER($2)) 
		            ORDER BY username ASC LIMIT 20`
		rows, err = s.db.Query(sqlQuery, excludeUserID, searchPattern)
	} else {
		sqlQuery = `SELECT id, username, display_name, avatar_url, created_at FROM users 
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
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.CreatedAt); err != nil {
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

	directRoomID := fmt.Sprintf("dm_%s_%s", firstUser[:8], secondUser[:8])

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

// GetUserConversations mengambil daftar obrolan aktif milik seorang user.
func (s *SQLUserStore) GetUserConversations(userID string) ([]ConversationItem, error) {
	// Query percakapan yang diikuti user
	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT c.id, c.type, c.title, c.updated_at
			FROM conversations c
			JOIN conversation_members cm ON c.id = cm.conversation_id
			WHERE cm.user_id = $1
			ORDER BY c.updated_at DESC
		`
	} else {
		query = `
			SELECT c.id, c.type, c.title, c.updated_at
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

	var items []ConversationItem
	for rows.Next() {
		var item ConversationItem
		if err := rows.Scan(&item.ID, &item.Type, &item.Title, &item.UpdatedAt); err != nil {
			continue
		}

		// Jika direct message, cari nama peer (lawan bicara)
		if item.Type == "direct" {
			var peerQuery string
			if s.driverName == "postgres" {
				peerQuery = `SELECT u.id, u.display_name FROM users u 
				             JOIN conversation_members cm ON u.id = cm.user_id 
				             WHERE cm.conversation_id = $1 AND u.id != $2 LIMIT 1`
			} else {
				peerQuery = `SELECT u.id, u.display_name FROM users u 
				             JOIN conversation_members cm ON u.id = cm.user_id 
				             WHERE cm.conversation_id = ? AND u.id != ? LIMIT 1`
			}
			_ = s.db.QueryRow(peerQuery, item.ID, userID).Scan(&item.PeerID, &item.PeerNickname)
			if item.Title == "" {
				item.Title = item.PeerNickname
			}
		}

		// Ambil pesan terakhir
		var msgQuery string
		if s.driverName == "postgres" {
			msgQuery = `SELECT content, from_nickname, created_at FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`
		} else {
			msgQuery = `SELECT content, from_nickname, created_at FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1`
		}
		var msgTime time.Time
		if err := s.db.QueryRow(msgQuery, item.ID).Scan(&item.LastMessage, &item.LastSender, &msgTime); err == nil {
			item.UpdatedAt = msgTime
		}

		items = append(items, item)
	}

	return items, nil
}
