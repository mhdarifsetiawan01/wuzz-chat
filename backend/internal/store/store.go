// Package store mendefinisikan kontrak (interface) untuk storage layer.
// Fase 1 menggunakan implementasi in-memory, tapi interface ini dirancang
// agar fase 2/3 cukup mengganti implementasi tanpa mengubah kode Hub sama sekali.
package store

import "time"

// ClientRecord menyimpan metadata session client yang terdaftar.
// Di fase 2 ini bisa disimpan ke Redis dengan TTL.
type ClientRecord struct {
	ID       string
	Nickname string
	PeerID   string    // ID client lawan chat (kosong jika belum dipasangkan)
	JoinedAt time.Time
}

// ClientStore mendefinisikan operasi CRUD untuk registry client aktif.
// Implementasi fase 1: in-memory map.
// Implementasi fase 2+: Redis hash / database.
type ClientStore interface {
	// Set menyimpan atau memperbarui record client.
	Set(record ClientRecord) error

	// Get mengambil record client berdasarkan ID.
	// Mengembalikan false jika tidak ditemukan.
	Get(id string) (ClientRecord, bool)

	// Delete menghapus client dari registry (saat disconnect).
	Delete(id string) error

	// List mengembalikan semua client yang saat ini aktif.
	// Digunakan untuk pairing dan monitoring.
	List() []ClientRecord
}

// -------------------------------------------------------------------

// StoredMessage adalah pesan yang persisted (dipakai fase 2+).
type StoredMessage struct {
	ID        string
	From      string
	To        string
	Content   string
	Timestamp time.Time
}

// MessageStore mendefinisikan operasi untuk menyimpan history pesan.
// Fase 1: no-op (tidak menyimpan apa-apa, implementasi kosong).
// Fase 2+: Postgres / MongoDB.
type MessageStore interface {
	// Save menyimpan pesan yang sudah terkirim.
	Save(msg StoredMessage) error

	// GetHistory mengambil history percakapan antara dua client.
	// limit = 0 berarti ambil semua.
	GetHistory(clientA, clientB string, limit int) ([]StoredMessage, error)
}
