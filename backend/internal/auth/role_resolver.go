package auth

import (
	"context"
	"sync"
)

// RoleResolver menentukan peran sistem EFEKTIF seorang pengguna. Peran di dalam JWT hanyalah klaim saat login dan bisa
// basi (maksimal 30 hari); untuk keputusan hak istimewa, nilai di database yang berlaku.
type RoleResolver interface {
	// EffectiveSystemRole mengembalikan peran yang berlaku sekarang untuk userID, dengan tokenRole sebagai klaim token.
	EffectiveSystemRole(ctx context.Context, userID, tokenRole string) string
}

var (
	roleResolverMu sync.RWMutex
	roleResolver   RoleResolver
)

// SetRoleResolver memasang resolver peran (nil = peran dari token dipakai apa adanya).
func SetRoleResolver(r RoleResolver) {
	roleResolverMu.Lock()
	defer roleResolverMu.Unlock()
	roleResolver = r
}

func getRoleResolver() RoleResolver {
	roleResolverMu.RLock()
	defer roleResolverMu.RUnlock()
	return roleResolver
}
