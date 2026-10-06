package authz

import (
	"context"
	"log"
	"sync"
	"time"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

const (
	// linkedCacheTTL: akun tertaut tetap tertaut kecuali diputus (hanya akun berpassword yang bisa), jadi boleh lama.
	linkedCacheTTL = 5 * time.Minute
	// unlinkedCacheTTL singkat supaya penautan baru cepat berlaku walau Invalidate terlewat.
	unlinkedCacheTTL = 20 * time.Second
	freezeCacheMax   = 20000
)

// LinkFreezePolicy menentukan apakah sebuah akun DIBEKUKAN: setelah tenggat penautan Google lewat, akun yang belum
// menautkan Google tidak boleh memakai layanan (hanya menautkan Google, keluar, atau menghapus akun).
//
// Dibekukan bila SEMUA terpenuhi: pembekuan dinyalakan eksplisit (kill switch), tenggat diatur dan sudah lewat, akun di
// tenant default (tenant B2B tidak bisa memakai Google), dan akun belum tertaut. Pembekuan TIDAK menghapus data apa pun
// dan langsung berakhir begitu Google ditautkan. Kegagalan membaca database berarti TIDAK dibekukan (gagal terbuka),
// supaya gangguan sesaat tidak mengunci semua pengguna.
type LinkFreezePolicy struct {
	enabled  bool
	deadline time.Time
	oauth    OAuthStore
	now      func() time.Time

	mu    sync.Mutex
	cache map[string]freezeEntry
}

type freezeEntry struct {
	linked  bool
	expires time.Time
}

// NewLinkFreezePolicy membuat kebijakan. oauth nil atau enabled=false berarti tidak pernah membekukan.
func NewLinkFreezePolicy(enabled bool, deadline time.Time, oauth OAuthStore) *LinkFreezePolicy {
	return &LinkFreezePolicy{enabled: enabled, deadline: deadline, oauth: oauth, now: time.Now, cache: map[string]freezeEntry{}}
}

// Active memberi tahu apakah pembekuan sedang berlaku (jalur cepat: tanpa akses database bila belum).
func (p *LinkFreezePolicy) Active() bool {
	if p == nil || !p.enabled || p.oauth == nil || p.deadline.IsZero() {
		return false
	}
	return !p.now().Before(p.deadline)
}

// IsFrozen menjawab apakah akun ini dibekukan sekarang.
func (p *LinkFreezePolicy) IsFrozen(ctx context.Context, userID, tenantID string) bool {
	if !p.Active() || userID == "" {
		return false
	}
	if tenantID != "" && tenantID != tenantshared.DefaultTenantID {
		return false
	}

	now := p.now()
	p.mu.Lock()
	if e, ok := p.cache[userID]; ok && now.Before(e.expires) {
		p.mu.Unlock()
		return !e.linked
	}
	p.mu.Unlock()

	_, linked, err := p.oauth.GetLinkedSubject(ctx, userID, providerGoogle)
	if err != nil {
		log.Printf("⚠️ [LinkFreeze] gagal memeriksa tautan Google user %s, tidak dibekukan: %v", userID, err)
		return false
	}

	ttl := unlinkedCacheTTL
	if linked {
		ttl = linkedCacheTTL
	}
	p.mu.Lock()
	if len(p.cache) >= freezeCacheMax {
		p.cache = map[string]freezeEntry{} // batas memori sederhana: isi ulang dari database
	}
	p.cache[userID] = freezeEntry{linked: linked, expires: now.Add(ttl)}
	p.mu.Unlock()
	return !linked
}

// Invalidate membuang cache satu akun; dipanggil setelah menautkan/memutus Google supaya perubahan langsung berlaku.
func (p *LinkFreezePolicy) Invalidate(userID string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	delete(p.cache, userID)
	p.mu.Unlock()
}
