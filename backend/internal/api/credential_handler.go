package api

import (
	"encoding/json"
	"net/http"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// CredentialHandler menangani permintaan terkait metode login user.
type CredentialHandler struct {
	credentialStore store.CredentialStore
}

// NewCredentialHandler membuat instance CredentialHandler.
func NewCredentialHandler(cs store.CredentialStore) *CredentialHandler {
	return &CredentialHandler{credentialStore: cs}
}

// ListCredentials mengembalikan daftar metode login milik user yang sedang login.
//
// Endpoint: GET /api/auth/credentials
// Header:   Authorization: Bearer <token>
// Response: [ { id, type, name, identifier, created_at, updated_at }, ... ]
// Catatan:  secret_data (hash password) TIDAK pernah dikembalikan.
func (h *CredentialHandler) ListCredentials(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	// Ambil user claims dari context yang di-set oleh RequireJWT
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	credentials, err := h.credentialStore.ListCredentials(claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"Gagal mengambil data kredensial"}`, http.StatusInternalServerError)
		return
	}

	// Jika nil (user lama belum punya record), kembalikan array kosong bukan null
	if credentials == nil {
		credentials = []store.UserCredential{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(credentials)
}
