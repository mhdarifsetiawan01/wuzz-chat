package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/connection"
)

// ConnectionHandler menangani request HTTP untuk manajemen pertemanan dan profil privat.
type ConnectionHandler struct {
	service *connection.ConnectionService
}

// NewConnectionHandlerWithService membuat instance baru ConnectionHandler.
func NewConnectionHandlerWithService(service *connection.ConnectionService) *ConnectionHandler {
	return &ConnectionHandler{
		service: service,
	}
}

func writeConnectionJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeConnectionError(w http.ResponseWriter, status int, message string) {
	writeConnectionJSON(w, status, map[string]string{"error": message})
}

// RouteConnectionRequest merutekan seluruh permintaan di bawah /api/connections/
func (h *ConnectionHandler) RouteConnectionRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeConnectionError(w, http.StatusUnauthorized, "Sesi tidak valid atau telah berakhir")
		return
	}

	rawPath := strings.TrimPrefix(r.URL.Path, "/api/connections")
	rawPath = strings.Trim(rawPath, "/")

	// Kasus 1: Sub-route dengan action eksplisit
	switch {
	case rawPath == "request":
		if r.Method != http.MethodPost {
			writeConnectionError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		h.handleRequestConnection(w, r, claims)
		return

	case rawPath == "respond":
		if r.Method != http.MethodPost {
			writeConnectionError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		h.handleRespondConnection(w, r, claims)
		return

	case rawPath == "block":
		if r.Method != http.MethodPost {
			writeConnectionError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		h.handleBlock(w, r, claims)
		return

	case strings.HasPrefix(rawPath, "block/"):
		if r.Method != http.MethodDelete {
			writeConnectionError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		h.handleUnblock(w, r, claims, strings.TrimPrefix(rawPath, "block/"))
		return

	case rawPath == "friends":
		if r.Method != http.MethodGet {
			writeConnectionError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		h.handleListFriends(w, r, claims)
		return

	case rawPath == "pending":
		if r.Method != http.MethodGet {
			writeConnectionError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		h.handleListPending(w, r, claims)
		return

	case strings.HasPrefix(rawPath, "status/"):
		if r.Method != http.MethodGet {
			writeConnectionError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
			return
		}
		targetUserID := strings.TrimPrefix(rawPath, "status/")
		h.handleGetStatus(w, r, claims, targetUserID)
		return

	default:
		// Kasus 2: /api/connections/{targetUserId} (DELETE untuk unfriend)
		if rawPath != "" {
			parts := strings.Split(rawPath, "/")
			if len(parts) == 1 && r.Method == http.MethodDelete {
				h.handleUnfriend(w, r, claims, parts[0])
				return
			}
		}
		writeConnectionError(w, http.StatusNotFound, "Endpoint tidak ditemukan")
	}
}

type requestConnectionPayload struct {
	TargetUserID string                `json:"target_user_id"`
	SourceType   connection.SourceType `json:"source_type,omitempty"`
}

func (h *ConnectionHandler) handleRequestConnection(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	var payload requestConnectionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeConnectionError(w, http.StatusBadRequest, "Payload JSON tidak valid")
		return
	}

	payload.TargetUserID = strings.TrimSpace(payload.TargetUserID)
	if payload.TargetUserID == "" {
		writeConnectionError(w, http.StatusBadRequest, "target_user_id wajib diisi")
		return
	}

	conn, err := h.service.RequestConnection(r.Context(), claims.UserID, payload.TargetUserID, payload.SourceType)
	if err != nil {
		switch {
		case errors.Is(err, connection.ErrSelfConnection):
			writeConnectionError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, connection.ErrAlreadyFriends):
			writeConnectionError(w, http.StatusConflict, err.Error())
		case errors.Is(err, connection.ErrAlreadyRequested):
			writeConnectionError(w, http.StatusConflict, err.Error())
		case errors.Is(err, connection.ErrCooldownActive):
			writeConnectionError(w, http.StatusTooManyRequests, err.Error())
		case errors.Is(err, connection.ErrRateLimitExceeded):
			writeConnectionError(w, http.StatusTooManyRequests, err.Error())
		case errors.Is(err, connection.ErrMaxPendingExceeded):
			writeConnectionError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, connection.ErrDailyLimitExceeded):
			writeConnectionError(w, http.StatusTooManyRequests, err.Error())
		default:
			writeConnectionError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	writeConnectionJSON(w, http.StatusCreated, conn)
}

type respondConnectionPayload struct {
	ConnectionID string `json:"connection_id"`
	Action       string `json:"action"` // "accept" atau "decline"
}

func (h *ConnectionHandler) handleRespondConnection(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	var payload respondConnectionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeConnectionError(w, http.StatusBadRequest, "Payload JSON tidak valid")
		return
	}

	payload.ConnectionID = strings.TrimSpace(payload.ConnectionID)
	payload.Action = strings.TrimSpace(payload.Action)
	if payload.ConnectionID == "" || payload.Action == "" {
		writeConnectionError(w, http.StatusBadRequest, "connection_id dan action wajib diisi")
		return
	}

	conn, err := h.service.RespondConnection(r.Context(), claims.UserID, payload.ConnectionID, payload.Action)
	if err != nil {
		switch {
		case errors.Is(err, connection.ErrForbidden):
			writeConnectionError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, connection.ErrConnectionNotFound):
			writeConnectionError(w, http.StatusNotFound, err.Error())
		default:
			writeConnectionError(w, http.StatusBadRequest, err.Error())
		}
		return
	}

	writeConnectionJSON(w, http.StatusOK, conn)
}

func (h *ConnectionHandler) handleListFriends(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	cursor := strings.TrimSpace(r.URL.Query().Get("cursor"))
	limitStr := strings.TrimSpace(r.URL.Query().Get("limit"))
	limit := 0
	if limitStr != "" {
		limit, _ = strconv.Atoi(limitStr)
	}

	res, err := h.service.ListFriends(r.Context(), claims.UserID, cursor, limit)
	if err != nil {
		writeConnectionError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeConnectionJSON(w, http.StatusOK, res)
}

func (h *ConnectionHandler) handleListPending(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	direction := strings.TrimSpace(r.URL.Query().Get("direction"))
	items, err := h.service.ListPendingRequests(r.Context(), claims.UserID, direction)
	if err != nil {
		writeConnectionError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if items == nil {
		items = []*connection.PendingRequestItem{}
	}
	writeConnectionJSON(w, http.StatusOK, items)
}

func (h *ConnectionHandler) handleGetStatus(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, targetUserID string) {
	targetUserID = strings.TrimSpace(targetUserID)
	if targetUserID == "" {
		writeConnectionError(w, http.StatusBadRequest, "target_user_id wajib diisi")
		return
	}

	status, err := h.service.GetConnectionStatus(r.Context(), claims.UserID, targetUserID)
	if err != nil {
		writeConnectionError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeConnectionJSON(w, http.StatusOK, status)
}

func (h *ConnectionHandler) handleUnfriend(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, targetUserID string) {
	targetUserID = strings.TrimSpace(targetUserID)
	if targetUserID == "" {
		writeConnectionError(w, http.StatusBadRequest, "target_user_id wajib diisi")
		return
	}

	if err := h.service.Unfriend(r.Context(), claims.UserID, targetUserID); err != nil {
		writeConnectionError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeConnectionJSON(w, http.StatusOK, map[string]string{"message": "Berhasil menghapus pertemanan"})
}

func (h *ConnectionHandler) handleBlock(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	var body struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil || strings.TrimSpace(body.UserID) == "" {
		writeConnectionError(w, http.StatusBadRequest, "user_id wajib diisi")
		return
	}
	if err := h.service.BlockUser(r.Context(), claims.UserID, strings.TrimSpace(body.UserID)); err != nil {
		writeConnectionError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeConnectionJSON(w, http.StatusOK, map[string]string{"message": "Pengguna diblokir"})
}

func (h *ConnectionHandler) handleUnblock(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, targetUserID string) {
	targetUserID = strings.TrimSpace(targetUserID)
	if targetUserID == "" {
		writeConnectionError(w, http.StatusBadRequest, "target_user_id wajib diisi")
		return
	}
	if err := h.service.UnblockUser(r.Context(), claims.UserID, targetUserID); err != nil {
		if errors.Is(err, connection.ErrConnectionNotFound) {
			writeConnectionError(w, http.StatusNotFound, "Pengguna ini tidak sedang Anda blokir")
			return
		}
		writeConnectionError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeConnectionJSON(w, http.StatusOK, map[string]string{"message": "Blokir dibuka"})
}
