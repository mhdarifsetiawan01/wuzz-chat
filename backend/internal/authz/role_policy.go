package authz

import (
	"context"
	"log"
	"sync"
	"time"
)

const (
	roleCacheTTL = 15 * time.Second // pencabutan peran berlaku paling lambat sekitar ini
	roleCacheMax = 5000
)

// RoleLookup membaca peran sistem dari penyimpanan. Pengguna yang tidak ada (mis. akun terhapus) menjadi "user".
type RoleLookup interface {
	SystemRoleOf(ctx context.Context, userID string) (string, error)
}

// RolePolicy menjadikan database sebagai sumber kebenaran peran istimewa. Token berperan "user"/kosong tidak pernah
// memicu pembacaan database (tidak ada beban untuk pengguna biasa dan peran tidak bisa naik tanpa login ulang).
// Token yang mengklaim peran istimewa diverifikasi: nilai database yang berlaku, sehingga pencabutan atau penurunan
// peran langsung berlaku tanpa menunggu token habis. Galat database berarti peran diturunkan menjadi "user" (gagal
// tertutup, karena ini soal hak istimewa).
type RolePolicy struct {
	lookup RoleLookup
	now    func() time.Time

	mu    sync.Mutex
	cache map[string]roleEntry
}

type roleEntry struct {
	role    string
	expires time.Time
}

func NewRolePolicy(lookup RoleLookup) *RolePolicy {
	return &RolePolicy{lookup: lookup, now: time.Now, cache: map[string]roleEntry{}}
}

// EffectiveSystemRole memenuhi auth.RoleResolver. Aman dipanggil pada nil (klaim token dipakai apa adanya).
func (p *RolePolicy) EffectiveSystemRole(ctx context.Context, userID, tokenRole string) string {
	if p == nil || p.lookup == nil {
		return tokenRole
	}
	if tokenRole == "" || tokenRole == "user" {
		return tokenRole
	}
	if userID == "" {
		return "user"
	}
	now := p.now()
	p.mu.Lock()
	if e, ok := p.cache[userID]; ok && now.Before(e.expires) {
		p.mu.Unlock()
		return e.role
	}
	p.mu.Unlock()

	role, err := p.lookup.SystemRoleOf(ctx, userID)
	if err != nil {
		log.Printf("⚠️ [Role] gagal memverifikasi peran user %s, diturunkan ke user: %v", userID, err)
		return "user" // tidak di-cache: percobaan berikutnya mencoba lagi
	}
	if role == "" {
		role = "user"
	}
	p.mu.Lock()
	if len(p.cache) >= roleCacheMax {
		p.cache = map[string]roleEntry{}
	}
	p.cache[userID] = roleEntry{role: role, expires: now.Add(roleCacheTTL)}
	p.mu.Unlock()
	return role
}

// Invalidate membuang cache satu akun; dipanggil setelah peran diubah lewat aplikasi.
func (p *RolePolicy) Invalidate(userID string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	delete(p.cache, userID)
	p.mu.Unlock()
}
