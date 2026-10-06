package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

const adminStaffPath = "/api/admin/staff"

// admin memeriksa peran EFEKTIF (diverifikasi ke database oleh RequireJWT) dan hanya meloloskan wuzz_admin.
// Moderator biasa tidak boleh mengelola staf.
func (h *ModerationHandler) admin(w http.ResponseWriter, r *http.Request) (*auth.UserClaims, bool) {
	claims, ok := h.staff(w, r)
	if !ok {
		return nil, false
	}
	if !store.IsAdmin(claims.SystemRole) {
		writeFeedError(w, http.StatusForbidden, "Khusus admin")
		return nil, false
	}
	return claims, true
}

// HandleStaff melayani pengelolaan moderator (khusus wuzz_admin):
//
//	GET  /api/admin/staff                      daftar admin dan moderator
//	GET  /api/admin/staff/lookup?username=...  cari satu akun (untuk konfirmasi sebelum diangkat)
//	POST /api/admin/staff/{id}/grant           angkat menjadi wuzz_moderator
//	POST /api/admin/staff/{id}/revoke          cabut wuzz_moderator
//
// Peran admin tidak bisa diberikan atau dicabut lewat sini (hanya SQL).
func (h *ModerationHandler) HandleStaff(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.admin(w, r)
	if !ok {
		return
	}
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, adminStaffPath), "/")
	parts := strings.Split(rest, "/")

	switch {
	case rest == "" && r.Method == http.MethodGet:
		list, err := h.store.ListStaff(r.Context(), claims.TenantID)
		if err != nil {
			log.Printf("⚠️ [Moderation] gagal memuat daftar staf: %v", err)
			writeFeedError(w, http.StatusInternalServerError, "Gagal memuat daftar staf")
			return
		}
		writeFeedJSON(w, http.StatusOK, map[string]any{"staff": list})

	case rest == "lookup" && r.Method == http.MethodGet:
		username := strings.TrimSpace(r.URL.Query().Get("username"))
		if username == "" || utf8.RuneCountInString(username) > 64 {
			writeFeedError(w, http.StatusBadRequest, "Username tidak valid")
			return
		}
		m, err := h.store.LookupUser(r.Context(), claims.TenantID, username)
		if errors.Is(err, store.ErrModerationUserNotFound) {
			writeFeedError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
			return
		}
		if err != nil {
			log.Printf("⚠️ [Moderation] lookup user gagal: %v", err)
			writeFeedError(w, http.StatusInternalServerError, "Gagal mencari pengguna")
			return
		}
		writeFeedJSON(w, http.StatusOK, map[string]any{"user": m})

	case len(parts) == 2 && parts[0] != "" && len(parts[0]) <= 64 && (parts[1] == "grant" || parts[1] == "revoke") && r.Method == http.MethodPost:
		var body struct {
			Note string `json:"note"`
		}
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
		if utf8.RuneCountInString(body.Note) > maxModNoteRunes {
			writeFeedError(w, http.StatusBadRequest, "Catatan terlalu panjang")
			return
		}
		h.changeRole(w, r, claims, parts[0], parts[1], body.Note)

	default:
		writeFeedError(w, http.StatusNotFound, "Tidak ditemukan")
	}
}

func (h *ModerationHandler) changeRole(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, userID, op, note string) {
	var (
		m   *store.StaffMember
		err error
	)
	if op == "grant" {
		m, err = h.store.GrantModerator(r.Context(), claims.TenantID, claims.UserID, userID, note)
	} else {
		m, err = h.store.RevokeModerator(r.Context(), claims.TenantID, claims.UserID, userID, note)
	}
	switch {
	case errors.Is(err, store.ErrModerationUserNotFound):
		writeFeedError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
		return
	case errors.Is(err, store.ErrStaffSelf):
		writeFeedError(w, http.StatusForbidden, err.Error())
		return
	case errors.Is(err, store.ErrStaffAlreadyStaff), errors.Is(err, store.ErrStaffNotModerator), errors.Is(err, store.ErrStaffSuspended):
		writeFeedError(w, http.StatusConflict, err.Error())
		return
	case err != nil:
		log.Printf("⚠️ [Moderation] %s moderator %s gagal: %v", op, userID, err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal mengubah peran")
		return
	}
	// Peran dibaca dari database dengan cache pendek; buang cache supaya langsung berlaku di instans ini.
	h.roles.Invalidate(userID)
	log.Printf("🛡️ [Moderation] %s moderator: user=%s admin=%s", op, userID, claims.UserID)
	writeFeedJSON(w, http.StatusOK, map[string]any{"status": "ok", "user": m})
}
