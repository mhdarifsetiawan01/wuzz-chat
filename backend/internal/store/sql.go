package store

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

// SQLMessageStore adalah implementasi MessageStore berbasis SQL
// yang mendukung SQLite (lokal file) dan PostgreSQL (lokal / Supabase cloud).
type SQLMessageStore struct {
	db         *sql.DB
	driverName string // "sqlite" atau "postgres"
}

// NewSQLMessageStore menginisialisasi koneksi database dan menjalankan auto-migration.
func NewSQLMessageStore(driverName, dataSourceName string) (*SQLMessageStore, error) {
	db, err := sql.Open(driverName, dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("gagal membuka database (%s): %w", driverName, err)
	}

	// Konfigurasi connection pool yang aman
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Uji koneksi
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("gagal terhubung ke database (%s): %w", driverName, err)
	}

	store := &SQLMessageStore{
		db:         db,
		driverName: driverName,
	}

	// Buat tabel jika belum ada (auto-migration)
	if err := store.autoMigrate(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("auto migration gagal: %w", err)
	}

	log.Printf("📦 Database berhasil terhubung (Driver: %s)", driverName)
	return store, nil
}

// autoMigrate memastikan tabel yang diperlukan sudah tersedia di database.
func (s *SQLMessageStore) autoMigrate() error {
	migrations := []string{
		// Tabel Users
		`CREATE TABLE IF NOT EXISTS users (
			id VARCHAR(64) PRIMARY KEY,
			username VARCHAR(64) UNIQUE NOT NULL,
			display_name VARCHAR(128) NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			avatar_url TEXT DEFAULT '',
			created_at TIMESTAMP NOT NULL
		);`,
		// Index Users
		`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`,
		// Tabel Conversations
		`CREATE TABLE IF NOT EXISTS conversations (
			id VARCHAR(128) PRIMARY KEY,
			type VARCHAR(32) NOT NULL,
			title VARCHAR(128) DEFAULT '',
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL
		);`,
		// Tabel Conversation Members
		`CREATE TABLE IF NOT EXISTS conversation_members (
			conversation_id VARCHAR(128) NOT NULL,
			user_id VARCHAR(64) NOT NULL,
			joined_at TIMESTAMP NOT NULL,
			PRIMARY KEY (conversation_id, user_id)
		);`,
		// Tabel Messages
		`CREATE TABLE IF NOT EXISTS messages (
			id VARCHAR(64) PRIMARY KEY,
			room_id VARCHAR(128) NOT NULL,
			from_id VARCHAR(64) NOT NULL,
			from_nickname VARCHAR(64) NOT NULL,
			to_id VARCHAR(64) NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL
		);`,
		// Index Messages
		`CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id, created_at);`,
	}

	for _, query := range migrations {
		if _, err := s.db.Exec(query); err != nil {
			return fmt.Errorf("gagal eksekusi migrasi (%s): %w", query, err)
		}
	}

	// Auto-migration non-destruktif untuk kolom status di tabel messages
	if s.driverName == "postgres" {
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'sent';`)
	} else {
		// SQLite ALTER TABLE ADD COLUMN
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN status VARCHAR(32) DEFAULT 'sent';`)
	}

	log.Printf("🛠️ [Auto-Migration] Tabel 'users', 'conversations', 'conversation_members', dan 'messages' (dengan status receipts) berhasil dipastikan ada!")
	return nil
}

// DB mengembalikan objek *sql.DB mentah untuk digunakan oleh store lain.
func (s *SQLMessageStore) DB() *sql.DB {
	return s.db
}

// DriverName mengembalikan nama driver database.
func (s *SQLMessageStore) DriverName() string {
	return s.driverName
}

// Save menyimpan pesan ke database.
func (s *SQLMessageStore) Save(msg StoredMessage) error {
	status := msg.Status
	if status == "" {
		status = "sent"
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, status, created_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	} else {
		query = `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, status, created_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.Exec(
		query,
		msg.ID,
		msg.RoomID,
		msg.FromID,
		msg.Nickname,
		msg.ToID,
		msg.Content,
		status,
		msg.Timestamp.UTC(),
	)
	return err
}

// UpdateMessageStatus memperbarui status tanda terima pesan (sent, delivered, read).
func (s *SQLMessageStore) UpdateMessageStatus(msgID string, status string) error {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE messages SET status = $1 WHERE id = $2`
	} else {
		query = `UPDATE messages SET status = ? WHERE id = ?`
	}
	_, err := s.db.Exec(query, status, msgID)
	return err
}

// MarkRoomMessagesAsRead menandai seluruh pesan di room tertentu yang bukan dikirim oleh excludeNickname sebagai 'read'.
func (s *SQLMessageStore) MarkRoomMessagesAsRead(roomID, excludeNickname string) error {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE messages SET status = 'read' WHERE room_id = $1 AND LOWER(from_nickname) != LOWER($2) AND status != 'read'`
	} else {
		query = `UPDATE messages SET status = 'read' WHERE room_id = ? AND LOWER(from_nickname) != LOWER(?) AND status != 'read'`
	}
	_, err := s.db.Exec(query, roomID, excludeNickname)
	return err
}

// GetRoomHistory mengambil riwayat pesan dalam suatu room/percakapan.
func (s *SQLMessageStore) GetRoomHistory(roomID string, limit int) ([]StoredMessage, error) {
	if limit <= 0 {
		limit = 50
	}

	var query string
	if s.driverName == "postgres" {
		query = `
		SELECT id, room_id, from_id, from_nickname, to_id, content, COALESCE(status, 'sent'), created_at
		FROM (
			SELECT id, room_id, from_id, from_nickname, to_id, content, status, created_at
			FROM messages
			WHERE room_id = $1
			ORDER BY created_at DESC
			LIMIT $2
		) sub
		ORDER BY created_at ASC;`
	} else {
		query = `
		SELECT id, room_id, from_id, from_nickname, to_id, content, COALESCE(status, 'sent'), created_at
		FROM (
			SELECT id, room_id, from_id, from_nickname, to_id, content, status, created_at
			FROM messages
			WHERE room_id = ?
			ORDER BY created_at DESC
			LIMIT ?
		) sub
		ORDER BY created_at ASC;`
	}

	rows, err := s.db.Query(query, roomID, limit)
	if err != nil {
		return nil, fmt.Errorf("gagal query history: %w", err)
	}
	defer rows.Close()

	var history []StoredMessage
	for rows.Next() {
		var m StoredMessage
		var createdAt time.Time
		var status string
		if err := rows.Scan(
			&m.ID,
			&m.RoomID,
			&m.FromID,
			&m.Nickname,
			&m.ToID,
			&m.Content,
			&status,
			&createdAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan baris history: %w", err)
		}
		m.Status = status
		m.Timestamp = createdAt.UTC()
		history = append(history, m)
	}

	if history == nil {
		history = []StoredMessage{}
	}

	return history, nil
}

// Close menutup koneksi pool database.
func (s *SQLMessageStore) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

var _ MessageStore = (*SQLMessageStore)(nil)
