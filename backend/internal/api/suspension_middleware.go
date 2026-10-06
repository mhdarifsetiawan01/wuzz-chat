package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
)

// CodeAccountSuspended adalah kode error untuk akun yang ditangguhkan moderator.
const CodeAccountSuspended = "ACCOUNT_SUSPENDED"

// SuspensionMiddleware menolak (403) permintaan dari akun yang ditangguhkan, termasuk upgrade WebSocket (token lewat
// query). Rute yang tetap terbuka: kesehatan/versi/konfigurasi/dokumentasi, keluar, serta melihat dan MENGHAPUS akun
// sendiri (hak pengguna dan syarat Google Play, tidak boleh diblokir). Permintaan tanpa token atau dengan token tidak
// sah dilewatkan (handler yang menjawab 401).
type SuspensionMiddleware struct {
	policy *authz.SuspensionPolicy
}

func NewSuspensionMiddleware(policy *authz.SuspensionPolicy) *SuspensionMiddleware {
	return &SuspensionMiddleware{policy: policy}
}

func suspensionAllowed(method, path string) bool {
	if method == http.MethodOptions {
		return true
	}
	switch path {
	case "/health", VersionInfoPath, "/api/openapi.yaml", "/api/config":
		return true
	case "/api/auth/me":
		return method == http.MethodGet || method == http.MethodDelete
	case "/api/auth/logout":
		return method == http.MethodPost
	}
	return strings.HasPrefix(path, "/api/docs")
}

func (m *SuspensionMiddleware) Middleware(next http.Handler) http.Handler {
	if m == nil || m.policy == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if suspensionAllowed(r.Method, r.URL.Path) {
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
		if m.policy.IsSuspended(r.Context(), claims.UserID) {
			WriteAccountSuspended(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// WriteAccountSuspended menulis respons 403 standar untuk akun yang ditangguhkan.
func WriteAccountSuspended(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   CodeAccountSuspended,
		"code":    CodeAccountSuspended,
		"message": "Akun Anda ditangguhkan karena melanggar ketentuan layanan. Hubungi support untuk mengajukan banding.",
	})
}
