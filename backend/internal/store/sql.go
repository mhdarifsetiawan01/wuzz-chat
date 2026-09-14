package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
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

	if driverName == "sqlite" {
		_, _ = db.Exec("PRAGMA journal_mode=WAL;")
		_, _ = db.Exec("PRAGMA busy_timeout=5000;")
	}

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
			status_message VARCHAR(255) DEFAULT 'Tersedia untuk mengobrol',
			avatar_url TEXT DEFAULT '',
			public_key TEXT DEFAULT '',
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
		`CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);`,
		`CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON conversation_members(conversation_id);`,
		// Tabel Push Subscriptions (Multi-Platform: Web, Android, iOS)
		`CREATE TABLE IF NOT EXISTS push_subscriptions (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(64) NOT NULL,
			platform VARCHAR(32) NOT NULL DEFAULT 'web',
			endpoint TEXT NOT NULL,
			p256dh_key TEXT DEFAULT '',
			auth_key TEXT DEFAULT '',
			created_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);`,
	}

	for _, query := range migrations {
		if _, err := s.db.Exec(query); err != nil {
			return fmt.Errorf("gagal eksekusi migrasi (%s): %w", query, err)
		}
	}

	// Auto-migration non-destruktif untuk kolom status, reply_to, reactions, media, dan public_key di tabel messages & users
	if s.driverName == "postgres" {
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_message VARCHAR(255) DEFAULT 'Tersedia untuk mengobrol';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'sent';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_nickname VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_content TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(32) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name VARCHAR(255) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_status VARCHAR(32) DEFAULT 'active';`)
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_users TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(room_id, status);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_to_status ON messages(to_id, status);`)
	} else {
		// SQLite ALTER TABLE ADD COLUMN
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN status_message VARCHAR(255) DEFAULT 'Tersedia untuk mengobrol';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN public_key TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN status VARCHAR(32) DEFAULT 'sent';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN reply_to_id VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN reply_to_nickname VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN reply_to_content TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN media_url TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN media_type VARCHAR(32) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN file_name VARCHAR(255) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN file_size BIGINT DEFAULT 0;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN media_status VARCHAR(32) DEFAULT 'active';`)
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN cleared_at TIMESTAMP DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN deleted_for_users TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(room_id, status);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_to_status ON messages(to_id, status);`)
	}

	log.Printf("🛠️ [Auto-Migration] Tabel 'users', 'conversations', 'conversation_members' (dengan cleared_at), dan 'messages' (dengan status receipts, reply, reactions, media lifecycle, is_deleted, dan user bio) berhasil dipastikan ada!")
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
	reactions := msg.Reactions
	if reactions == "" {
		reactions = "[]"
	}
	mediaStatus := msg.MediaStatus
	if mediaStatus == "" {
		mediaStatus = "active"
	}
	deletedForUsers := msg.DeletedForUsers
	if deletedForUsers == "" {
		deletedForUsers = "[]"
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, created_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`
	} else {
		query = `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, created_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
		msg.ReplyToID,
		msg.ReplyToNickname,
		msg.ReplyToContent,
		reactions,
		msg.MediaURL,
		msg.MediaType,
		msg.FileName,
		msg.FileSize,
		mediaStatus,
		msg.IsDeleted,
		deletedForUsers,
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

// ToggleReaction menambah atau menghapus reaksi emoji user terhadap pesan tertentu.
func (s *SQLMessageStore) ToggleReaction(msgID, emoji, userNickname string) (string, error) {
	if msgID == "" || emoji == "" || userNickname == "" {
		return "[]", nil
	}

	// 1. Ambil reaksi saat ini
	var rawReactions sql.NullString
	var queryGet string
	if s.driverName == "postgres" {
		queryGet = `SELECT reactions FROM messages WHERE id = $1`
	} else {
		queryGet = `SELECT reactions FROM messages WHERE id = ?`
	}
	if err := s.db.QueryRow(queryGet, msgID).Scan(&rawReactions); err != nil {
		return "[]", err
	}

	var items []struct {
		Emoji string   `json:"emoji"`
		Users []string `json:"users"`
		Count int      `json:"count"`
	}

	if rawReactions.Valid && rawReactions.String != "" {
		_ = json.Unmarshal([]byte(rawReactions.String), &items)
	}

	// 2. Toggle emoji untuk userNickname
	foundEmoji := false
	var updatedItems []struct {
		Emoji string   `json:"emoji"`
		Users []string `json:"users"`
		Count int      `json:"count"`
	}

	for _, item := range items {
		if item.Emoji == emoji {
			foundEmoji = true
			userExists := false
			var newUsers []string
			for _, u := range item.Users {
				if strings.EqualFold(u, userNickname) {
					userExists = true
				} else {
					newUsers = append(newUsers, u)
				}
			}
			if !userExists {
				newUsers = append(newUsers, userNickname)
			}
			if len(newUsers) > 0 {
				updatedItems = append(updatedItems, struct {
					Emoji string   `json:"emoji"`
					Users []string `json:"users"`
					Count int      `json:"count"`
				}{
					Emoji: emoji,
					Users: newUsers,
					Count: len(newUsers),
				})
			}
		} else {
			updatedItems = append(updatedItems, item)
		}
	}

	if !foundEmoji {
		updatedItems = append(updatedItems, struct {
			Emoji string   `json:"emoji"`
			Users []string `json:"users"`
			Count int      `json:"count"`
		}{
			Emoji: emoji,
			Users: []string{userNickname},
			Count: 1,
		})
	}

	bytes, _ := json.Marshal(updatedItems)
	jsonStr := string(bytes)

	// 3. Simpan kembali ke database
	var queryUpdate string
	if s.driverName == "postgres" {
		queryUpdate = `UPDATE messages SET reactions = $1 WHERE id = $2`
	} else {
		queryUpdate = `UPDATE messages SET reactions = ? WHERE id = ?`
	}
	_, err := s.db.Exec(queryUpdate, jsonStr, msgID)
	return jsonStr, err
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

// MarkUserMessagesAsDelivered menandai seluruh pesan berstatus 'sent' dari pengirim lain menjadi 'delivered'.
// Mengembalikan daftar room_id yang terpengaruh.
func (s *SQLMessageStore) MarkUserMessagesAsDelivered(userNickname string) ([]string, error) {
	if userNickname == "" {
		return nil, nil
	}

	var querySelect string
	if s.driverName == "postgres" {
		querySelect = `SELECT DISTINCT room_id FROM messages WHERE LOWER(from_nickname) != LOWER($1) AND status = 'sent'`
	} else {
		querySelect = `SELECT DISTINCT room_id FROM messages WHERE LOWER(from_nickname) != LOWER(?) AND status = 'sent'`
	}

	rows, err := s.db.Query(querySelect, userNickname)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roomIDs []string
	for rows.Next() {
		var rID string
		if err := rows.Scan(&rID); err == nil && rID != "" {
			roomIDs = append(roomIDs, rID)
		}
	}

	if len(roomIDs) == 0 {
		return nil, nil
	}

	var queryUpdate string
	if s.driverName == "postgres" {
		queryUpdate = `UPDATE messages SET status = 'delivered' WHERE LOWER(from_nickname) != LOWER($1) AND status = 'sent'`
	} else {
		queryUpdate = `UPDATE messages SET status = 'delivered' WHERE LOWER(from_nickname) != LOWER(?) AND status = 'sent'`
	}
	_, err = s.db.Exec(queryUpdate, userNickname)
	return roomIDs, err
}

// GetRoomHistory mengambil riwayat pesan dalam suatu room/percakapan (default).
func (s *SQLMessageStore) GetRoomHistory(roomID string, limit int) ([]StoredMessage, error) {
	return s.GetRoomHistoryForUser(roomID, "", limit)
}

// GetRoomHistoryForUser mengambil riwayat pesan dalam suatu room yang difilter berdasarkan cleared_at milik userID (jika ada).
func (s *SQLMessageStore) GetRoomHistoryForUser(roomID, userID string, limit int) ([]StoredMessage, error) {
	if limit <= 0 {
		limit = 50
	}

	var query string
	var rows *sql.Rows
	var err error

	if userID != "" {
		if s.driverName == "postgres" {
			query = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), created_at
			FROM (
				SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, m.status, m.reply_to_id, m.reply_to_nickname, m.reply_to_content, m.reactions, m.media_url, m.media_type, m.file_name, m.file_size, m.media_status, m.is_deleted, m.deleted_for_users, m.created_at
				FROM messages m
				LEFT JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = $1
				WHERE m.room_id = $2
				  AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
				ORDER BY m.created_at DESC
				LIMIT $3
			) sub
			ORDER BY created_at ASC;`
			rows, err = s.db.Query(query, userID, roomID, limit)
		} else {
			query = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), created_at
			FROM (
				SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, m.status, m.reply_to_id, m.reply_to_nickname, m.reply_to_content, m.reactions, m.media_url, m.media_type, m.file_name, m.file_size, m.media_status, m.is_deleted, m.deleted_for_users, m.created_at
				FROM messages m
				LEFT JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = ?
				WHERE m.room_id = ?
				  AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
				ORDER BY m.created_at DESC
				LIMIT ?
			) sub
			ORDER BY created_at ASC;`
			rows, err = s.db.Query(query, userID, roomID, limit)
		}
	} else {
		if s.driverName == "postgres" {
			query = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), created_at
			FROM (
				SELECT id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, created_at
				FROM messages
				WHERE room_id = $1
				ORDER BY created_at DESC
				LIMIT $2
			) sub
			ORDER BY created_at ASC;`
			rows, err = s.db.Query(query, roomID, limit)
		} else {
			query = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), created_at
			FROM (
				SELECT id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, created_at
				FROM messages
				WHERE room_id = ?
				ORDER BY created_at DESC
				LIMIT ?
			) sub
			ORDER BY created_at ASC;`
			rows, err = s.db.Query(query, roomID, limit)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("gagal query history: %w", err)
	}
	defer rows.Close()

	var history []StoredMessage
	for rows.Next() {
		var m StoredMessage
		var createdAt time.Time
		var status, replyToID, replyToNickname, replyToContent, reactions string
		var mediaURL, mediaType, fileName, mediaStatus string
		var fileSize int64
		var isDeleted bool
		var deletedForUsers string

		if err := rows.Scan(
			&m.ID,
			&m.RoomID,
			&m.FromID,
			&m.Nickname,
			&m.ToID,
			&m.Content,
			&status,
			&replyToID,
			&replyToNickname,
			&replyToContent,
			&reactions,
			&mediaURL,
			&mediaType,
			&fileName,
			&fileSize,
			&mediaStatus,
			&isDeleted,
			&deletedForUsers,
			&createdAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan baris history: %w", err)
		}

		// Filter pesan jika user telah menghapus untuk diri sendiri (Delete for Me)
		if userID != "" && deletedForUsers != "" && deletedForUsers != "[]" {
			var delUsers []string
			if err := json.Unmarshal([]byte(deletedForUsers), &delUsers); err == nil {
				skip := false
				for _, u := range delUsers {
					if u == userID {
						skip = true
						break
					}
				}
				if skip {
					continue
				}
			}
		}

		m.Status = status
		m.ReplyToID = replyToID
		m.ReplyToNickname = replyToNickname
		m.ReplyToContent = replyToContent
		m.Reactions = reactions
		m.MediaURL = mediaURL
		m.MediaType = mediaType
		m.FileName = fileName
		m.FileSize = fileSize
		m.MediaStatus = mediaStatus
		m.IsDeleted = isDeleted
		m.DeletedForUsers = deletedForUsers
		m.Timestamp = createdAt.UTC()
		history = append(history, m)
	}

	if history == nil {
		history = []StoredMessage{}
	}

	return history, nil
}

// GetMessageByID mengambil record pesan tunggal berdasarkan ID.
func (s *SQLMessageStore) GetMessageByID(msgID string) (*StoredMessage, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, room_id, from_id, from_nickname, to_id, content, 
		                COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
		                COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
		                COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), created_at
		         FROM messages WHERE id = $1`
	} else {
		query = `SELECT id, room_id, from_id, from_nickname, to_id, content, 
		                COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
		                COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
		                COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), created_at
		         FROM messages WHERE id = ?`
	}

	var m StoredMessage
	var createdAt time.Time
	var status, replyToID, replyToNickname, replyToContent, reactions string
	var mediaURL, mediaType, fileName, mediaStatus string
	var fileSize int64
	var isDeleted bool
	var deletedForUsers string

	err := s.db.QueryRow(query, msgID).Scan(
		&m.ID,
		&m.RoomID,
		&m.FromID,
		&m.Nickname,
		&m.ToID,
		&m.Content,
		&status,
		&replyToID,
		&replyToNickname,
		&replyToContent,
		&reactions,
		&mediaURL,
		&mediaType,
		&fileName,
		&fileSize,
		&mediaStatus,
		&isDeleted,
		&deletedForUsers,
		&createdAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("pesan tidak ditemukan")
		}
		return nil, err
	}

	m.Status = status
	m.ReplyToID = replyToID
	m.ReplyToNickname = replyToNickname
	m.ReplyToContent = replyToContent
	m.Reactions = reactions
	m.MediaURL = mediaURL
	m.MediaType = mediaType
	m.FileName = fileName
	m.FileSize = fileSize
	m.MediaStatus = mediaStatus
	m.IsDeleted = isDeleted
	m.DeletedForUsers = deletedForUsers
	m.Timestamp = createdAt.UTC()
	return &m, nil
}

// DeleteMessage menghapus pesan (untuk saya saja atau untuk semua orang).
func (s *SQLMessageStore) DeleteMessage(msgID, userID, userNickname string, deleteForEveryone bool) (*StoredMessage, error) {
	msg, err := s.GetMessageByID(msgID)
	if err != nil {
		return nil, err
	}

	if deleteForEveryone {
		// Validasi kepemilikan pesan
		isAuthor := (msg.FromID != "" && msg.FromID == userID) ||
			(msg.Nickname != "" && (strings.EqualFold(msg.Nickname, userNickname) || strings.EqualFold(msg.Nickname, userID)))
		if !isAuthor {
			return nil, fmt.Errorf("hanya pengirim yang dapat menghapus pesan untuk semua orang")
		}
		// Validasi usia pesan <= 60 detik (1 menit)
		if time.Since(msg.Timestamp) > 60*time.Second {
			return nil, fmt.Errorf("pesan sudah lebih dari 1 menit dan tidak dapat dihapus untuk semua orang")
		}

		var query string
		if s.driverName == "postgres" {
			query = `UPDATE messages 
			         SET content = '🚫 Pesan ini telah dihapus', 
			             media_url = '', media_type = '', file_name = '', file_size = 0, 
			             reactions = '[]', is_deleted = TRUE 
			         WHERE id = $1`
		} else {
			query = `UPDATE messages 
			         SET content = '🚫 Pesan ini telah dihapus', 
			             media_url = '', media_type = '', file_name = '', file_size = 0, 
			             reactions = '[]', is_deleted = TRUE 
			         WHERE id = ?`
		}
		if _, err := s.db.Exec(query, msgID); err != nil {
			return nil, err
		}
		msg.Content = "🚫 Pesan ini telah dihapus"
		msg.MediaURL = ""
		msg.MediaType = ""
		msg.FileName = ""
		msg.FileSize = 0
		msg.Reactions = "[]"
		msg.IsDeleted = true
		return msg, nil
	} else {
		// Hapus untuk saya saja: tambahkan userID ke deleted_for_users
		var deletedUsers []string
		if msg.DeletedForUsers != "" && msg.DeletedForUsers != "[]" {
			_ = json.Unmarshal([]byte(msg.DeletedForUsers), &deletedUsers)
		}
		alreadyDeleted := false
		for _, u := range deletedUsers {
			if u == userID {
				alreadyDeleted = true
				break
			}
		}
		if !alreadyDeleted {
			deletedUsers = append(deletedUsers, userID)
		}
		bytes, _ := json.Marshal(deletedUsers)
		jsonStr := string(bytes)

		var query string
		if s.driverName == "postgres" {
			query = `UPDATE messages SET deleted_for_users = $1 WHERE id = $2`
		} else {
			query = `UPDATE messages SET deleted_for_users = ? WHERE id = ?`
		}
		if _, err := s.db.Exec(query, jsonStr, msgID); err != nil {
			return nil, err
		}
		msg.DeletedForUsers = jsonStr
		return msg, nil
	}
}

// AcknowledgeMediaDownload mencatat bahwa client telah mengunduh media.
func (s *SQLMessageStore) AcknowledgeMediaDownload(msgID string) (string, string, bool, error) {
	if msgID == "" {
		return "", "", false, nil
	}

	var mediaURL, mediaStatus sql.NullString
	var queryGet string
	if s.driverName == "postgres" {
		queryGet = `SELECT media_url, COALESCE(media_status, 'active') FROM messages WHERE id = $1`
	} else {
		queryGet = `SELECT media_url, COALESCE(media_status, 'active') FROM messages WHERE id = ?`
	}

	if err := s.db.QueryRow(queryGet, msgID).Scan(&mediaURL, &mediaStatus); err != nil {
		if err == sql.ErrNoRows {
			return "", "", false, nil
		}
		return "", "", false, err
	}

	urlStr := ""
	if mediaURL.Valid {
		urlStr = mediaURL.String
	}
	statusStr := "active"
	if mediaStatus.Valid && mediaStatus.String != "" {
		statusStr = mediaStatus.String
	}

	if urlStr == "" {
		return "", statusStr, false, nil
	}

	// Ubah media_status menjadi 'expired' (atau 'downloaded')
	var queryUpdate string
	if s.driverName == "postgres" {
		queryUpdate = `UPDATE messages SET media_status = 'expired' WHERE id = $1`
	} else {
		queryUpdate = `UPDATE messages SET media_status = 'expired' WHERE id = ?`
	}
	_, err := s.db.Exec(queryUpdate, msgID)
	if err != nil {
		return urlStr, statusStr, false, err
	}

	return urlStr, "expired", true, nil
}

// GetExpiredMediaMessages mengambil daftar pesan dengan media aktif yang sudah melewati batas retensi hari.
func (s *SQLMessageStore) GetExpiredMediaMessages(retentionDays int) ([]StoredMessage, error) {
	if retentionDays <= 0 {
		return []StoredMessage{}, nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `
		SELECT id, room_id, from_id, from_nickname, to_id, content, 
		       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
		       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'), created_at
		FROM messages
		WHERE media_url IS NOT NULL AND media_url != '' 
		  AND COALESCE(media_status, 'active') = 'active'
		  AND created_at < NOW() - ($1 || ' days')::INTERVAL
		ORDER BY created_at ASC
		LIMIT 100`
	} else {
		query = `
		SELECT id, room_id, from_id, from_nickname, to_id, content, 
		       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
		       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'), created_at
		FROM messages
		WHERE media_url IS NOT NULL AND media_url != '' 
		  AND COALESCE(media_status, 'active') = 'active'
		  AND created_at < datetime('now', '-' || ? || ' days')
		ORDER BY created_at ASC
		LIMIT 100`
	}

	rows, err := s.db.Query(query, retentionDays)
	if err != nil {
		return nil, fmt.Errorf("gagal query expired media: %w", err)
	}
	defer rows.Close()

	var expired []StoredMessage
	for rows.Next() {
		var m StoredMessage
		var createdAt time.Time
		var status, replyToID, replyToNickname, replyToContent, reactions string
		var mediaURL, mediaType, fileName, mediaStatus string
		var fileSize int64
		if err := rows.Scan(
			&m.ID,
			&m.RoomID,
			&m.FromID,
			&m.Nickname,
			&m.ToID,
			&m.Content,
			&status,
			&replyToID,
			&replyToNickname,
			&replyToContent,
			&reactions,
			&mediaURL,
			&mediaType,
			&fileName,
			&fileSize,
			&mediaStatus,
			&createdAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan expired media: %w", err)
		}
		m.Status = status
		m.ReplyToID = replyToID
		m.ReplyToNickname = replyToNickname
		m.ReplyToContent = replyToContent
		m.Reactions = reactions
		m.MediaURL = mediaURL
		m.MediaType = mediaType
		m.FileName = fileName
		m.FileSize = fileSize
		m.MediaStatus = mediaStatus
		m.Timestamp = createdAt.UTC()
		expired = append(expired, m)
	}

	if expired == nil {
		expired = []StoredMessage{}
	}
	return expired, nil
}

// MarkMediaExpired menandai status media pesan menjadi 'expired'.
func (s *SQLMessageStore) MarkMediaExpired(msgID string) error {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE messages SET media_status = 'expired' WHERE id = $1`
	} else {
		query = `UPDATE messages SET media_status = 'expired' WHERE id = ?`
	}
	_, err := s.db.Exec(query, msgID)
	return err
}

// Close menutup koneksi pool database.
func (s *SQLMessageStore) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

var _ MessageStore = (*SQLMessageStore)(nil)

