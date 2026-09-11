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
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS messages (
		id VARCHAR(64) PRIMARY KEY,
		room_id VARCHAR(128) NOT NULL,
		from_id VARCHAR(64) NOT NULL,
		from_nickname VARCHAR(64) NOT NULL,
		to_id VARCHAR(64) NOT NULL,
		content TEXT NOT NULL,
		created_at TIMESTAMP NOT NULL
	)`

	if _, err := s.db.Exec(createTableSQL); err != nil {
		return fmt.Errorf("gagal membuat tabel messages: %w", err)
	}

	createIndexSQL := `CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id, created_at)`
	if _, err := s.db.Exec(createIndexSQL); err != nil {
		return fmt.Errorf("gagal membuat index messages: %w", err)
	}

	log.Printf("🛠️ [Auto-Migration] Tabel 'messages' dan index berhasil dipastikan ada di database!")
	return nil
}

// Save menyimpan pesan ke database.
func (s *SQLMessageStore) Save(msg StoredMessage) error {
	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, created_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7)`
	} else {
		query = `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, created_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.Exec(
		query,
		msg.ID,
		msg.RoomID,
		msg.FromID,
		msg.Nickname,
		msg.ToID,
		msg.Content,
		msg.Timestamp.UTC(),
	)
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
		SELECT id, room_id, from_id, from_nickname, to_id, content, created_at
		FROM (
			SELECT id, room_id, from_id, from_nickname, to_id, content, created_at
			FROM messages
			WHERE room_id = $1
			ORDER BY created_at DESC
			LIMIT $2
		) sub
		ORDER BY created_at ASC;`
	} else {
		query = `
		SELECT id, room_id, from_id, from_nickname, to_id, content, created_at
		FROM (
			SELECT id, room_id, from_id, from_nickname, to_id, content, created_at
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
		if err := rows.Scan(
			&m.ID,
			&m.RoomID,
			&m.FromID,
			&m.Nickname,
			&m.ToID,
			&m.Content,
			&createdAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan baris history: %w", err)
		}
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
