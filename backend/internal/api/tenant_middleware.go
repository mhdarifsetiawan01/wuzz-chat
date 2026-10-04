package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/tenant"
)

// TenantMiddleware menangani resolusi dan validasi konteks tenant dari setiap incoming HTTP request.
type TenantMiddleware struct {
	tenantSvc tenant.TenantService
}

// NewTenantMiddleware membuat instance baru TenantMiddleware.
func NewTenantMiddleware(tenantSvc tenant.TenantService) *TenantMiddleware {
	return &TenantMiddleware{
		tenantSvc: tenantSvc,
	}
}

// Handler membungkus http.Handler dengan ekstraksi, validasi, dan injeksi TenantContext.
func (m *TenantMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Lewatkan preflight OPTIONS agar CORS handler bekerja normal
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		// 1. Resolusi candidate tenant ID.
		// Header X-Tenant-ID hanya menentukan tenant untuk request tanpa token (register, exchange).
		// Jika token valid dibawa, tenant di JWT adalah sumber kebenaran dan header tidak boleh berbeda.
		headerTenantID := strings.TrimSpace(r.Header.Get("X-Tenant-ID"))
		candidateTenantID := headerTenantID

		tokenStr := ""
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		} else {
			tokenStr = strings.TrimSpace(r.URL.Query().Get("token"))
		}

		if tokenStr != "" {
			if claims, err := auth.ValidateToken(tokenStr); err == nil && claims != nil {
				tokenTenantID := tenantshared.NewTenantContext(claims.TenantID).TenantID()
				if headerTenantID != "" && tenantshared.NewTenantContext(headerTenantID).TenantID() != tokenTenantID {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					_ = json.NewEncoder(w).Encode(map[string]string{"error": "tenant pada header tidak sesuai dengan tenant sesi"})
					return
				}
				candidateTenantID = strings.TrimSpace(claims.TenantID)
			}
		}

		// Prioritas 3: Fallback ke tenant default ("default")
		if candidateTenantID == "" {
			candidateTenantID = tenantshared.DefaultTenantID
		}

		// 2. Validasi keaktifan tenant jika TenantService tersedia
		if m.tenantSvc != nil {
			tenantObj, err := m.tenantSvc.ValidateTenantActive(r.Context(), candidateTenantID)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				if errors.Is(err, tenant.ErrTenantInactive) {
					_ = json.NewEncoder(w).Encode(map[string]string{"error": "tenant tidak aktif"})
				} else {
					_ = json.NewEncoder(w).Encode(map[string]string{"error": "tenant tidak ditemukan atau tidak aktif"})
				}
				return
			}
			candidateTenantID = tenantObj.ID
		}

		// 3. Pasang TenantContext ke r.Context()
		tc := tenantshared.NewTenantContext(candidateTenantID)
		ctx := tenantshared.WithTenantContext(r.Context(), tc)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
