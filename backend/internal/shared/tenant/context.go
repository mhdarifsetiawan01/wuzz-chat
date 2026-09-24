// Package tenant menyediakan tipe data dan helper fungsi untuk propagasi konteks tenant
// lintas HTTP pipeline, Application Service, dan Repository layer pada WuzzChat Engine.
package tenant

import (
	"context"
	"strings"
)

// DefaultTenantID adalah ID tenant bawaan untuk backward compatibility sistem single-tenant / public instance.
const DefaultTenantID = "default"

type contextKey struct{}

var tenantCtxKey = contextKey{}

// TenantContext merepresentasikan identitas tenant terisolasi yang dipropagasi
// melalui context.Context Go lintas transport, use case, dan data access.
type TenantContext struct {
	tenantID string
}

// NewTenantContext membuat instance TenantContext baru. Jika tenantID kosong atau whitespace,
// nilai akan otomatis fallback ke DefaultTenantID.
func NewTenantContext(tenantID string) TenantContext {
	cleaned := strings.TrimSpace(tenantID)
	if cleaned == "" {
		cleaned = DefaultTenantID
	}
	return TenantContext{tenantID: cleaned}
}

// TenantID mengembalikan identifier tenant yang tersimpan.
func (tc TenantContext) TenantID() string {
	if tc.tenantID == "" {
		return DefaultTenantID
	}
	return tc.tenantID
}

// IsDefault mengembalikan true jika TenantContext merujuk pada DefaultTenantID.
func (tc TenantContext) IsDefault() bool {
	return tc.TenantID() == DefaultTenantID
}

// DefaultTenant mengembalikan TenantContext default ("default").
func DefaultTenant() TenantContext {
	return TenantContext{tenantID: DefaultTenantID}
}

// WithTenant menyematkan tenantID ke dalam Go context.Context.
func WithTenant(ctx context.Context, tenantID string) context.Context {
	tc := NewTenantContext(tenantID)
	return context.WithValue(ctx, tenantCtxKey, tc)
}

// WithTenantContext menyematkan instance TenantContext ke dalam Go context.Context.
func WithTenantContext(ctx context.Context, tc TenantContext) context.Context {
	if tc.tenantID == "" {
		tc = DefaultTenant()
	}
	return context.WithValue(ctx, tenantCtxKey, tc)
}

// FromContext mengekstrak TenantContext dari Go context.Context.
// Mengembalikan (tc, true) jika ditemukan di context, atau (DefaultTenant(), false) jika tidak ditemukan.
func FromContext(ctx context.Context) (TenantContext, bool) {
	if ctx == nil {
		return DefaultTenant(), false
	}
	val, ok := ctx.Value(tenantCtxKey).(TenantContext)
	if !ok || val.tenantID == "" {
		return DefaultTenant(), false
	}
	return val, true
}

// MustFromContext mengekstrak TenantContext dari Go context.Context.
// Jika tidak ada di context, mengembalikan DefaultTenant().
func MustFromContext(ctx context.Context) TenantContext {
	tc, _ := FromContext(ctx)
	return tc
}
