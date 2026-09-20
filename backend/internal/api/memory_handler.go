package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

type MemoryHandler struct {
	memoryStore store.MemoryStore
	groupStore  store.GroupStore
	userStore   store.UserStore
	hub         *ws.Hub
	pushService *push.Service
}

func NewMemoryHandler(ms store.MemoryStore, gs store.GroupStore, us store.UserStore) *MemoryHandler {
	return &MemoryHandler{
		memoryStore: ms,
		groupStore:  gs,
		userStore:   us,
	}
}

func (h *MemoryHandler) SetHub(hub *ws.Hub) {
	h.hub = hub
}

func (h *MemoryHandler) SetPushService(ps *push.Service) {
	h.pushService = ps
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
// Admin Review Handlers (Bagian 9 Spec)
// -----------------------------------------------------------------------------

// handleListDrafts menangani GET /api/memory/drafts?group_id={id}
func (h *MemoryHandler) handleListDrafts(w http.ResponseWriter, r *http.Request, currentUserID string) {
	groupID := strings.TrimSpace(r.URL.Query().Get("group_id"))
	if groupID == "" {
		writeMemoryJSONError(w, http.StatusBadRequest, "Parameter group_id wajib diisi")
		return
	}

	// Otorisasi: User harus admin/creator di group_id
	isAdmin, err := h.checkAdminRole(groupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memverifikasi hak akses: "+err.Error())
		return
	}
	if !isAdmin {
		writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin grup yang memiliki akses ke draft memori")
		return
	}

	drafts, err := h.memoryStore.GetDraftsByGroupID(r.Context(), groupID, store.DraftStatusDraft)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal mengambil daftar draft: "+err.Error())
		return
	}

	type DraftListItem struct {
		DraftID        string `json:"draft_id"`
		ForumID        string `json:"forum_id"`
		ForumTitle     string `json:"forum_title"`
		GroupID        string `json:"group_id"`
		Status         string `json:"status"`
		MessageCount   int    `json:"message_count_processed"`
		WasTruncated   bool   `json:"was_truncated"`
		ArtifactCount  int    `json:"artifact_count"`
		CreatedAt      string `json:"created_at"`
	}

	items := make([]DraftListItem, 0, len(drafts))
	for _, d := range drafts {
		forumTitle := "Forum Diskusi"
		if details, err := h.groupStore.GetGroupDetails(d.ForumID, ""); err == nil && details != nil && details.Title != "" {
			forumTitle = details.Title
		}

		artCount := len(d.Artifacts)
		if artCount == 0 {
			if arts, err := h.memoryStore.GetArtifactsByDraftID(r.Context(), d.ID); err == nil {
				artCount = len(arts)
			}
		}

		items = append(items, DraftListItem{
			DraftID:       d.ID,
			ForumID:       d.ForumID,
			ForumTitle:    forumTitle,
			GroupID:       d.GroupID,
			Status:        d.Status,
			MessageCount:  d.MessageCountProcessed,
			WasTruncated:  d.WasTruncated,
			ArtifactCount: artCount,
			CreatedAt:     d.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

// handleGetDraftDetail menangani GET /api/memory/drafts/{draft_id}
func (h *MemoryHandler) handleGetDraftDetail(w http.ResponseWriter, r *http.Request, currentUserID, draftID string) {
	draft, err := h.memoryStore.GetDraftByID(r.Context(), draftID)
	if err != nil {
		if errors.Is(err, store.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Draft memori tidak ditemukan")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal mengambil detail draft: "+err.Error())
		return
	}

	// Otorisasi: User harus admin/creator di draft.GroupID
	isAdmin, err := h.checkAdminRole(draft.GroupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memverifikasi hak akses: "+err.Error())
		return
	}
	if !isAdmin {
		writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin grup yang memiliki akses ke detail draft memori")
		return
	}

	forumTitle := "Forum Diskusi"
	if details, err := h.groupStore.GetGroupDetails(draft.ForumID, ""); err == nil && details != nil && details.Title != "" {
		forumTitle = details.Title
	}

	response := map[string]interface{}{
		"draft": map[string]interface{}{
			"id":                      draft.ID,
			"job_id":                  draft.JobID,
			"forum_id":                draft.ForumID,
			"forum_title":             forumTitle,
			"group_id":                draft.GroupID,
			"status":                  draft.Status,
			"message_count_processed": draft.MessageCountProcessed,
			"was_truncated":           draft.WasTruncated,
			"truncation_note":         draft.TruncationNote,
			"reviewed_at":             draft.ReviewedAt,
			"reviewed_by":             draft.ReviewedBy,
			"rejection_reason":        draft.RejectionReason,
			"created_at":              draft.CreatedAt,
			"artifacts":               draft.Artifacts,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

// handleApproveDraft menangani POST /api/memory/drafts/{draft_id}/approve & approve-with-changes
func (h *MemoryHandler) handleApproveDraft(w http.ResponseWriter, r *http.Request, currentUserID, draftID string, forceChangesFlag bool) {
	draft, err := h.memoryStore.GetDraftByID(r.Context(), draftID)
	if err != nil {
		if errors.Is(err, store.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Draft memori tidak ditemukan")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memuat draft: "+err.Error())
		return
	}

	isAdmin, err := h.checkAdminRole(draft.GroupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memverifikasi hak akses: "+err.Error())
		return
	}
	if !isAdmin {
		writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin grup yang dapat menyetujui draft memori")
		return
	}

	if draft.Status != store.DraftStatusDraft {
		writeMemoryJSONError(w, http.StatusBadRequest, "Draft sudah diproses sebelumnya (Status: "+draft.Status+")")
		return
	}

	artifacts := draft.Artifacts
	if len(artifacts) == 0 {
		artifacts, _ = h.memoryStore.GetArtifactsByDraftID(r.Context(), draft.ID)
	}

	approvedMem := &store.ApprovedMemory{
		DraftID:       draft.ID,
		ForumID:       draft.ForumID,
		GroupID:       draft.GroupID,
		ApprovedBy:    currentUserID,
		HasHumanEdits: forceChangesFlag,
	}

	hasHumanEdits := forceChangesFlag
	decisions := make([]store.ApprovedDecisionItem, 0)

	for _, art := range artifacts {
		if art.IsHumanEdited {
			hasHumanEdits = true
		}

		switch art.Type {
		case store.ArtifactTypeSummary:
			if !art.IsRemoved {
				approvedMem.SnapshotSummary = art.Content
				approvedMem.SnapshotSummaryConf = art.Confidence
			}
		case store.ArtifactTypeDecision:
			if !art.IsRemoved {
				pos := 1
				if art.Position != nil {
					pos = *art.Position
				}
				evList := make([]store.ApprovedEvidenceItem, 0, len(art.Evidences))
				for _, ev := range art.Evidences {
					evList = append(evList, store.ApprovedEvidenceItem{
						MessageID:  ev.MessageID,
						Preview:    ev.MessagePreview,
						SenderName: ev.MessageSenderName,
						SentAt:     ev.MessageSentAt,
					})
				}
				decisions = append(decisions, store.ApprovedDecisionItem{
					Position:      pos,
					Text:          art.Content,
					Confidence:    art.Confidence,
					IsHumanEdited: art.IsHumanEdited,
					Evidences:     evList,
				})
			}
		case store.ArtifactTypeJourneyLite:
			if art.IsRemoved {
				approvedMem.IsJourneyLiteRemoved = true
				hasHumanEdits = true
			} else {
				approvedMem.SnapshotJourneyLite = art.Content
				approvedMem.SnapshotJourneyConf = art.Confidence
				approvedMem.IsJourneyLiteRemoved = false
			}
		}
	}

	approvedMem.HasHumanEdits = hasHumanEdits
	approvedMem.DecisionsList = decisions

	decBytes, err := json.Marshal(decisions)
	if err == nil {
		approvedMem.SnapshotDecisions = string(decBytes)
	} else {
		approvedMem.SnapshotDecisions = "[]"
	}

	actionType := store.ActionApproved
	if hasHumanEdits {
		actionType = store.ActionApprovedWithEdits
	}

	reviewAction := &store.MemoryReviewAction{
		DraftID: draft.ID,
		AdminID: currentUserID,
		Action:  actionType,
	}

	if err := h.memoryStore.ApproveDraft(r.Context(), draft.ID, currentUserID, approvedMem, reviewAction); err != nil {
		if errors.Is(err, store.ErrDraftAlreadyReviewed) {
			writeMemoryJSONError(w, http.StatusConflict, "Draft telah disetujui atau ditolak sebelumnya")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal menyetujui draft memori: "+err.Error())
		return
	}

	// Real-time notification broadcast ke member jika hub aktif
	if h.hub != nil {
		h.hub.BroadcastGroupSystemEvent(draft.GroupID, "memory_approved", "🧠 Memori grup baru telah divalidasi dan ditambahkan ke arsip!")
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
	draft, err := h.memoryStore.GetDraftByID(r.Context(), draftID)
	if err != nil {
		if errors.Is(err, store.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Draft memori tidak ditemukan")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memuat draft: "+err.Error())
		return
	}

	isAdmin, err := h.checkAdminRole(draft.GroupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memverifikasi hak akses: "+err.Error())
		return
	}
	if !isAdmin {
		writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin grup yang dapat menolak draft memori")
		return
	}

	if draft.Status != store.DraftStatusDraft {
		writeMemoryJSONError(w, http.StatusBadRequest, "Draft sudah diproses sebelumnya (Status: "+draft.Status+")")
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if err := h.memoryStore.RejectDraft(r.Context(), draft.ID, currentUserID, req.Reason); err != nil {
		if errors.Is(err, store.ErrDraftAlreadyReviewed) {
			writeMemoryJSONError(w, http.StatusConflict, "Draft telah disetujui atau ditolak sebelumnya")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal menolak draft: "+err.Error())
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
	draft, err := h.memoryStore.GetDraftByID(r.Context(), draftID)
	if err != nil {
		if errors.Is(err, store.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Draft memori tidak ditemukan")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memuat draft: "+err.Error())
		return
	}

	isAdmin, err := h.checkAdminRole(draft.GroupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memverifikasi hak akses: "+err.Error())
		return
	}
	if !isAdmin {
		writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin grup yang dapat mengedit artefak memori")
		return
	}

	if draft.Status != store.DraftStatusDraft {
		writeMemoryJSONError(w, http.StatusBadRequest, "Draft tidak dapat diedit karena sudah berstatus: "+draft.Status)
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeMemoryJSONError(w, http.StatusBadRequest, "Format payload JSON tidak valid")
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		writeMemoryJSONError(w, http.StatusBadRequest, "Konten artefak tidak boleh kosong")
		return
	}

	artifact, err := h.memoryStore.GetArtifactByID(r.Context(), artifactID)
	if err != nil {
		if errors.Is(err, store.ErrArtifactNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Artefak tidak ditemukan")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memuat artefak: "+err.Error())
		return
	}

	if artifact.DraftID != draftID {
		writeMemoryJSONError(w, http.StatusBadRequest, "Artefak tidak termasuk dalam draft ini")
		return
	}

	oldContent := artifact.Content

	if err := h.memoryStore.UpdateArtifact(r.Context(), artifactID, req.Content, true); err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memperbarui konten artefak: "+err.Error())
		return
	}

	actionType := store.ActionEditedSummary
	if artifact.Type == store.ArtifactTypeDecision {
		actionType = store.ActionEditedDecision
	}

	_ = h.memoryStore.RecordReviewAction(r.Context(), &store.MemoryReviewAction{
		DraftID:    draftID,
		AdminID:    currentUserID,
		Action:     actionType,
		ArtifactID: artifactID,
		OldContent: oldContent,
		NewContent: req.Content,
	})

	artifact.Content = req.Content
	artifact.IsHumanEdited = true

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"message":  "Konten artefak berhasil diperbarui",
		"artifact": artifact,
	})
}

// handleRemoveJourney menangani DELETE /api/memory/drafts/{draft_id}/journey
func (h *MemoryHandler) handleRemoveJourney(w http.ResponseWriter, r *http.Request, currentUserID, draftID string) {
	draft, err := h.memoryStore.GetDraftByID(r.Context(), draftID)
	if err != nil {
		if errors.Is(err, store.ErrDraftNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Draft memori tidak ditemukan")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memuat draft: "+err.Error())
		return
	}

	isAdmin, err := h.checkAdminRole(draft.GroupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memverifikasi hak akses: "+err.Error())
		return
	}
	if !isAdmin {
		writeMemoryJSONError(w, http.StatusForbidden, "Hanya admin grup yang dapat menghapus Journey Lite")
		return
	}

	if draft.Status != store.DraftStatusDraft {
		writeMemoryJSONError(w, http.StatusBadRequest, "Draft sudah tidak dapat diubah (Status: "+draft.Status+")")
		return
	}

	if err := h.memoryStore.RemoveJourneyLite(r.Context(), draftID); err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal menghapus Journey Lite: "+err.Error())
		return
	}

	_ = h.memoryStore.RecordReviewAction(r.Context(), &store.MemoryReviewAction{
		DraftID: draftID,
		AdminID: currentUserID,
		Action:  store.ActionRemovedJourneyLite,
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Journey Lite berhasil dihapus dari draft memori",
	})
}

// -----------------------------------------------------------------------------
// Member Knowledge Handlers (Bagian 11 & 12 Spec)
// -----------------------------------------------------------------------------

// HandleGetGroupMemories menangani GET /api/groups/{id}/memories
func (h *MemoryHandler) HandleGetGroupMemories(w http.ResponseWriter, r *http.Request, currentUserID, groupID string) {
	// Verifikasi keanggotaan: user harus member dari grup induk
	role, err := h.groupStore.GetUserRoleInGroup(groupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memeriksa keanggotaan: "+err.Error())
		return
	}
	if role == "" {
		writeMemoryJSONError(w, http.StatusForbidden, "Anda bukan anggota grup ini")
		return
	}

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

	memories, err := h.memoryStore.GetApprovedMemoriesByGroupID(r.Context(), groupID, limit, offset)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memuat memori grup: "+err.Error())
		return
	}

	type MemoryListItem struct {
		ID                   string                   `json:"id"`
		ForumID              string                   `json:"forum_id"`
		ForumTitle           string                   `json:"forum_title"`
		GroupID              string                   `json:"group_id"`
		ApprovedBy           string                   `json:"approved_by"`
		ApprovedByName       string                   `json:"approved_by_name"`
		ApprovedAt           string                   `json:"approved_at"`
		HasHumanEdits        bool                     `json:"has_human_edits"`
		SnapshotSummary      string                   `json:"snapshot_summary"`
		SnapshotSummaryConf  string                   `json:"snapshot_summary_conf"`
		DecisionCount        int                      `json:"decision_count"`
		HasJourneyLite       bool                     `json:"has_journey_lite"`
		IsJourneyLiteRemoved bool                     `json:"is_journey_lite_removed"`
	}

	items := make([]MemoryListItem, 0, len(memories))
	for _, m := range memories {
		forumTitle := "Forum Diskusi"
		if details, err := h.groupStore.GetGroupDetails(m.ForumID, ""); err == nil && details != nil && details.Title != "" {
			forumTitle = details.Title
		}

		adminName := "Admin"
		if u, err := h.userStore.GetUserByID(m.ApprovedBy); err == nil && u != nil && u.DisplayName != "" {
			adminName = u.DisplayName
		}

		items = append(items, MemoryListItem{
			ID:                   m.ID,
			ForumID:              m.ForumID,
			ForumTitle:           forumTitle,
			GroupID:              m.GroupID,
			ApprovedBy:           m.ApprovedBy,
			ApprovedByName:       adminName,
			ApprovedAt:           m.ApprovedAt.Format("2006-01-02T15:04:05Z07:00"),
			HasHumanEdits:        m.HasHumanEdits,
			SnapshotSummary:      m.SnapshotSummary,
			SnapshotSummaryConf:  m.SnapshotSummaryConf,
			DecisionCount:        len(m.DecisionsList),
			HasJourneyLite:       m.SnapshotJourneyLite != "" && !m.IsJourneyLiteRemoved,
			IsJourneyLiteRemoved: m.IsJourneyLiteRemoved,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

// handleGetApprovedMemoryDetail menangani GET /api/memories/{memory_id}
func (h *MemoryHandler) handleGetApprovedMemoryDetail(w http.ResponseWriter, r *http.Request, currentUserID, memoryID string) {
	mem, err := h.memoryStore.GetApprovedMemoryByID(r.Context(), memoryID)
	if err != nil {
		if errors.Is(err, store.ErrApprovedMemoryNotFound) {
			writeMemoryJSONError(w, http.StatusNotFound, "Memori tidak ditemukan")
			return
		}
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memuat memori: "+err.Error())
		return
	}

	// Otorisasi: User harus merupakan anggota grup bersangkutan
	role, err := h.groupStore.GetUserRoleInGroup(mem.GroupID, currentUserID)
	if err != nil {
		writeMemoryJSONError(w, http.StatusInternalServerError, "Gagal memverifikasi keanggotaan: "+err.Error())
		return
	}
	if role == "" {
		writeMemoryJSONError(w, http.StatusForbidden, "Anda bukan anggota dari grup memori ini")
		return
	}

	// Catat View Event analitik (Non-blocking)
	viewerRole := store.ViewerRoleMember
	if role == "admin" || role == "creator" {
		viewerRole = store.ViewerRoleAdmin
	}
	go func() {
		_ = h.memoryStore.RecordViewEvent(r.Context(), &store.MemoryViewEvent{
			ApprovedMemoryID: mem.ID,
			ForumID:          mem.ForumID,
			GroupID:          mem.GroupID,
			ViewerID:         currentUserID,
			ViewerRole:       viewerRole,
		})
	}()

	forumTitle := "Forum Diskusi"
	if details, err := h.groupStore.GetGroupDetails(mem.ForumID, ""); err == nil && details != nil && details.Title != "" {
		forumTitle = details.Title
	}

	adminName := "Admin"
	if u, err := h.userStore.GetUserByID(mem.ApprovedBy); err == nil && u != nil && u.DisplayName != "" {
		adminName = u.DisplayName
	}

	response := map[string]interface{}{
		"id":                      mem.ID,
		"draft_id":                mem.DraftID,
		"forum_id":                mem.ForumID,
		"forum_title":             forumTitle,
		"group_id":                mem.GroupID,
		"approved_by":             mem.ApprovedBy,
		"approved_by_name":        adminName,
		"approved_at":             mem.ApprovedAt,
		"has_human_edits":         mem.HasHumanEdits,
		"snapshot_summary":        mem.SnapshotSummary,
		"snapshot_summary_conf":   mem.SnapshotSummaryConf,
		"snapshot_decisions":      mem.DecisionsList,
		"snapshot_journey_lite":   mem.SnapshotJourneyLite,
		"snapshot_journey_conf":   mem.SnapshotJourneyConf,
		"is_journey_lite_removed": mem.IsJourneyLiteRemoved,
		"created_at":              mem.CreatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

// -----------------------------------------------------------------------------
// Helper Authorization
// -----------------------------------------------------------------------------

func (h *MemoryHandler) checkAdminRole(groupID, userID string) (bool, error) {
	role, err := h.groupStore.GetUserRoleInGroup(groupID, userID)
	if err != nil {
		return false, err
	}
	return role == "creator" || role == "admin", nil
}
