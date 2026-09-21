package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
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

	// Konfigurasi connection pool yang dapat disetel via Environment Variable (Default aman untuk Supabase Free & Pro Tier)
	maxOpen := 25
	if v := os.Getenv("DB_MAX_OPEN_CONNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxOpen = n
		}
	}

	maxIdle := 10
	if v := os.Getenv("DB_MAX_IDLE_CONNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxIdle = n
		}
	}

	maxLifetime := 5 * time.Minute
	if v := os.Getenv("DB_CONN_MAX_LIFETIME_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxLifetime = time.Duration(n) * time.Minute
		}
	}

	maxIdleTime := 2 * time.Minute
	if v := os.Getenv("DB_CONN_MAX_IDLE_TIME_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxIdleTime = time.Duration(n) * time.Minute
		}
	}

	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	db.SetConnMaxLifetime(maxLifetime)
	db.SetConnMaxIdleTime(maxIdleTime)

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
			key_version INTEGER DEFAULT 1,
			active_device_id TEXT DEFAULT '',
			created_at TIMESTAMP NOT NULL
		);`,
		// Index Users
		`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`,
		// Tabel Conversations
		`CREATE TABLE IF NOT EXISTS conversations (
			id VARCHAR(128) PRIMARY KEY,
			type VARCHAR(32) NOT NULL,
			title VARCHAR(128) DEFAULT '',
			is_public BOOLEAN NOT NULL DEFAULT false,
			group_username VARCHAR(64) DEFAULT '',
			parent_id VARCHAR(128) DEFAULT NULL,
			expires_at TIMESTAMP DEFAULT NULL,
			created_by VARCHAR(64) DEFAULT '',
			avatar_url TEXT DEFAULT '',
			description TEXT DEFAULT '',
			is_e2ee BOOLEAN DEFAULT false,
			status VARCHAR(32) NOT NULL DEFAULT 'active',
			ai_summary TEXT DEFAULT '',
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL
		);`,
		// Tabel Conversation Members
		`CREATE TABLE IF NOT EXISTS conversation_members (
			conversation_id VARCHAR(128) NOT NULL,
			user_id VARCHAR(64) NOT NULL,
			role VARCHAR(32) NOT NULL DEFAULT 'member',
			joined_at TIMESTAMP NOT NULL,
			PRIMARY KEY (conversation_id, user_id)
		);`,
		// Tabel Messages
		`CREATE TABLE IF NOT EXISTS messages (
			id VARCHAR(64) PRIMARY KEY,
			room_id VARCHAR(128) NOT NULL,
			from_id VARCHAR(64) NOT NULL,
			from_nickname VARCHAR(64) NOT NULL,
			to_id VARCHAR(128) NOT NULL,
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
		// Tabel Device Transfer Sessions (E2EE Key Transfer via QR Code / One-Time Token)
		`CREATE TABLE IF NOT EXISTS device_transfer_sessions (
			session_token VARCHAR(128) PRIMARY KEY,
			user_id VARCHAR(64) NOT NULL,
			encrypted_bundle TEXT NOT NULL,
			is_used BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP NOT NULL,
			expires_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_transfer_user_exp ON device_transfer_sessions(user_id, expires_at);`,
		`CREATE TABLE IF NOT EXISTS conversation_join_requests (
			id VARCHAR(64) PRIMARY KEY,
			conversation_id VARCHAR(128) NOT NULL,
			user_id VARCHAR(64) NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'pending',
			reviewed_by VARCHAR(64) DEFAULT '',
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_join_requests_conv_status ON conversation_join_requests(conversation_id, status);`,
		`CREATE INDEX IF NOT EXISTS idx_join_requests_user ON conversation_join_requests(user_id);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_join_requests_conv_user ON conversation_join_requests(conversation_id, user_id);`,
		// Tabel Pinned Messages (Milestone 8.3D: Pin Message dalam percakapan)
		`CREATE TABLE IF NOT EXISTS pinned_messages (
			id VARCHAR(64) PRIMARY KEY,
			conversation_id VARCHAR(128) NOT NULL,
			message_id VARCHAR(64) NOT NULL,
			pinned_by VARCHAR(64) NOT NULL,
			pinned_at TIMESTAMP NOT NULL,
			expires_at TIMESTAMP DEFAULT NULL,
			UNIQUE(conversation_id, message_id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_pinned_messages_conv ON pinned_messages(conversation_id, pinned_at DESC);`,

		// Group Memory AI (Fase 10 / Milestone 1)
		// 1. Tabel Forum Memory Jobs
		`CREATE TABLE IF NOT EXISTS forum_memory_jobs (
			id VARCHAR(64) PRIMARY KEY,
			forum_id VARCHAR(128) UNIQUE NOT NULL,
			group_id VARCHAR(128) NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
			attempt_count INTEGER NOT NULL DEFAULT 0,
			max_attempts INTEGER NOT NULL DEFAULT 3,
			is_terminal_fail BOOLEAN NOT NULL DEFAULT FALSE,
			last_error TEXT DEFAULT '',
			message_count INTEGER DEFAULT 0,
			created_at TIMESTAMP NOT NULL,
			started_at TIMESTAMP DEFAULT NULL,
			completed_at TIMESTAMP DEFAULT NULL,
			next_retry_at TIMESTAMP DEFAULT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_fmj_status_next_retry ON forum_memory_jobs(status, next_retry_at);`,
		`CREATE INDEX IF NOT EXISTS idx_fmj_forum_id ON forum_memory_jobs(forum_id);`,
		`CREATE INDEX IF NOT EXISTS idx_fmj_group_id ON forum_memory_jobs(group_id);`,

		// 2. Tabel Memory Drafts
		`CREATE TABLE IF NOT EXISTS memory_drafts (
			id VARCHAR(64) PRIMARY KEY,
			job_id VARCHAR(64) UNIQUE NOT NULL,
			forum_id VARCHAR(128) NOT NULL,
			group_id VARCHAR(128) NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
			message_count_processed INTEGER NOT NULL DEFAULT 0,
			was_truncated BOOLEAN NOT NULL DEFAULT FALSE,
			truncation_note TEXT DEFAULT '',
			reviewed_at TIMESTAMP DEFAULT NULL,
			reviewed_by VARCHAR(64) DEFAULT '',
			rejection_reason TEXT DEFAULT '',
			created_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_md_forum_id ON memory_drafts(forum_id);`,
		`CREATE INDEX IF NOT EXISTS idx_md_group_id_status ON memory_drafts(group_id, status);`,
		`CREATE INDEX IF NOT EXISTS idx_md_reviewed_by ON memory_drafts(reviewed_by);`,

		// 3. Tabel Memory Artifacts
		`CREATE TABLE IF NOT EXISTS memory_artifacts (
			id VARCHAR(64) PRIMARY KEY,
			draft_id VARCHAR(64) NOT NULL,
			type VARCHAR(32) NOT NULL,
			content TEXT NOT NULL,
			ai_original_content TEXT NOT NULL,
			confidence VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
			is_human_edited BOOLEAN NOT NULL DEFAULT FALSE,
			is_removed BOOLEAN NOT NULL DEFAULT FALSE,
			position INTEGER DEFAULT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_ma_draft_id ON memory_artifacts(draft_id);`,
		`CREATE INDEX IF NOT EXISTS idx_ma_draft_id_type ON memory_artifacts(draft_id, type);`,

		// 4. Tabel Artifact Evidences
		`CREATE TABLE IF NOT EXISTS artifact_evidences (
			id VARCHAR(64) PRIMARY KEY,
			artifact_id VARCHAR(64) NOT NULL,
			message_id VARCHAR(64) NOT NULL,
			message_preview VARCHAR(255) NOT NULL,
			message_sender_name VARCHAR(128) NOT NULL,
			message_sent_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_ae_artifact_id ON artifact_evidences(artifact_id);`,
		`CREATE INDEX IF NOT EXISTS idx_ae_message_id ON artifact_evidences(message_id);`,

		// 5. Tabel Approved Memories (Immutable Read-Model Cache)
		`CREATE TABLE IF NOT EXISTS approved_memories (
			id VARCHAR(64) PRIMARY KEY,
			draft_id VARCHAR(64) UNIQUE NOT NULL,
			forum_id VARCHAR(128) UNIQUE NOT NULL,
			group_id VARCHAR(128) NOT NULL,
			approved_by VARCHAR(64) NOT NULL,
			approved_at TIMESTAMP NOT NULL,
			has_human_edits BOOLEAN NOT NULL DEFAULT FALSE,
			snapshot_summary TEXT NOT NULL,
			snapshot_summary_conf VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
			snapshot_decisions TEXT NOT NULL DEFAULT '[]',
			snapshot_journey_lite TEXT DEFAULT '',
			snapshot_journey_conf VARCHAR(16) DEFAULT '',
			is_journey_lite_removed BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_am_forum_id ON approved_memories(forum_id);`,
		`CREATE INDEX IF NOT EXISTS idx_am_group_id ON approved_memories(group_id);`,
		`CREATE INDEX IF NOT EXISTS idx_am_approved_at ON approved_memories(group_id, approved_at DESC);`,

		// 6. Tabel Memory Review Actions (Append-Only Audit Log)
		`CREATE TABLE IF NOT EXISTS memory_review_actions (
			id VARCHAR(64) PRIMARY KEY,
			draft_id VARCHAR(64) NOT NULL,
			admin_id VARCHAR(64) NOT NULL,
			action VARCHAR(32) NOT NULL,
			artifact_id VARCHAR(64) DEFAULT '',
			old_content TEXT DEFAULT '',
			new_content TEXT DEFAULT '',
			rejection_reason TEXT DEFAULT '',
			created_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_mra_draft_id ON memory_review_actions(draft_id);`,
		`CREATE INDEX IF NOT EXISTS idx_mra_admin_id ON memory_review_actions(admin_id);`,
		`CREATE INDEX IF NOT EXISTS idx_mra_created_at ON memory_review_actions(created_at DESC);`,

		// 7. Tabel Memory View Events (Analytics Tracking)
		`CREATE TABLE IF NOT EXISTS memory_view_events (
			id VARCHAR(64) PRIMARY KEY,
			approved_memory_id VARCHAR(64) NOT NULL,
			forum_id VARCHAR(128) NOT NULL,
			group_id VARCHAR(128) NOT NULL,
			viewer_id VARCHAR(64) NOT NULL,
			viewer_role VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
			created_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_mve_approved_memory_id ON memory_view_events(approved_memory_id);`,
		`CREATE INDEX IF NOT EXISTS idx_mve_viewer_memory ON memory_view_events(viewer_id, approved_memory_id);`,
		`CREATE INDEX IF NOT EXISTS idx_mve_group_created ON memory_view_events(group_id, created_at DESC);`,

		// Tabel Revoked Tokens (Phase 0: Quick Wins - JWT Revocation)
		`CREATE TABLE IF NOT EXISTS revoked_tokens (
			jti VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(64) NOT NULL,
			revoked_at TIMESTAMP NOT NULL,
			expires_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(user_id);`,
		`CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expiry ON revoked_tokens(expires_at);`,

		// Tabel User Token Revocations (Global Revocation per User, misal saat Change Password)
		`CREATE TABLE IF NOT EXISTS user_token_revocations (
			user_id VARCHAR(64) PRIMARY KEY,
			revoked_before TIMESTAMP NOT NULL
		);`,
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
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS key_version INTEGER DEFAULT 1;`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_device_id TEXT DEFAULT '';`)
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
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_users TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ALTER COLUMN to_id TYPE VARCHAR(128);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(room_id, status);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_to_status ON messages(to_id, status);`)

		// Auto-migration Milestone 8.2A & 8.2B: Group Chat Engine, Visibility & Subgroups (PostgreSQL)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_username VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parent_id VARCHAR(128) DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_e2ee BOOLEAN DEFAULT false;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'member';`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_conv_parent ON conversations(parent_id);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_conv_members_role ON conversation_members(conversation_id, role);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_conv_public ON conversations(is_public, group_username);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_subgroups_active ON conversations(parent_id, expires_at);`)
	} else {
		// SQLite ALTER TABLE ADD COLUMN
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN status_message VARCHAR(255) DEFAULT 'Tersedia untuk mengobrol';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false;`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN public_key TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN key_version INTEGER DEFAULT 1;`)
		_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN active_device_id TEXT DEFAULT '';`)
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
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN pinned_at DATETIME DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN deleted_for_users TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN mentions TEXT DEFAULT '[]';`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN edited_at DATETIME DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE messages ADD COLUMN is_forwarded BOOLEAN DEFAULT FALSE;`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(room_id, status);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_to_status ON messages(to_id, status);`)

		// Auto-migration Milestone 8.2A & 8.2B: Group Chat Engine, Visibility & Subgroups (SQLite)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN group_username VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN parent_id VARCHAR(128) DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN expires_at TIMESTAMP DEFAULT NULL;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN created_by VARCHAR(64) DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN avatar_url TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN description TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN is_e2ee BOOLEAN DEFAULT false;`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active';`)
		_, _ = s.db.Exec(`ALTER TABLE conversations ADD COLUMN ai_summary TEXT DEFAULT '';`)
		_, _ = s.db.Exec(`ALTER TABLE conversation_members ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'member';`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_conv_parent ON conversations(parent_id);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_conv_members_role ON conversation_members(conversation_id, role);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_conv_public ON conversations(is_public, group_username);`)
		_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_subgroups_active ON conversations(parent_id, expires_at);`)
	}

	log.Printf("🛠️ [Auto-Migration] Tabel 'users' (dengan is_verified), 'conversations', 'conversation_members', dan 'messages' berhasil dipastikan ada!")
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
	mentions := msg.Mentions
	if mentions == "" {
		mentions = "[]"
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, mentions, is_edited, edited_at, is_forwarded, created_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
		         ON CONFLICT (id) DO NOTHING`
	} else {
		query = `INSERT OR IGNORE INTO messages (id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, mentions, is_edited, edited_at, is_forwarded, created_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
		mentions,
		msg.IsEdited,
		msg.EditedAt,
		msg.IsForwarded,
		msg.Timestamp.UTC(),
	)
	return err
}

// UpdateMessageStatus memperbarui status tanda terima pesan (sent, delivered, read).
func (s *SQLMessageStore) UpdateMessageStatus(msgID string, status string) error {
	var query string
	if status == "delivered" {
		if s.driverName == "postgres" {
			query = `UPDATE messages SET status = $1 WHERE id = $2 AND status != 'read' AND status != 'deleted'`
		} else {
			query = `UPDATE messages SET status = ? WHERE id = ? AND status != 'read' AND status != 'deleted'`
		}
	} else {
		if s.driverName == "postgres" {
			query = `UPDATE messages SET status = $1 WHERE id = $2`
		} else {
			query = `UPDATE messages SET status = ? WHERE id = ?`
		}
	}
	_, err := s.db.Exec(query, status, msgID)
	return err
}

// ToggleReaction menambah atau menghapus reaksi emoji user terhadap pesan tertentu.
// Menggunakan userID (users.id UUID) sebagai identifier — bukan nickname —
// sehingga reaksi tetap valid meskipun user mengganti display_name.
func (s *SQLMessageStore) ToggleReaction(msgID, emoji, userID string) (string, error) {
	if msgID == "" || emoji == "" || userID == "" {
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

	// 2. Toggle emoji untuk userID (exact match UUID, tidak butuh EqualFold)
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
				if u == userID {
					userExists = true
				} else {
					newUsers = append(newUsers, u)
				}
			}
			if !userExists {
				newUsers = append(newUsers, userID)
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
			Users: []string{userID},
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

// MarkRoomMessagesAsRead menandai seluruh pesan di room tertentu yang bukan dikirim oleh excludeUserID sebagai 'read'.
// Menggunakan from_id (UUID) sebagai filter primer — tidak bergantung pada nickname.
func (s *SQLMessageStore) MarkRoomMessagesAsRead(roomID, excludeUserID string) error {
	var query string
	var err error
	if excludeUserID != "" {
		if s.driverName == "postgres" {
			query = `UPDATE messages SET status = 'read' WHERE room_id = $1 AND from_id != $2 AND status != 'read'`
		} else {
			query = `UPDATE messages SET status = 'read' WHERE room_id = ? AND from_id != ? AND status != 'read'`
		}
		_, err = s.db.Exec(query, roomID, excludeUserID)
	} else {
		if s.driverName == "postgres" {
			query = `UPDATE messages SET status = 'read' WHERE room_id = $1 AND status != 'read'`
		} else {
			query = `UPDATE messages SET status = 'read' WHERE room_id = ? AND status != 'read'`
		}
		_, err = s.db.Exec(query, roomID)
	}
	return err
}

// MarkUserMessagesAsDelivered menandai seluruh pesan berstatus 'sent' dari pengirim lain menjadi 'delivered'.
// Mengembalikan daftar room_id yang terpengaruh.
// Menggunakan from_id (UUID) sebagai filter — tidak bergantung pada nickname.
func (s *SQLMessageStore) MarkUserMessagesAsDelivered(userID string) ([]string, error) {
	if userID == "" {
		return nil, nil
	}

	var querySelect string
	if s.driverName == "postgres" {
		querySelect = `SELECT DISTINCT room_id FROM messages WHERE from_id != $1 AND status = 'sent'`
	} else {
		querySelect = `SELECT DISTINCT room_id FROM messages WHERE from_id != ? AND status = 'sent'`
	}

	rows, err := s.db.Query(querySelect, userID)
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
		queryUpdate = `UPDATE messages SET status = 'delivered' WHERE from_id != $1 AND status = 'sent'`
	} else {
		queryUpdate = `UPDATE messages SET status = 'delivered' WHERE from_id != ? AND status = 'sent'`
	}
	_, err = s.db.Exec(queryUpdate, userID)
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
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM (
				SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, m.status, m.reply_to_id, m.reply_to_nickname, m.reply_to_content, m.reactions, m.media_url, m.media_type, m.file_name, m.file_size, m.media_status, m.is_deleted, m.deleted_for_users, m.mentions, m.is_edited, m.edited_at, m.is_forwarded, m.created_at
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
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM (
				SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, m.status, m.reply_to_id, m.reply_to_nickname, m.reply_to_content, m.reactions, m.media_url, m.media_type, m.file_name, m.file_size, m.media_status, m.is_deleted, m.deleted_for_users, m.mentions, m.is_edited, m.edited_at, m.is_forwarded, m.created_at
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
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM (
				SELECT id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, mentions, is_edited, edited_at, is_forwarded, created_at
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
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM (
				SELECT id, room_id, from_id, from_nickname, to_id, content, status, reply_to_id, reply_to_nickname, reply_to_content, reactions, media_url, media_type, file_name, file_size, media_status, is_deleted, deleted_for_users, mentions, is_edited, edited_at, is_forwarded, created_at
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
		var deletedForUsers, mentions string

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
			&mentions,
			&m.IsEdited,
			&m.EditedAt,
			&m.IsForwarded,
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
		m.Mentions = mentions
		m.Timestamp = createdAt.UTC()
		history = append(history, m)
	}

	if history == nil {
		history = []StoredMessage{}
	}

	return history, nil
}

// GetRoomHistorySince mengambil riwayat pesan dalam suatu room yang lebih baru dari timestamp since (delta sync).
func (s *SQLMessageStore) GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]StoredMessage, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}

	var query string
	var rows *sql.Rows
	var err error

	if userID != "" {
		if s.driverName == "postgres" {
			query = `
			SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, 
			       COALESCE(m.status, 'sent'), COALESCE(m.reply_to_id, ''), COALESCE(m.reply_to_nickname, ''), COALESCE(m.reply_to_content, ''), COALESCE(m.reactions, '[]'),
			       COALESCE(m.media_url, ''), COALESCE(m.media_type, ''), COALESCE(m.file_name, ''), COALESCE(m.file_size, 0), COALESCE(m.media_status, 'active'),
			       COALESCE(m.is_deleted, FALSE), COALESCE(m.deleted_for_users, '[]'), COALESCE(m.mentions, '[]'),
			       COALESCE(m.is_edited, FALSE), m.edited_at, COALESCE(m.is_forwarded, FALSE), m.created_at
			FROM messages m
			LEFT JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = $1
			WHERE m.room_id = $2
			  AND m.created_at > $3
			  AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			ORDER BY m.created_at ASC
			LIMIT $4;`
			rows, err = s.db.Query(query, userID, roomID, since, limit)
		} else {
			query = `
			SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, 
			       COALESCE(m.status, 'sent'), COALESCE(m.reply_to_id, ''), COALESCE(m.reply_to_nickname, ''), COALESCE(m.reply_to_content, ''), COALESCE(m.reactions, '[]'),
			       COALESCE(m.media_url, ''), COALESCE(m.media_type, ''), COALESCE(m.file_name, ''), COALESCE(m.file_size, 0), COALESCE(m.media_status, 'active'),
			       COALESCE(m.is_deleted, FALSE), COALESCE(m.deleted_for_users, '[]'), COALESCE(m.mentions, '[]'),
			       COALESCE(m.is_edited, FALSE), m.edited_at, COALESCE(m.is_forwarded, FALSE), m.created_at
			FROM messages m
			LEFT JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = ?
			WHERE m.room_id = ?
			  AND m.created_at > ?
			  AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			ORDER BY m.created_at ASC
			LIMIT ?;`
			rows, err = s.db.Query(query, userID, roomID, since, limit)
		}
	} else {
		if s.driverName == "postgres" {
			query = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM messages
			WHERE room_id = $1
			  AND created_at > $2
			ORDER BY created_at ASC
			LIMIT $3;`
			rows, err = s.db.Query(query, roomID, since, limit)
		} else {
			query = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM messages
			WHERE room_id = ?
			  AND created_at > ?
			ORDER BY created_at ASC
			LIMIT ?;`
			rows, err = s.db.Query(query, roomID, since, limit)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("gagal query history since: %w", err)
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
		var deletedForUsers, mentions string

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
			&mentions,
			&m.IsEdited,
			&m.EditedAt,
			&m.IsForwarded,
			&createdAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan baris history since: %w", err)
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
		m.Mentions = mentions
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
		                COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
		                COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
		         FROM messages WHERE id = $1`
	} else {
		query = `SELECT id, room_id, from_id, from_nickname, to_id, content, 
		                COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
		                COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
		                COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
		                COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
		         FROM messages WHERE id = ?`
	}

	var m StoredMessage
	var createdAt time.Time
	var status, replyToID, replyToNickname, replyToContent, reactions string
	var mediaURL, mediaType, fileName, mediaStatus string
	var fileSize int64
	var isDeleted bool
	var deletedForUsers, mentions string

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
		&mentions,
		&m.IsEdited,
		&m.EditedAt,
		&m.IsForwarded,
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
	m.Mentions = mentions
	m.Timestamp = createdAt.UTC()
	return &m, nil
}

// DeleteMessage menghapus pesan (untuk saya saja atau untuk semua orang).
// Ownership check HANYA menggunakan userID (users.id UUID) — bukan display_name/nickname.
func (s *SQLMessageStore) DeleteMessage(msgID, userID string, deleteForEveryone bool) (*StoredMessage, error) {
	msg, err := s.GetMessageByID(msgID)
	if err != nil {
		return nil, err
	}

	if deleteForEveryone {
		// Validasi kepemilikan pesan: HANYA berdasarkan from_id (UUID)
		if msg.FromID == "" || msg.FromID != userID {
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
		_ = s.UnpinMessage(msg.RoomID, msgID)
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

// EditMessage mengedit isi pesan yang sudah terkirim dalam batas window 15 menit.
// Ownership check HANYA menggunakan userID (users.id UUID) — hanya pengirim yang dapat mengedit.
func (s *SQLMessageStore) EditMessage(msgID, userID, newContent string) (*StoredMessage, error) {
	msg, err := s.GetMessageByID(msgID)
	if err != nil || msg == nil {
		return nil, fmt.Errorf("pesan tidak ditemukan")
	}

	// Validasi kepemilikan pesan: HANYA berdasarkan from_id (UUID)
	if msg.FromID == "" || msg.FromID != userID {
		return nil, fmt.Errorf("hanya pengirim yang dapat mengedit pesan ini")
	}

	// Validasi pesan tidak terhapus
	if msg.IsDeleted {
		return nil, fmt.Errorf("pesan yang telah dihapus tidak dapat diedit")
	}

	// Validasi pesan bukan media
	if msg.MediaURL != "" {
		return nil, fmt.Errorf("pesan media tidak dapat diedit")
	}

	// Validasi window waktu <= 15 menit (900 detik)
	if time.Since(msg.Timestamp) > 15*time.Minute {
		return nil, fmt.Errorf("pesan sudah lebih dari 15 menit dan tidak dapat diedit")
	}

	newContent = strings.TrimSpace(newContent)
	if newContent == "" {
		return nil, fmt.Errorf("isi pesan baru tidak boleh kosong")
	}

	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE messages SET content = $1, is_edited = TRUE, edited_at = $2 WHERE id = $3`
	} else {
		query = `UPDATE messages SET content = ?, is_edited = TRUE, edited_at = ? WHERE id = ?`
	}

	if _, err := s.db.Exec(query, newContent, now, msgID); err != nil {
		return nil, fmt.Errorf("gagal update pesan: %w", err)
	}

	msg.Content = newContent
	msg.IsEdited = true
	msg.EditedAt = &now
	return msg, nil
}

// ForwardMessage meneruskan pesan ke 1 sampai 5 percakapan target.
// plaintextContent adalah plaintext override dari frontend (sudah di-decrypt dari ciphertext E2EE room asal).
// Jika diisi, digunakan sebagai konten pesan terusan agar tidak menyalin ciphertext antar room yang kuncinya berbeda.
func (s *SQLMessageStore) ForwardMessage(srcMsgID, senderID, senderNickname string, targetRoomIDs []string, plaintextContent string) ([]StoredMessage, error) {
	if len(targetRoomIDs) == 0 {
		return nil, fmt.Errorf("target_room_ids tidak boleh kosong")
	}
	if len(targetRoomIDs) > 5 {
		return nil, fmt.Errorf("maksimal meneruskan pesan ke 5 percakapan sekaligus")
	}

	srcMsg, err := s.GetMessageByID(srcMsgID)
	if err != nil {
		return nil, fmt.Errorf("pesan sumber tidak ditemukan: %w", err)
	}
	if srcMsg.IsDeleted {
		return nil, fmt.Errorf("tidak dapat meneruskan pesan yang telah dihapus")
	}

	// Tentukan konten pesan terusan:
	// Prioritaskan plaintext dari frontend agar tidak menyalin ciphertext E2EE antar room yang berbeda kunci AES-nya.
	forwardContent := srcMsg.Content
	if strings.TrimSpace(plaintextContent) != "" {
		forwardContent = strings.TrimSpace(plaintextContent)
	}

	var forwardedMessages []StoredMessage
	now := time.Now().UTC()

	for _, targetRoomID := range targetRoomIDs {
		targetRoomID = strings.TrimSpace(targetRoomID)
		if targetRoomID == "" {
			continue
		}

		newMsg := StoredMessage{
			ID:              uuid.New().String(),
			RoomID:          targetRoomID,
			FromID:          senderID,
			Nickname:        senderNickname,
			ToID:            "",
			Content:         forwardContent,
			Status:          "sent",
			ReplyToID:       "",
			ReplyToNickname: "",
			ReplyToContent:  "",
			Reactions:       "[]",
			MediaURL:        srcMsg.MediaURL,
			MediaType:       srcMsg.MediaType,
			FileName:        srcMsg.FileName,
			FileSize:        srcMsg.FileSize,
			MediaStatus:     srcMsg.MediaStatus,
			IsDeleted:       false,
			DeletedForUsers: "[]",
			Mentions:        "[]",
			IsEdited:        false,
			EditedAt:        nil,
			IsForwarded:     true,
			Timestamp:       now,
		}

		if err := s.Save(newMsg); err != nil {
			return nil, fmt.Errorf("gagal menyimpan pesan terusan untuk room %s: %w", targetRoomID, err)
		}
		forwardedMessages = append(forwardedMessages, newMsg)
	}

	return forwardedMessages, nil
}

// AcknowledgeMediaDownload mencatat bahwa client telah mengunduh media.
func (s *SQLMessageStore) AcknowledgeMediaDownload(msgID string) (string, string, bool, error) {
	if msgID == "" {
		return "", "", false, nil
	}

	var mediaURL, mediaStatus, roomID, convType sql.NullString
	var queryGet string
	if s.driverName == "postgres" {
		queryGet = `
			SELECT m.media_url, COALESCE(m.media_status, 'active'), COALESCE(m.room_id, ''), COALESCE(c.type, '')
			FROM messages m
			LEFT JOIN conversations c ON m.room_id = c.id
			WHERE m.id = $1`
	} else {
		queryGet = `
			SELECT m.media_url, COALESCE(m.media_status, 'active'), COALESCE(m.room_id, ''), COALESCE(c.type, '')
			FROM messages m
			LEFT JOIN conversations c ON m.room_id = c.id
			WHERE m.id = ?`
	}

	if err := s.db.QueryRow(queryGet, msgID).Scan(&mediaURL, &mediaStatus, &roomID, &convType); err != nil {
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

	roomIDStr := ""
	if roomID.Valid {
		roomIDStr = roomID.String
	}
	cTypeStr := ""
	if convType.Valid {
		cTypeStr = convType.String
	}

	// Cek apakah pesan berada di dalam grup atau subgrup/forum (Shared Media Hub)
	isGroup := cTypeStr == "group" || strings.HasPrefix(roomIDStr, "grp_") || strings.HasPrefix(roomIDStr, "sub_")
	if isGroup {
		// Pada grup dan subgrup/forum, ACK dari salah satu anggota tidak menghapus berkas fisik
		// dan tidak mengubah status pesan menjadi expired agar anggota lain tetap bisa mengunduh.
		return urlStr, statusStr, false, nil
	}

	// Untuk Direct Message (1-on-1), terapkan Store-and-Forward instan
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

// PinMessage menyematkan pesan dalam percakapan (maksimal 3 pesan per percakapan).
func (s *SQLMessageStore) PinMessage(convID, msgID, userID string, durationHours int) (*PinnedMessage, error) {
	msg, err := s.GetMessageByID(msgID)
	if err != nil || msg == nil {
		return nil, fmt.Errorf("pesan tidak ditemukan")
	}
	if msg.RoomID != convID {
		return nil, fmt.Errorf("pesan bukan milik percakapan ini")
	}
	if msg.IsDeleted {
		return nil, fmt.Errorf("pesan yang telah dihapus tidak dapat disematkan")
	}

	// Cek apakah pesan sudah ter-pin
	var existingID string
	var checkQuery string
	if s.driverName == "postgres" {
		checkQuery = `SELECT id FROM pinned_messages WHERE conversation_id = $1 AND message_id = $2;`
	} else {
		checkQuery = `SELECT id FROM pinned_messages WHERE conversation_id = ? AND message_id = ?;`
	}
	err = s.db.QueryRow(checkQuery, convID, msgID).Scan(&existingID)
	isAlreadyPinned := (err == nil && existingID != "")

	now := time.Now().UTC()
	var expiresAt *time.Time
	if durationHours > 0 {
		exp := now.Add(time.Duration(durationHours) * time.Hour)
		expiresAt = &exp
	}

	if isAlreadyPinned {
		var updateQuery string
		if s.driverName == "postgres" {
			updateQuery = `UPDATE pinned_messages SET pinned_by = $1, pinned_at = $2, expires_at = $3 WHERE id = $4;`
		} else {
			updateQuery = `UPDATE pinned_messages SET pinned_by = ?, pinned_at = ?, expires_at = ? WHERE id = ?;`
		}
		if _, err := s.db.Exec(updateQuery, userID, now, expiresAt, existingID); err != nil {
			return nil, fmt.Errorf("gagal memperbarui pesan tersemat: %w", err)
		}
		return &PinnedMessage{
			ID:             existingID,
			ConversationID: convID,
			MessageID:      msgID,
			PinnedBy:       userID,
			PinnedAt:       now,
			ExpiresAt:      expiresAt,
			Message:        msg,
		}, nil
	}

	// Enforce max 3 pinned messages: jika sudah 3 atau lebih, unpin yang tertua (FIFO)
	var count int
	var countQuery string
	if s.driverName == "postgres" {
		countQuery = `SELECT COUNT(*) FROM pinned_messages WHERE conversation_id = $1;`
	} else {
		countQuery = `SELECT COUNT(*) FROM pinned_messages WHERE conversation_id = ?;`
	}
	_ = s.db.QueryRow(countQuery, convID).Scan(&count)

	if count >= 3 {
		if s.driverName == "postgres" {
			_, _ = s.db.Exec(`DELETE FROM pinned_messages WHERE id IN (
				SELECT id FROM pinned_messages WHERE conversation_id = $1 ORDER BY pinned_at ASC LIMIT 1
			);`, convID)
		} else {
			_, _ = s.db.Exec(`DELETE FROM pinned_messages WHERE id IN (
				SELECT id FROM pinned_messages WHERE conversation_id = ? ORDER BY pinned_at ASC LIMIT 1
			);`, convID)
		}
	}

	pinID := uuid.New().String()
	var insertQuery string
	if s.driverName == "postgres" {
		insertQuery = `INSERT INTO pinned_messages (id, conversation_id, message_id, pinned_by, pinned_at, expires_at)
		               VALUES ($1, $2, $3, $4, $5, $6);`
	} else {
		insertQuery = `INSERT INTO pinned_messages (id, conversation_id, message_id, pinned_by, pinned_at, expires_at)
		               VALUES (?, ?, ?, ?, ?, ?);`
	}

	if _, err := s.db.Exec(insertQuery, pinID, convID, msgID, userID, now, expiresAt); err != nil {
		return nil, fmt.Errorf("gagal menyematkan pesan: %w", err)
	}

	return &PinnedMessage{
		ID:             pinID,
		ConversationID: convID,
		MessageID:      msgID,
		PinnedBy:       userID,
		PinnedAt:       now,
		ExpiresAt:      expiresAt,
		Message:        msg,
	}, nil
}

// UnpinMessage melepas sematan pesan dalam percakapan.
func (s *SQLMessageStore) UnpinMessage(convID, msgID string) error {
	if s.driverName == "postgres" {
		_, err := s.db.Exec(`DELETE FROM pinned_messages WHERE conversation_id = $1 AND (message_id = $2 OR id = $2);`, convID, msgID)
		return err
	}
	_, err := s.db.Exec(`DELETE FROM pinned_messages WHERE conversation_id = ? AND (message_id = ? OR id = ?);`, convID, msgID, msgID)
	return err
}

// GetPinnedMessages mengambil semua pesan yang disematkan dalam percakapan yang belum kadaluarsa.
func (s *SQLMessageStore) GetPinnedMessages(convID string) ([]PinnedMessage, error) {
	now := time.Now().UTC()
	var query string
	var rows *sql.Rows
	var err error

	if s.driverName == "postgres" {
		query = `SELECT id, conversation_id, message_id, pinned_by, pinned_at, expires_at
		         FROM pinned_messages
		         WHERE conversation_id = $1 AND (expires_at IS NULL OR expires_at > $2)
		         ORDER BY pinned_at DESC
		         LIMIT 3;`
		rows, err = s.db.Query(query, convID, now)
	} else {
		query = `SELECT id, conversation_id, message_id, pinned_by, pinned_at, expires_at
		         FROM pinned_messages
		         WHERE conversation_id = ? AND (expires_at IS NULL OR expires_at > ?)
		         ORDER BY pinned_at DESC
		         LIMIT 3;`
		rows, err = s.db.Query(query, convID, now)
	}

	if err != nil {
		return nil, fmt.Errorf("gagal query pinned messages: %w", err)
	}
	defer rows.Close()

	var pins []PinnedMessage
	for rows.Next() {
		var p PinnedMessage
		var pinnedAt time.Time
		var exp sql.NullTime
		if err := rows.Scan(&p.ID, &p.ConversationID, &p.MessageID, &p.PinnedBy, &pinnedAt, &exp); err != nil {
			continue
		}
		p.PinnedAt = pinnedAt.UTC()
		if exp.Valid {
			t := exp.Time.UTC()
			p.ExpiresAt = &t
		}

		// Ambil data pesan lengkap untuk rendering UI
		if msg, err := s.GetMessageByID(p.MessageID); err == nil && msg != nil {
			if msg.IsDeleted {
				continue
			}
			p.Message = msg
		}

		pins = append(pins, p)
	}

	if pins == nil {
		pins = []PinnedMessage{}
	}
	return pins, nil
}

// SearchMessages mencari riwayat pesan teks dalam suatu room/percakapan.
func (s *SQLMessageStore) SearchMessages(roomID, userID, query string, limit int) ([]StoredMessage, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	searchPattern := "%" + strings.TrimSpace(query) + "%"

	var sqlQuery string
	var rows *sql.Rows
	var err error

	if userID != "" {
		if s.driverName == "postgres" {
			sqlQuery = `
			SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, 
			       COALESCE(m.status, 'sent'), COALESCE(m.reply_to_id, ''), COALESCE(m.reply_to_nickname, ''), COALESCE(m.reply_to_content, ''), COALESCE(m.reactions, '[]'),
			       COALESCE(m.media_url, ''), COALESCE(m.media_type, ''), COALESCE(m.file_name, ''), COALESCE(m.file_size, 0), COALESCE(m.media_status, 'active'),
			       COALESCE(m.is_deleted, FALSE), COALESCE(m.deleted_for_users, '[]'), COALESCE(m.mentions, '[]'),
			       COALESCE(m.is_edited, FALSE), m.edited_at, COALESCE(m.is_forwarded, FALSE), m.created_at
			FROM messages m
			LEFT JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = $1
			WHERE m.room_id = $2
			  AND m.is_deleted = FALSE
			  AND m.content ILIKE $3
			  AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			ORDER BY m.created_at DESC
			LIMIT $4;`
			rows, err = s.db.Query(sqlQuery, userID, roomID, searchPattern, limit)
		} else {
			sqlQuery = `
			SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content, 
			       COALESCE(m.status, 'sent'), COALESCE(m.reply_to_id, ''), COALESCE(m.reply_to_nickname, ''), COALESCE(m.reply_to_content, ''), COALESCE(m.reactions, '[]'),
			       COALESCE(m.media_url, ''), COALESCE(m.media_type, ''), COALESCE(m.file_name, ''), COALESCE(m.file_size, 0), COALESCE(m.media_status, 'active'),
			       COALESCE(m.is_deleted, FALSE), COALESCE(m.deleted_for_users, '[]'), COALESCE(m.mentions, '[]'),
			       COALESCE(m.is_edited, FALSE), m.edited_at, COALESCE(m.is_forwarded, FALSE), m.created_at
			FROM messages m
			LEFT JOIN conversation_members cm ON m.room_id = cm.conversation_id AND cm.user_id = ?
			WHERE m.room_id = ?
			  AND m.is_deleted = FALSE
			  AND m.content LIKE ?
			  AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
			ORDER BY m.created_at DESC
			LIMIT ?;`
			rows, err = s.db.Query(sqlQuery, userID, roomID, searchPattern, limit)
		}
	} else {
		if s.driverName == "postgres" {
			sqlQuery = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM messages
			WHERE room_id = $1
			  AND is_deleted = FALSE
			  AND content ILIKE $2
			ORDER BY created_at DESC
			LIMIT $3;`
			rows, err = s.db.Query(sqlQuery, roomID, searchPattern, limit)
		} else {
			sqlQuery = `
			SELECT id, room_id, from_id, from_nickname, to_id, content, 
			       COALESCE(status, 'sent'), COALESCE(reply_to_id, ''), COALESCE(reply_to_nickname, ''), COALESCE(reply_to_content, ''), COALESCE(reactions, '[]'),
			       COALESCE(media_url, ''), COALESCE(media_type, ''), COALESCE(file_name, ''), COALESCE(file_size, 0), COALESCE(media_status, 'active'),
			       COALESCE(is_deleted, FALSE), COALESCE(deleted_for_users, '[]'), COALESCE(mentions, '[]'),
			       COALESCE(is_edited, FALSE), edited_at, COALESCE(is_forwarded, FALSE), created_at
			FROM messages
			WHERE room_id = ?
			  AND is_deleted = FALSE
			  AND content LIKE ?
			ORDER BY created_at DESC
			LIMIT ?;`
			rows, err = s.db.Query(sqlQuery, roomID, searchPattern, limit)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("gagal mencari pesan: %w", err)
	}
	defer rows.Close()

	var results []StoredMessage
	for rows.Next() {
		var m StoredMessage
		var createdAt time.Time
		var status, replyToID, replyToNickname, replyToContent, reactions string
		var mediaURL, mediaType, fileName, mediaStatus string
		var fileSize int64
		var isDeleted bool
		var deletedForUsers, mentions string

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
			&mentions,
			&m.IsEdited,
			&m.EditedAt,
			&m.IsForwarded,
			&createdAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan search message: %w", err)
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
		m.Mentions = mentions
		m.Timestamp = createdAt.UTC()

		results = append(results, m)
	}

	if results == nil {
		results = []StoredMessage{}
	}
	return results, nil
}

// Close menutup koneksi pool database.
func (s *SQLMessageStore) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

var _ MessageStore = (*SQLMessageStore)(nil)


