package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	"github.com/bms-del112/wuzz-chat/internal/memory"
	memoryinfra "github.com/bms-del112/wuzz-chat/internal/memory/infra"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

// memoryNotifierAdapter mengadaptasikan ws.Hub dan push.Service ke interface memory.MemoryNotifier.
type memoryNotifierAdapter struct {
	hub         *ws.Hub
	pushService *push.Service
}

func (n *memoryNotifierAdapter) BroadcastGroupSystemEvent(groupID, eventType, content string) {
	if n.hub != nil {
		n.hub.BroadcastGroupSystemEvent(groupID, eventType, content)
	}
}

func (n *memoryNotifierAdapter) NotifyMemoryEvent(userIDs []string, title, body, tag string, data map[string]interface{}) {
	if n.pushService != nil {
		n.pushService.NotifyMemoryEvent(userIDs, title, body, tag, data)
	}
}

// MemoryHandler adalah Thin HTTP Transport untuk routing endpoint Group Memory AI (/api/memory/...).
type MemoryHandler struct {
	svc         *memory.MemoryService
	notifier    *memoryNotifierAdapter
	memoryStore store.MemoryStore
	groupStore  store.GroupStore
	userStore   store.UserStore
	hub         *ws.Hub
	pushService *push.Service
}

// NewMemoryHandler membuat instance baru MemoryHandler dengan inisialisasi default service (backward-compatible).
func NewMemoryHandler(ms store.MemoryStore, gs store.GroupStore, us store.UserStore) *MemoryHandler {
	repo := memoryinfra.NewSQLMemoryRepository(ms)
	groupRepo := groupinfra.NewSQLGroupRepository(gs, us)
	forumSource := groupinfra.NewForumContextSource(groupRepo, nil)

	registry := memory.NewRegistry()
	registry.Register(memory.ContextTypeForum, forumSource)

	notifier := &memoryNotifierAdapter{}
	svc := memory.NewMemoryService(repo, forumSource, registry, gs, notifier)

	return &MemoryHandler{
		svc:         svc,
		notifier:    notifier,
		memoryStore: ms,
		groupStore:  gs,
		userStore:   us,
	}
}

// NewMemoryHandlerWithService membuat instance MemoryHandler dengan MemoryService yang diinjeksi secara eksplisit.
func NewMemoryHandlerWithService(svc *memory.MemoryService, gs store.GroupStore, us store.UserStore) *MemoryHandler {
	return &MemoryHandler{
		svc:        svc,
		groupStore: gs,
		userStore:  us,
	}
}

// SetHub menyetel WebSocket Hub untuk siaran real-time event.
func (h *MemoryHandler) SetHub(hub *ws.Hub) {
	h.hub = hub
	if h.notifier != nil {
		h.notifier.hub = hub
	}
}

// SetPushService menyetel push service untuk pengiriman notifikasi Web Push.
func (h *MemoryHandler) SetPushService(ps *push.Service) {
	h.pushService = ps
	if h.notifier != nil {
		h.notifier.pushService = ps
	}
}

func writeMemoryJSONError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// -----------------------------------------------------------------------------
// Dispatcher / Routing: /api/memory/...
// -----------------------------------------------------------------------------

// RouteMemoryRequest mendispatch sub-path /api/memory/...
func (h *MemoryHandler) RouteMemoryRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeMemoryJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/memory/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}

	// 1. /api/memory/drafts (GET list drafts)
	if len(parts) == 1 && parts[0] == "drafts" {
		if r.Method == http.MethodGet {
			h.handleListDrafts(w, r, claims.UserID)
		} else {
			writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 2. /api/memory/drafts/{draft_id}
	if len(parts) == 2 && parts[0] == "drafts" {
		draftID := parts[1]
		if r.Method == http.MethodGet {
			h.handleGetDraftDetail(w, r, claims.UserID, draftID)
		} else {
			writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 3. /api/memory/drafts/{draft_id}/{action}
	if len(parts) == 3 && parts[0] == "drafts" {
		draftID := parts[1]
		action := parts[2]

		switch action {
		case "approve":
			if r.Method == http.MethodPost {
				h.handleApproveDraft(w, r, claims.UserID, draftID, false)
			} else {
				writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "approve-with-changes":
			if r.Method == http.MethodPost {
				h.handleApproveDraft(w, r, claims.UserID, draftID, true)
			} else {
				writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "reject":
			if r.Method == http.MethodPost {
				h.handleRejectDraft(w, r, claims.UserID, draftID)
			} else {
				writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "journey":
			if r.Method == http.MethodDelete {
				h.handleRemoveJourney(w, r, claims.UserID, draftID)
			} else {
				writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		default:
			http.NotFound(w, r)
		}
		return
	}

	// 4. /api/memory/drafts/{draft_id}/artifacts/{artifact_id}
	if len(parts) == 4 && parts[0] == "drafts" && parts[2] == "artifacts" {
		draftID := parts[1]
		artifactID := parts[3]
		if r.Method == http.MethodPatch {
			h.handleUpdateArtifact(w, r, claims.UserID, draftID, artifactID)
		} else {
			writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	http.NotFound(w, r)
}

// RouteApprovedMemoryRequest mendispatch /api/memories/{memory_id}
func (h *MemoryHandler) RouteApprovedMemoryRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeMemoryJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/memories/")
	memoryID := strings.Trim(path, "/")
	if memoryID == "" {
		writeMemoryJSONError(w, http.StatusBadRequest, "memory_id wajib disertakan")
		return
	}

	if r.Method == http.MethodGet {
		h.handleGetApprovedMemoryDetail(w, r, claims.UserID, memoryID)
	} else {
		writeMemoryJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// -----------------------------------------------------------------------------
// Admin Review Handlers
// -----------------------------------------------------------------------------

// handleListDrafts menangani GET /api/memory/drafts?group_id={id}
func (h *MemoryHandler) handleListDrafts(w http.ResponseWriter, r *http.Request, currentUserID string) {
	groupID := strings.TrimSpace(r.URL.Query().Get("group_id"))
	if groupID == "" {
		writeMemoryJSONError(w, http.StatusBadRequest, "Parameter group_id wajib diisi")
		return
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	items, err := h.svc.ListDrafts(r.Context(), groupID, status, currentUserID)
	if err != nil {
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin atau creator grup yang dapat melihat antrean review memory")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal mengambil daftar memory drafts: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

// handleGetDraftDetail menangani GET /api/memory/drafts/{draft_id}
func (h *MemoryHandler) handleGetDraftDetail(w http.ResponseWriter, r *http.Request, currentUserID, draftID string) {
	detail, role, err := h.svc.GetDraftDetail(r.Context(), draftID, currentUserID)
	if err != nil {
		if errors.Is(err, memory.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Memory draft tidak ditemukan")
			return
		}
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin atau creator grup yang dapat melihat detail draft")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal mengambil detail memory draft: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"draft":      detail,
		"group_role": role,
	})
}

// handleApproveDraft menangani POST /api/memory/drafts/{draft_id}/approve & /approve-with-changes
func (h *MemoryHandler) handleApproveDraft(w http.ResponseWriter, r *http.Request, currentUserID, draftID string, forceChangesFlag bool) {
	approvedMem, err := h.svc.ApproveDraft(r.Context(), draftID, currentUserID, forceChangesFlag)
	if err != nil {
		if errors.Is(err, memory.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Memory draft tidak ditemukan")
			return
		}
		if errors.Is(err, memory.ErrDraftAlreadyReviewed) {
			writeMemoryJSONError(w, http.StatusConflict, "Draft telah disetujui atau ditolak sebelumnya")
			return
		}
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin atau creator grup yang dapat menyetujui draft")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal menyetujui draft memori: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":         true,
		"message":         "Draft memori berhasil divalidasi dan dipublikasikan",
		"approved_memory": approvedMem,
	})
}

// handleRejectDraft menangani POST /api/memory/drafts/{draft_id}/reject
func (h *MemoryHandler) handleRejectDraft(w http.ResponseWriter, r *http.Request, currentUserID, draftID string) {
	var reqBody struct {
		Reason string `json:"reason"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&reqBody)
	}

	err := h.svc.RejectDraft(r.Context(), draftID, currentUserID, strings.TrimSpace(reqBody.Reason))
	if err != nil {
		if errors.Is(err, memory.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Memory draft tidak ditemukan")
			return
		}
		if errors.Is(err, memory.ErrDraftAlreadyReviewed) {
			writeMemoryJSONError(w, http.StatusConflict, "Draft telah disetujui atau ditolak sebelumnya")
			return
		}
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin atau creator grup yang dapat menolak draft")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal menolak draft memori: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Draft memori berhasil ditolak",
	})
}

// handleUpdateArtifact menangani PATCH /api/memory/drafts/{draft_id}/artifacts/{artifact_id}
func (h *MemoryHandler) handleUpdateArtifact(w http.ResponseWriter, r *http.Request, currentUserID, draftID, artifactID string) {
	var reqBody struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		writeMemoryJSONError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	art, err := h.svc.UpdateArtifactContent(r.Context(), draftID, artifactID, reqBody.Content, currentUserID)
	if err != nil {
		if errors.Is(err, memory.ErrDraftAlreadyReviewed) {
			writeMemoryJSONError(w, http.StatusConflict, "Draft telah divalidasi dan tidak dapat diedit lagi")
			return
		}
		if errors.Is(err, memory.ErrArtifactNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Artefak tidak ditemukan")
			return
		}
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin atau creator grup yang dapat mengedit artefak")
			return
		}
		writeMemoryJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"message":  "Artefak berhasil diperbarui",
		"artifact": art,
	})
}

// handleRemoveJourney menangani DELETE /api/memory/drafts/{draft_id}/journey
func (h *MemoryHandler) handleRemoveJourney(w http.ResponseWriter, r *http.Request, currentUserID, draftID string) {
	err := h.svc.RemoveJourneyLite(r.Context(), draftID, currentUserID)
	if err != nil {
		if errors.Is(err, memory.ErrDraftAlreadyReviewed) {
			writeMemoryJSONError(w, http.StatusConflict, "Draft telah divalidasi dan tidak dapat diedit lagi")
			return
		}
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin atau creator grup yang dapat menghapus journey lite")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal menghapus journey lite: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Journey lite berhasil dihapus dari draf publikasi",
	})
}

// HandleGetGroupMemories menangani GET /api/groups/{group_id}/memories
func (h *MemoryHandler) HandleGetGroupMemories(w http.ResponseWriter, r *http.Request, currentUserID, groupID string) {
	limit := 20
	offset := 0
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 50 {
			limit = l
		}
	}
	if oStr := r.URL.Query().Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	items, err := h.svc.GetGroupMemories(r.Context(), groupID, currentUserID, limit, offset)
	if err != nil {
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya anggota grup yang dapat melihat arsip memori")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal mengambil daftar memori grup: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

// handleGetApprovedMemoryDetail menangani GET /api/memories/{memory_id}
func (h *MemoryHandler) handleGetApprovedMemoryDetail(w http.ResponseWriter, r *http.Request, currentUserID, memoryID string) {
	detail, err := h.svc.GetApprovedMemoryDetail(r.Context(), memoryID, currentUserID)
	if err != nil {
		if errors.Is(err, memory.ErrApprovedMemoryNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Memori grup tidak ditemukan")
			return
		}
		if errors.Is(err, memory.ErrUnauthorizedAccess) {
			writeMemoryJSONError(w, http.StatusForbidden, "Hanya anggota grup yang berhak membaca memori ini")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal mengambil detail memori: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(detail)
}
