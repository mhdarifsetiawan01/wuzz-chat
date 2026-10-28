package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// ShortLinkHandler melayani tautan pendek grup/subgrup: POST /api/links (buat/ambil kode, anggota saja)
// dan GET /api/links/{code} (publik; menerjemahkan kode ke ID ruang).
type ShortLinkHandler struct {
	store *store.ShortLinkStore
}

func NewShortLinkHandler(s *store.ShortLinkStore) *ShortLinkHandler {
	return &ShortLinkHandler{store: s}
}

type shortLinkRequest struct {
	RoomID string `json:"room_id"`
}

// Create menangani POST /api/links. Dipasang di belakang RequireJWT.
func (h *ShortLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req shortLinkRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil || req.RoomID == "" {
		http.Error(w, `{"error":"room_id wajib diisi"}`, http.StatusBadRequest)
		return
	}
	code, err := h.store.GetOrCreate(r.Context(), req.RoomID, claims.UserID)
	switch {
	case errors.Is(err, store.ErrShortLinkNotFound):
		http.Error(w, `{"error":"Grup tidak ditemukan"}`, http.StatusNotFound)
		return
	case errors.Is(err, store.ErrShortLinkForbidden):
		http.Error(w, `{"error":"Hanya anggota grup yang dapat membagikan tautan"}`, http.StatusForbidden)
		return
	case err != nil:
		http.Error(w, `{"error":"Gagal membuat tautan"}`, http.StatusInternalServerError)
		return
	}
	prefix := "/g/"
	if strings.HasPrefix(req.RoomID, "sub_") {
		prefix = "/sub/"
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "path": prefix + code})
}

// Resolve menangani GET /api/links/{code}. Publik: mengembalikan ID (+ nama/avatar untuk grup publik); akses ruang tetap diperiksa endpoint grup.
func (h *ShortLinkHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	code := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/links/"), "/")
	id, preview, err := h.store.Resolve(r.Context(), code)
	if errors.Is(err, store.ErrShortLinkNotFound) {
		http.Error(w, `{"error":"Tautan tidak ditemukan"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"Gagal memuat tautan"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(struct {
		RoomID  string                  `json:"room_id"`
		Preview *store.ShortLinkPreview `json:"preview,omitempty"`
	}{RoomID: id, Preview: preview})
}
