package memory

import (
	"context"
	"fmt"
	"sync"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// ContextSource adalah kontrak interface abstraksi bagi domain percakapan eksternal (Forum, Group, Direct Chat)
// untuk menyuplai riwayat pesan dan metadata percakapan ke Memory Engine tanpa coupling.
type ContextSource interface {
	// GetMessages mengambil riwayat pesan percakapan yang valid/aktif untuk konteks tertentu.
	GetMessages(ctx context.Context, contextID string, limit int) ([]store.StoredMessage, error)

	// GetContextMeta mengambil metadata percakapan (judul, pemilik/admin, grup induk).
	GetContextMeta(ctx context.Context, contextID string) (*MemoryContext, error)

	// GetAuthorizedViewers memvalidasi apakah viewerID berhak melihat hasil memori dari konteks ini.
	GetAuthorizedViewers(ctx context.Context, contextID, viewerID string) (bool, error)
}

// ContextSourceRegistry mengelola registrasi dinamis ContextSource berdasarkan ContextType.
type ContextSourceRegistry interface {
	Register(cType ContextType, source ContextSource)
	Get(cType ContextType) (ContextSource, bool)
}

// Registry adalah implementasi thread-safe dari ContextSourceRegistry.
type Registry struct {
	mu      sync.RWMutex
	sources map[ContextType]ContextSource
}

// NewRegistry membuat instansiasi baru Registry ContextSource.
func NewRegistry() *Registry {
	return &Registry{
		sources: make(map[ContextType]ContextSource),
	}
}

// Register mendaftarkan ContextSource untuk tipe konteks tertentu.
func (r *Registry) Register(cType ContextType, source ContextSource) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sources[cType] = source
}

// Get mengambil ContextSource untuk tipe konteks yang diminta.
func (r *Registry) Get(cType ContextType) (ContextSource, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	source, ok := r.sources[cType]
	return source, ok
}

// Resolve mengambil ContextSource dan menghasilkan error jika tidak ditemukan.
func (r *Registry) Resolve(cType ContextType) (ContextSource, error) {
	if src, ok := r.Get(cType); ok && src != nil {
		return src, nil
	}
	return nil, fmt.Errorf("context source untuk tipe '%s' tidak ditemukan", cType)
}
