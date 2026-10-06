package authz

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"
)

// ErrAccountSuspended: akun ditangguhkan moderator. Berbeda dengan hapus akun, data tetap ada dan bisa dipulihkan.
var ErrAccountSuspended = errors.New("akun ditangguhkan")

const (
	suspendedCacheTTL    = 60 * time.Second // akun yang ditangguhkan: Invalidate dipanggil saat berubah, TTL hanya jaring pengaman
	notSuspendedCacheTTL = 15 * time.Second // sependek ini supaya penangguhan baru cepat berlaku di instans lain
	suspensionCacheMax   = 20000
)

// SuspensionLookup membaca status penangguhan dari penyimpanan.
type SuspensionLookup interface {
	IsSuspended(ctx context.Context, userID string) (bool, error)
}

// SuspensionPolicy menentukan apakah sebuah akun ditangguhkan. Kegagalan membaca database berarti TIDAK ditangguhkan
// (gagal terbuka), supaya gangguan sesaat tidak mengunci semua pengguna. Penangguhan diterapkan di login, refresh,
// middleware HTTP, gerbang WebSocket, dan filter push.
type SuspensionPolicy struct {
	lookup SuspensionLookup
	now    func() time.Time

	mu    sync.Mutex
	cache map[string]suspensionEntry
}

type suspensionEntry struct {
	suspended bool
	expires   time.Time
}

// NewSuspensionPolicy membuat kebijakan. lookup nil berarti tidak pernah menangguhkan.
func NewSuspensionPolicy(lookup SuspensionLookup) *SuspensionPolicy {
	return &SuspensionPolicy{lookup: lookup, now: time.Now, cache: map[string]suspensionEntry{}}
}

// IsSuspended menjawab apakah akun ini ditangguhkan sekarang. Aman dipanggil pada nil.
func (p *SuspensionPolicy) IsSuspended(ctx context.Context, userID string) bool {
	if p == nil || p.lookup == nil || userID == "" {
		return false
	}
	now := p.now()
	p.mu.Lock()
	if e, ok := p.cache[userID]; ok && now.Before(e.expires) {
		p.mu.Unlock()
		return e.suspended
	}
	p.mu.Unlock()

	suspended, err := p.lookup.IsSuspended(ctx, userID)
	if err != nil {
		log.Printf("⚠️ [Suspension] gagal memeriksa user %s, dianggap tidak ditangguhkan: %v", userID, err)
		return false
	}
	ttl := notSuspendedCacheTTL
	if suspended {
		ttl = suspendedCacheTTL
	}
	p.mu.Lock()
	if len(p.cache) >= suspensionCacheMax {
		p.cache = map[string]suspensionEntry{}
	}
	p.cache[userID] = suspensionEntry{suspended: suspended, expires: now.Add(ttl)}
	p.mu.Unlock()
	return suspended
}

// Invalidate membuang cache satu akun; dipanggil setelah menangguhkan/memulihkan agar langsung berlaku.
func (p *SuspensionPolicy) Invalidate(userID string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	delete(p.cache, userID)
	p.mu.Unlock()
}
