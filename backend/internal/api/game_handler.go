package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/game"
)

// GameHandler menangani request HTTP untuk game harian Wuzz Grid.
type GameHandler struct {
	service *game.Service
}

// NewGameHandler membuat GameHandler dengan service yang telah diinjeksi.
func NewGameHandler(service *game.Service) *GameHandler {
	return &GameHandler{service: service}
}

func writeGameJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(data)
}

func writeGameError(w http.ResponseWriter, code int, message string) {
	writeGameJSON(w, code, map[string]string{"error": message})
}

// Route mengarahkan /api/game/... ke aksi yang sesuai:
//
//	GET  /api/game/today          puzzle hari ini + percobaan + streak
//	POST /api/game/today/start    mulai percobaan (idempoten)
//	POST /api/game/today/submit   kirim jawaban {"placement":[kolom per baris, -1 = kosong]}
//	GET/PUT /api/game/settings    preferensi
func (h *GameHandler) Route(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeGameError(w, http.StatusUnauthorized, "Sesi tidak valid atau telah berakhir")
		return
	}

	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/game/"), "/")
	switch path {
	case "today":
		if r.Method != http.MethodGet {
			writeGameError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		res, err := h.service.Today(r.Context(), claims.TenantID, claims.UserID)
		h.respond(w, http.StatusOK, res, err)
	case "today/start":
		if r.Method != http.MethodPost {
			writeGameError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		res, err := h.service.Start(r.Context(), claims.TenantID, claims.UserID)
		h.respond(w, http.StatusOK, res, err)
	case "today/submit":
		if r.Method != http.MethodPost {
			writeGameError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		var body struct {
			Placement []int `json:"placement"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4*1024)
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeGameError(w, http.StatusBadRequest, "Payload request tidak valid")
			return
		}
		res, err := h.service.Submit(r.Context(), claims.TenantID, claims.UserID, game.Placement(body.Placement))
		h.respond(w, http.StatusOK, res, err)
	case "settings":
		switch r.Method {
		case http.MethodGet:
			res, err := h.service.GetSettings(r.Context(), claims.TenantID, claims.UserID)
			h.respond(w, http.StatusOK, res, err)
		case http.MethodPut:
			var in game.SettingsInput
			r.Body = http.MaxBytesReader(w, r.Body, 4*1024)
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				writeGameError(w, http.StatusBadRequest, "Payload request tidak valid")
				return
			}
			res, err := h.service.UpdateSettings(r.Context(), claims.TenantID, claims.UserID, in)
			h.respond(w, http.StatusOK, res, err)
		default:
			writeGameError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		}
	default:
		writeGameError(w, http.StatusNotFound, "Endpoint tidak ditemukan")
	}
}

func (h *GameHandler) respond(w http.ResponseWriter, okCode int, data interface{}, err error) {
	if err == nil {
		writeGameJSON(w, okCode, data)
		return
	}
	switch {
	case errors.Is(err, game.ErrDisabled):
		writeGameError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, game.ErrInvalidPlacement), errors.Is(err, game.ErrInvalidTimezone):
		writeGameError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, game.ErrAttemptNotFound), errors.Is(err, game.ErrTimezoneLocked):
		writeGameError(w, http.StatusConflict, err.Error())
	default:
		log.Printf("⚠️ game: %v", err)
		writeGameError(w, http.StatusInternalServerError, "Terjadi kesalahan pada server")
	}
}
