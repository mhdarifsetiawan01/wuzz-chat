package store

import (
	"fmt"
	"sync"
)

// ============================================================
// MemoryClientStore — implementasi ClientStore berbasis in-memory
// ============================================================

// MemoryClientStore menyimpan semua client aktif dalam sebuah map yang
// dilindungi oleh RWMutex agar aman diakses dari banyak goroutine sekaligus.
//
// RWMutex dipilih daripada Mutex biasa karena operasi baca (Get/List)
// lebih sering terjadi daripada operasi tulis (Set/Delete), sehingga
// banyak goroutine bisa baca secara paralel tanpa saling blok.
type MemoryClientStore struct {
	mu      sync.RWMutex
	clients map[string]ClientRecord
}

// NewMemoryClientStore membuat instance store baru yang siap digunakan.
func NewMemoryClientStore() *MemoryClientStore {
	return &MemoryClientStore{
		clients: make(map[string]ClientRecord),
	}
}

func (s *MemoryClientStore) Set(record ClientRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients[record.ID] = record
	return nil
}

func (s *MemoryClientStore) Get(id string) (ClientRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.clients[id]
	return r, ok
}

func (s *MemoryClientStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.clients, id)
	return nil
}

func (s *MemoryClientStore) List() []ClientRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ClientRecord, 0, len(s.clients))
	for _, r := range s.clients {
		result = append(result, r)
	}
	return result
}

// Pastikan MemoryClientStore memenuhi interface ClientStore saat compile time.
// Trik ini membuat Go compiler langsung error jika ada method yang belum diimplementasi.
var _ ClientStore = (*MemoryClientStore)(nil)

// ============================================================
// MemoryMessageStore — no-op implementasi MessageStore
// ============================================================

// MemoryMessageStore adalah implementasi kosong (no-op) untuk fase 1.
// Pesan tidak disimpan sama sekali — semua operasi sukses tapi tidak melakukan apa-apa.
// Di fase 2, kelas ini diganti dengan implementasi Postgres/Mongo tanpa ubah kode Hub.
type MemoryMessageStore struct{}

func NewMemoryMessageStore() *MemoryMessageStore {
	return &MemoryMessageStore{}
}

func (s *MemoryMessageStore) Save(_ StoredMessage) error {
	// no-op: fase 1 tidak persist pesan
	return nil
}

func (s *MemoryMessageStore) GetHistory(_, _ string, _ int) ([]StoredMessage, error) {
	// no-op: kembalikan slice kosong, bukan nil, supaya caller tidak perlu nil-check
	return []StoredMessage{}, fmt.Errorf("message history not implemented in phase 1")
}

// Compile-time interface check
var _ MessageStore = (*MemoryMessageStore)(nil)
