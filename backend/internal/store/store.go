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
	ID        string    `json:"id"`
	RoomID    string    `json:"room_id"`
	FromID    string    `json:"from_id"`
	Nickname  string    `json:"nickname,omitempty"`
	ToID      string    `json:"to_id"`
	Content   string    `json:"content"`
	Status    string    `json:"status,omitempty"` // "pending", "sent", "delivered", "read"
	Timestamp time.Time `json:"timestamp"`
}

// MessageStore mendefinisikan operasi penyimpanan dan pemuatan riwayat pesan.
type MessageStore interface {
	// Save menyimpan pesan yang sudah terkirim ke database.
	Save(msg StoredMessage) error

	// UpdateMessageStatus memperbarui status tanda terima pesan (sent, delivered, read).
	UpdateMessageStatus(msgID string, status string) error

	// GetRoomHistory mengambil riwayat pesan dalam suatu room/percakapan.
	// Mengembalikan pesan terurut secara kronologis (tertua ke terbaru).
	// limit = 0 berarti default 50 pesan.
	GetRoomHistory(roomID string, limit int) ([]StoredMessage, error)

	// Close menutup koneksi database jika ada.
	Close() error
}
