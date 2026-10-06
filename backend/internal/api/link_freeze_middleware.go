package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
)

// CodeGoogleLinkRequired adalah kode error untuk akun yang dibekukan karena belum menautkan Google.
const CodeGoogleLinkRequired = "GOOGLE_LINK_REQUIRED"

// LinkFreezeMiddleware menolak (403) semua permintaan dari akun yang dibekukan kecuali beberapa rute yang memang
// dibutuhkan untuk keluar dari keadaan itu. Berlaku untuk semua platform dan juga untuk upgrade WebSocket (token lewat
// query). Permintaan tanpa token atau dengan token tidak sah dilewatkan apa adanya (handler yang menjawab 401).
type LinkFreezeMiddleware struct {
	policy *authz.LinkFreezePolicy
}

// NewLinkFreezeMiddleware membuat middleware. policy nil atau tidak aktif membuatnya menjadi pass-through murni.
func NewLinkFreezeMiddleware(policy *authz.LinkFreezePolicy) *LinkFreezeMiddleware {
	return &LinkFreezeMiddleware{policy: policy}
}

// linkFreezeAllowed menentukan rute yang tetap boleh dipakai akun beku:
//   - melihat statusnya (GET /api/auth/me), menautkan Google (POST /api/auth/me/google),
//     keluar (POST /api/auth/logout), memperpanjang sesi (POST /api/auth/refresh),
//   - menghapus akun (DELETE /api/auth/me): syarat kebijakan Google Play, tidak boleh diblokir,
//   - rute publik/infrastruktur: kesehatan, info versi, konfigurasi, dokumentasi, dan alur login Google.
func linkFreezeAllowed(method, path string) bool {
	if method == http.MethodOptions {
		return true
	}
	switch path {
	case "/health", VersionInfoPath, "/api/openapi.yaml", "/api/config":
		return true
	case "/api/auth/me":
		return method == http.MethodGet || method == http.MethodDelete
	case "/api/auth/me/google":
		return method == http.MethodPost
	case "/api/auth/logout", "/api/auth/refresh":
		return method == http.MethodPost
	}
	if strings.HasPrefix(path, "/api/docs") || strings.HasPrefix(path, "/api/auth/google") {
		return true
	}
	return false
}

func freezeToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return r.URL.Query().Get("token") // koneksi WebSocket: /ws?token=...
}

// Middleware membungkus handler.
func (m *LinkFreezeMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Jalur cepat: sebelum tenggat (atau saklar mati) tidak ada pekerjaan tambahan sama sekali.
		if !m.policy.Active() || linkFreezeAllowed(r.Method, r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		tok := freezeToken(r)
		if tok == "" {
			next.ServeHTTP(w, r)
			return
		}
		claims, err := auth.ValidateToken(tok)
		if err != nil || claims == nil {
			next.ServeHTTP(w, r)
			return
		}
		if m.policy.IsFrozen(r.Context(), claims.UserID, claims.TenantID) {
			WriteLinkFrozen(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// WriteLinkFrozen menulis respons 403 standar untuk akun beku.
func WriteLinkFrozen(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   CodeGoogleLinkRequired,
		"code":    CodeGoogleLinkRequired,
		"message": "Batas waktu menautkan akun Google sudah lewat. Hubungkan akun Google untuk melanjutkan.",
	})
}
