package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/game"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// GameBoardModerator adalah kemampuan game yang dipakai alat moderasi: mengeluarkan pengguna dari papan publik
// Wuzz Grid tanpa menyentuh akunnya (diimplementasikan oleh game.Service).
type GameBoardModerator interface {
	SetBoardHidden(ctx context.Context, tenantID, actorID, userID string, hidden bool, note string) error
	IsBoardHidden(ctx context.Context, tenantID, userID string) (bool, error)
}

// SetGameBoardModerator memasang pengelola papan publik (nil = aksi game-board dinonaktifkan).
func (h *ModerationHandler) SetGameBoardModerator(g GameBoardModerator) { h.gameBoard = g }

// handleGameBoard melayani /api/admin/users/{id}/game-board (staf):
//
//	GET  -> {"hidden": bool}
//	POST {"hidden": bool, "note": "..."} -> catatan wajib saat mengeluarkan; tercatat di audit
func (h *ModerationHandler) handleGameBoard(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, id string) {
	if h.gameBoard == nil {
		writeFeedError(w, http.StatusNotFound, "Tidak ditemukan")
		return
	}
	detail, err := h.store.GetUserDetail(r.Context(), claims.TenantID, id)
	if errors.Is(err, store.ErrModerationUserNotFound) {
		writeFeedError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
		return
	}
	if err != nil {
		log.Printf("⚠️ [Moderation] game-board detail %s gagal: %v", id, err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memproses permintaan")
		return
	}

	switch r.Method {
	case http.MethodGet:
		hidden, err := h.gameBoard.IsBoardHidden(r.Context(), claims.TenantID, id)
		if err != nil {
			log.Printf("⚠️ [Moderation] game-board baca %s gagal: %v", id, err)
			writeFeedError(w, http.StatusInternalServerError, "Gagal memproses permintaan")
			return
		}
		writeFeedJSON(w, http.StatusOK, map[string]bool{"hidden": hidden})
	case http.MethodPost:
		if detail.User.Deleted {
			writeFeedError(w, http.StatusConflict, "Akun sudah dihapus")
			return
		}
		var body struct {
			Hidden bool   `json:"hidden"`
			Note   string `json:"note"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
			writeFeedError(w, http.StatusBadRequest, "Payload request tidak valid")
			return
		}
		note := strings.TrimSpace(body.Note)
		if utf8.RuneCountInString(note) > maxModNoteRunes {
			writeFeedError(w, http.StatusBadRequest, "Catatan terlalu panjang")
			return
		}
		if err := h.gameBoard.SetBoardHidden(r.Context(), claims.TenantID, claims.UserID, id, body.Hidden, note); err != nil {
			if errors.Is(err, game.ErrNoteRequired) {
				writeFeedError(w, http.StatusBadRequest, store.ErrModerationNoteRequired.Error())
				return
			}
			log.Printf("⚠️ [Moderation] game-board %s gagal: %v", id, err)
			writeFeedError(w, http.StatusInternalServerError, "Gagal memproses permintaan")
			return
		}
		log.Printf("🛡️ [Moderation] game-board: user=%s hidden=%v moderator=%s", id, body.Hidden, claims.UserID)
		writeFeedJSON(w, http.StatusOK, map[string]bool{"hidden": body.Hidden})
	default:
		writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
	}
}
