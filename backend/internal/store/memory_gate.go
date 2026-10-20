package store

import (
	"context"
	"errors"
	"log"
	"strings"
)

// ErrMemoryNotEnabled dikembalikan saat AI Memory tidak diaktifkan untuk grup tersebut (di luar daftar MEMORY_ENABLED_GROUPS).
var ErrMemoryNotEnabled = errors.New("AI Memory tidak diaktifkan untuk grup ini")

// MemoryGate menentukan grup induk mana yang boleh memakai AI Memory (tahap uji terbatas).
//
// Sumber nilai: env MEMORY_ENABLED_GROUPS.
//   - kosong      → tidak ada grup yang aktif (fail-closed; tidak ada teks yang dikirim ke penyedia LLM)
//   - "*"         → semua grup (whitelist dimatikan)
//   - "id1,id2"   → hanya grup induk dengan ID tersebut
type MemoryGate struct {
	all    bool
	groups map[string]struct{}
}

// ParseMemoryGate membangun gerbang dari nilai env; spasi di sekitar ID diabaikan.
func ParseMemoryGate(raw string) *MemoryGate {
	g := &MemoryGate{groups: map[string]struct{}{}}
	for _, part := range strings.Split(raw, ",") {
		id := strings.TrimSpace(part)
		switch id {
		case "":
		case "*":
			g.all = true
		default:
			g.groups[id] = struct{}{}
		}
	}
	return g
}

// AllowAllMemoryGate membuat gerbang tanpa pembatas (dipakai wiring tanpa konfigurasi, mis. pengujian).
func AllowAllMemoryGate() *MemoryGate { return &MemoryGate{all: true, groups: map[string]struct{}{}} }

// Allows true bila grup induk boleh memakai AI Memory.
func (g *MemoryGate) Allows(groupID string) bool {
	if g == nil {
		return false
	}
	if g.all {
		return true
	}
	_, ok := g.groups[strings.TrimSpace(groupID)]
	return ok
}

// AllowsAll true bila whitelist dimatikan ("*").
func (g *MemoryGate) AllowsAll() bool { return g != nil && g.all }

// GatedMemoryStore membungkus MemoryStore: job hanya dibuat dan diproses untuk grup yang diizinkan gerbang.
// Dipakai oleh semua jalur yang MEMBUAT atau MEMPROSES job (TTL worker, tutup topik manual, MemoryJobWorker).
type GatedMemoryStore struct {
	MemoryStore
	gate  *MemoryGate
	quota MemoryQuotaChecker // nil = kuota paket tidak ditegakkan (MEMORY_QUOTA_ENABLED mati)
}

// SetQuota memasang pemeriksa kuota ringkasan AI per paket. Dipanggil saat wiring, sebelum worker berjalan.
func (s *GatedMemoryStore) SetQuota(q MemoryQuotaChecker) { s.quota = q }

// NewGatedMemoryStore membungkus inner dengan gerbang.
func NewGatedMemoryStore(inner MemoryStore, gate *MemoryGate) *GatedMemoryStore {
	return &GatedMemoryStore{MemoryStore: inner, gate: gate}
}

// CreateJob menolak (ErrMemoryNotEnabled) bila grup induk tidak diizinkan; tidak ada job yang masuk antrean.
func (s *GatedMemoryStore) CreateJob(ctx context.Context, forumID, groupID string) (*ForumMemoryJob, error) {
	if !s.gate.Allows(groupID) {
		return nil, ErrMemoryNotEnabled
	}
	if s.quota != nil {
		if err := s.quota.CheckMemoryJobQuota(ctx, forumID); err != nil {
			if errors.Is(err, ErrMemoryQuotaExceeded) {
				return nil, err
			}
			// Gangguan database sesaat tidak boleh menghilangkan ringkasan selamanya (forum tidak dicoba lagi): lanjutkan.
			log.Printf("⚠️ [MemoryQuota] cek kuota forum %s gagal, job tetap dibuat: %v", forumID, err)
		}
	}
	return s.MemoryStore.CreateJob(ctx, forumID, groupID)
}

// gatedPendingOverfetch: job grup non-whitelist yang menumpuk di antrean dilewati; ambil lebih banyak agar job grup
// yang diizinkan tidak kelaparan di belakang job yang tidak akan pernah diproses.
const gatedPendingOverfetch = 20

// GetPendingJobs hanya mengembalikan job milik grup yang diizinkan gerbang. Job lain dibiarkan QUEUED (tidak diproses,
// tidak ada teks yang dikirim ke penyedia LLM).
func (s *GatedMemoryStore) GetPendingJobs(ctx context.Context, limit int) ([]ForumMemoryJob, error) {
	if limit <= 0 {
		limit = 10
	}
	if s.gate.AllowsAll() {
		return s.MemoryStore.GetPendingJobs(ctx, limit)
	}
	jobs, err := s.MemoryStore.GetPendingJobs(ctx, limit*gatedPendingOverfetch)
	if err != nil {
		return nil, err
	}
	allowed := make([]ForumMemoryJob, 0, limit)
	for _, j := range jobs {
		if s.gate.Allows(j.GroupID) {
			allowed = append(allowed, j)
			if len(allowed) == limit {
				break
			}
		}
	}
	return allowed, nil
}

// ClaimJob menolak job milik grup yang tidak diizinkan (pengaman berlapis bila ID job diteruskan langsung).
func (s *GatedMemoryStore) ClaimJob(ctx context.Context, jobID string) (*ForumMemoryJob, error) {
	job, err := s.MemoryStore.GetJobByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if !s.gate.Allows(job.GroupID) {
		return nil, ErrMemoryNotEnabled
	}
	return s.MemoryStore.ClaimJob(ctx, jobID)
}
