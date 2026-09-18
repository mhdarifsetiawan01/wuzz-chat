// Package store mendefinisikan kontrak (interface) untuk storage layer.
// Mendukung in-memory, SQLite, PostgreSQL, dan Supabase secara transparan.
package store

import "time"

// ClientRecord menyimpan metadata session client yang terdaftar.
type ClientRecord struct {
	ID       string    `json:"id"`
	Nickname string    `json:"nickname"`
	PeerID   string    `json:"peer_id,omitempty"` // ID client lawan chat (kosong jika belum dipasangkan)
	JoinedAt time.Time `json:"joined_at"`
}

// ClientStore mendefinisikan operasi CRUD untuk registry client aktif.
type ClientStore interface {
	// Set menyimpan atau memperbarui record client.
	Set(record ClientRecord) error

	// Get mengambil record client berdasarkan ID.
	Get(id string) (ClientRecord, bool)

	// Delete menghapus client dari registry (saat disconnect).
	Delete(id string) error

	// List mengembalikan semua client yang saat ini aktif.
	List() []ClientRecord
}

// -------------------------------------------------------------------

// StoredMessage adalah representasi pesan yang tersimpan di database.
type StoredMessage struct {
	ID              string    `json:"id"`
	RoomID          string    `json:"room_id"`
	FromID          string    `json:"from_id"`
	Nickname        string    `json:"nickname,omitempty"`
	ToID            string    `json:"to_id"`
	Content         string    `json:"content"`
	Status          string    `json:"status,omitempty"` // "pending", "sent", "delivered", "read"
	ReplyToID       string    `json:"reply_to_id,omitempty"`
	ReplyToNickname string    `json:"reply_to_nickname,omitempty"`
	ReplyToContent  string    `json:"reply_to_content,omitempty"`
	Reactions       string    `json:"reactions,omitempty"` // JSON string representation of ReactionItem[]
	MediaURL        string    `json:"media_url,omitempty"`
	MediaType       string    `json:"media_type,omitempty"`
	FileName        string    `json:"file_name,omitempty"`
	FileSize        int64     `json:"file_size,omitempty"`
	MediaStatus     string    `json:"media_status,omitempty"` // "active", "downloaded", "expired"
	IsDeleted       bool      `json:"is_deleted,omitempty"`
	DeletedForUsers string    `json:"deleted_for_users,omitempty"` // JSON array string
	Mentions        string    `json:"mentions,omitempty"`          // JSON array string of user UUIDs
	Timestamp       time.Time `json:"timestamp"`
}

// MessageStore mendefinisikan operasi penyimpanan dan pemuatan riwayat pesan.
type MessageStore interface {
	// Save menyimpan pesan yang sudah terkirim ke database.
	Save(msg StoredMessage) error

	// GetMessageByID mengambil satu pesan berdasarkan ID.
	GetMessageByID(msgID string) (*StoredMessage, error)

	// DeleteMessage menghapus pesan (untuk saya saja atau untuk semua orang).
	// Ownership check HANYA menggunakan userID (users.id UUID) — bukan display_name/nickname.
	DeleteMessage(msgID, userID string, deleteForEveryone bool) (*StoredMessage, error)

	// UpdateMessageStatus memperbarui status tanda terima pesan (sent, delivered, read).
	UpdateMessageStatus(msgID string, status string) error

	// ToggleReaction menambah atau menghapus reaksi emoji user terhadap pesan tertentu.
	// Reaksi disimpan menggunakan userID (users.id UUID) agar tetap valid jika user mengganti display_name.
	ToggleReaction(msgID, emoji, userID string) (string, error)

	// MarkRoomMessagesAsRead menandai semua pesan yang belum dibaca dari lawan bicara menjadi 'read'.
	// excludeUserID adalah users.id (UUID) pengirim yang tidak ikut ditandai 'read'.
	MarkRoomMessagesAsRead(roomID, excludeUserID string) error

	// MarkUserMessagesAsDelivered menandai semua pesan berstatus 'sent' yang ditujukan ke user menjadi 'delivered'.
	// userID adalah users.id (UUID) penerima.
	MarkUserMessagesAsDelivered(userID string) ([]string, error)

	// GetRoomHistory mengambil riwayat pesan dalam suatu room/percakapan.
	// Mengembalikan pesan terurut secara kronologis (tertua ke terbaru).
	// limit = 0 berarti default 50 pesan.
	GetRoomHistory(roomID string, limit int) ([]StoredMessage, error)

	// GetRoomHistoryForUser mengambil riwayat pesan yang difilter berdasarkan cleared_at milik userID.
	GetRoomHistoryForUser(roomID, userID string, limit int) ([]StoredMessage, error)

	// GetRoomHistorySince mengambil riwayat pesan yang lebih baru dari timestamp `since` untuk roomID dan userID (delta offline sync).
	GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]StoredMessage, error)

	// AcknowledgeMediaDownload mencatat bahwa client telah mengunduh media.
	// Mengembalikan mediaURL, mediaStatus terkini, dan apakah file sudah dapat dihapus dari server.
	AcknowledgeMediaDownload(msgID string) (mediaURL string, mediaStatus string, canDelete bool, err error)

	// GetExpiredMediaMessages mengambil daftar pesan dengan media aktif yang sudah melewati batas retensi hari.
	GetExpiredMediaMessages(retentionDays int) ([]StoredMessage, error)

	// MarkMediaExpired menandai status media pesan menjadi 'expired'.
	MarkMediaExpired(msgID string) error

	// Close menutup koneksi database jika ada.
	Close() error
}
