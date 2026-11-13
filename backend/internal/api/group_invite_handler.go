package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/group"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Tautan undangan grup privat (V2 Tahap 1, docs/plans/backlog/PRIVATE_GROUP_INVITES.md):
//   GET|POST|DELETE /api/groups/{grp_id}/invite-link            (creator/admin)
//   GET  /api/groups/{grp_id}/join-requests                     (creator/admin; sub_ tetap jalur forum)
//   POST /api/groups/{grp_id}/join-requests/{req_id}/action     (creator/admin)
//   GET  /api/invites/{token}          pratinjau (login)
//   POST /api/invites/{token}/join     ajukan gabung
//   DELETE /api/invites/{token}/request batalkan pengajuan sendiri

// SetStarsHandler memasang grup berbayar. Anggota yang masuk lewat pembayaran disiarkan seperti anggota baru lainnya.
func (h *GroupHandler) SetStarsHandler(sh *StarsHandler) {
	h.stars = sh
	if sh == nil {
		return
	}
	sh.SetOnJoined(func(groupID, userID string) {
		if h.hub == nil {
			return
		}
		h.hub.InvalidateRoomMembersCache(groupID)
		h.hub.BroadcastRoomUsers(groupID)
		h.hub.BroadcastGroupSystemEvent(groupID, "group_member_joined", h.resolveDisplayName(userID)+" bergabung ke grup.")
	})
}

// SetInviteService memasang layanan undangan. nil = endpoint undangan menjawab 404 (fitur tidak dirakit).
func (h *GroupHandler) SetInviteService(svc *group.InviteService) {
	h.inviteSvc = svc
	if svc == nil {
		return
	}
	if h.hub != nil {
		svc.SetBroadcaster(h.hub)
	}
	if h.pushService != nil {
		svc.SetNotifier(h.pushService)
	}
	if h.groupSvc != nil {
		h.groupSvc.SetInviteRevoker(svc)
	}
}

func writeInviteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeInviteError(w http.ResponseWriter, err error) {
	var cd *store.RejoinCooldownError
	switch {
	case errors.As(err, &cd):
		secs := int(cd.RetryAfter.Seconds()) + 1
		w.Header().Set("Retry-After", strconv.Itoa(secs))
		writeInviteJSON(w, http.StatusTooManyRequests, map[string]any{
			"error": "Permohonan Anda ditolak. Anda bisa mengajukan lagi nanti.", "code": "rejoin_cooldown", "retry_after_seconds": secs,
		})
	case errors.Is(err, store.ErrInviteNotFound):
		writeInviteJSON(w, http.StatusNotFound, map[string]string{"error": "Tautan undangan tidak berlaku lagi", "code": "invite_not_found"})
	case errors.Is(err, store.ErrGroupNotFound):
		writeInviteJSON(w, http.StatusNotFound, map[string]string{"error": "Grup tidak ditemukan", "code": "group_not_found"})
	case errors.Is(err, store.ErrUnauthorizedGroup):
		writeInviteJSON(w, http.StatusForbidden, map[string]string{"error": "Hanya admin grup yang dapat melakukan ini", "code": "admin_only"})
	case errors.Is(err, store.ErrInviteNotPrivate):
		writeInviteJSON(w, http.StatusConflict, map[string]string{"error": "Tautan undangan hanya untuk grup privat", "code": "not_private"})
	case errors.Is(err, store.ErrTooManyPending):
		writeInviteJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Grup ini sedang menerima terlalu banyak permohonan. Coba lagi nanti.", "code": "too_many_pending"})
	case errors.Is(err, store.ErrJoinRequestNotFound):
		writeInviteJSON(w, http.StatusNotFound, map[string]string{"error": "Permohonan tidak ditemukan", "code": "request_not_found"})
	case errors.Is(err, store.ErrPaymentRequired):
		writeInviteJSON(w, http.StatusPaymentRequired, map[string]string{"error": "Grup ini berbayar. Bayar dengan Star untuk bergabung.", "code": "payment_required"})
	case errors.Is(err, store.ErrJoinRequestProcessed):
		writeInviteJSON(w, http.StatusConflict, map[string]string{"error": "Permohonan sudah diproses", "code": "request_processed"})
	default:
		writeInviteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memproses undangan"})
	}
}

// handleInviteLink melayani /api/groups/{grp_id}/invite-link.
func (h *GroupHandler) handleInviteLink(w http.ResponseWriter, r *http.Request, userID, groupID string) {
	if h.inviteSvc == nil || !strings.HasPrefix(groupID, "grp_") {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		link, err := h.inviteSvc.GetLink(r.Context(), groupID, userID)
		if err != nil {
			writeInviteError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"link": link})
	case http.MethodPost:
		var req struct {
			Reset bool `json:"reset"`
		}
		// Body opsional: kosong = buat bila belum ada.
		if r.ContentLength != 0 {
			if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
				writeInviteJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload tidak valid"})
				return
			}
		}
		link, err := h.inviteSvc.CreateOrResetLink(r.Context(), groupID, userID, req.Reset)
		if err != nil {
			writeInviteError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"link": link})
	case http.MethodDelete:
		if err := h.inviteSvc.RevokeLink(r.Context(), groupID, userID); err != nil {
			writeInviteError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"link": nil})
	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// handleGroupJoinRequests melayani daftar pengajuan grup utama (GET .../join-requests).
func (h *GroupHandler) handleGroupJoinRequests(w http.ResponseWriter, r *http.Request, userID, groupID string) {
	items, err := h.inviteSvc.ListPending(r.Context(), groupID, userID)
	if err != nil {
		writeInviteError(w, err)
		return
	}
	writeInviteJSON(w, http.StatusOK, map[string]any{"success": true, "requests": items})
}

// handleGroupJoinRequestAction melayani persetujuan/penolakan pengajuan grup utama.
func (h *GroupHandler) handleGroupJoinRequestAction(w http.ResponseWriter, r *http.Request, userID, groupID, requestID string) {
	var req struct {
		Approve bool `json:"approve"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		writeInviteJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload tidak valid"})
		return
	}
	if err := h.inviteSvc.Respond(r.Context(), groupID, requestID, userID, req.Approve); err != nil {
		writeInviteError(w, err)
		return
	}
	msg := "Permohonan bergabung berhasil ditolak"
	if req.Approve {
		msg = "Permohonan bergabung berhasil disetujui"
	}
	writeInviteJSON(w, http.StatusOK, map[string]any{"success": true, "message": msg})
}

// RouteInviteRequest melayani /api/invites/{token}[/join|/request]. Dipasang di belakang RequireJWT.
func (h *GroupHandler) RouteInviteRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if h.inviteSvc == nil {
		http.NotFound(w, r)
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/invites/"), "/"), "/")
	token := parts[0]
	switch {
	case len(parts) == 1 && r.Method == http.MethodGet:
		p, err := h.inviteSvc.Preview(r.Context(), token, claims.UserID)
		if err != nil {
			writeInviteError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, p)
	case len(parts) == 2 && parts[1] == "join" && r.Method == http.MethodPost:
		res, err := h.inviteSvc.RequestJoin(r.Context(), token, claims.UserID)
		if err != nil {
			writeInviteError(w, err)
			return
		}
		status := http.StatusAccepted
		if res.Status == store.InviteStatusMember {
			status = http.StatusOK
		}
		writeInviteJSON(w, status, res)
	case len(parts) == 2 && parts[1] == "purchase" && r.Method == http.MethodPost && h.stars.PaidGroupsEnabled():
		h.stars.HandlePurchase(w, r, claims, token)
	case len(parts) == 2 && parts[1] == "request" && r.Method == http.MethodDelete:
		if err := h.inviteSvc.CancelRequest(r.Context(), token, claims.UserID); err != nil {
			writeInviteError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]string{"status": store.InviteStatusNone})
	default:
		http.NotFound(w, r)
	}
}
