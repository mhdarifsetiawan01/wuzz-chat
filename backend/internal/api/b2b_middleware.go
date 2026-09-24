package api

import (
	"encoding/json"
	"net/http"
	"strings"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/tenant"
)

// B2BAuthGuard memvalidasi kredensial Server-to-Server B2B via header X-App-ID dan X-App-Secret.
// Jika valid, tenant terverifikasi disuntikkan ke r.Context() sebagai TenantContext.
func B2BAuthGuard(tenantSvc tenant.TenantService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Lewatkan preflight OPTIONS
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			appID := strings.TrimSpace(r.Header.Get("X-App-ID"))
			appSecret := strings.TrimSpace(r.Header.Get("X-App-Secret"))

			if appID == "" || appSecret == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "kredensial API B2B tidak lengkap (header X-App-ID dan X-App-Secret diperlukan)",
				})
				return
			}

			if tenantSvc == nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "layanan tenant tidak tersedia",
				})
				return
			}

			tenantObj, err := tenantSvc.ValidateAPIKey(r.Context(), appID, appSecret)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "kredensial API B2B tidak valid atau tidak aktif",
				})
				return
			}

			// Injeksi TenantContext yang terverifikasi ke dalam r.Context()
			tc := tenantshared.NewTenantContext(tenantObj.ID)
			ctx := tenantshared.WithTenantContext(r.Context(), tc)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
