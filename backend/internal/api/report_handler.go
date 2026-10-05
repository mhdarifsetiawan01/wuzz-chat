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

var (
	validReportTargets = map[string]bool{
		store.ReportTargetMessage: true, store.ReportTargetUser: true, store.ReportTargetPost: true,
		store.ReportTargetComment: true, store.ReportTargetGroup: true,
	}
	validReportReasons = map[string]bool{
		"spam": true, "harassment": true, "hate": true, "sexual": true, "violence": true,
		"illegal": true, "impersonation": true, "other": true,
	}
)

// ReportHandler menangani pelaporan konten/pengguna dan peninjauan oleh moderator.
type ReportHandler struct {
	store store.ReportStore
}

func NewReportHandler(s store.ReportStore) *ReportHandler { return &ReportHandler{store: s} }

func isModerator(role string) bool {
	return role == "wuzz_moderator" || role == "admin" || role == "superadmin"
}

// Handle melayani /api/reports (POST: kirim laporan, GET: daftar untuk moderator).
func (h *ReportHandler) Handle(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeFeedError(w, http.StatusUnauthorized, "Sesi tidak valid atau telah berakhir")
		return
	}
	switch r.Method {
	case http.MethodPost:
		h.create(w, r, claims)
	case http.MethodGet:
		if !isModerator(claims.SystemRole) {
			writeFeedError(w, http.StatusForbidden, "Khusus moderator")
			return
		}
		list, err := h.store.List(r.Context(), claims.TenantID, r.URL.Query().Get("status"), 50)
		if err != nil {
			writeFeedError(w, http.StatusInternalServerError, "Gagal memuat laporan")
			return
		}
		writeFeedJSON(w, http.StatusOK, map[string]any{"reports": list})
	default:
		writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
	}
}

// HandleItem melayani PATCH /api/reports/{id} (moderator menandai selesai/ditolak).
func (h *ReportHandler) HandleItem(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeFeedError(w, http.StatusUnauthorized, "Sesi tidak valid atau telah berakhir")
		return
	}
	if r.Method != http.MethodPatch {
		writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		return
	}
	if !isModerator(claims.SystemRole) {
		writeFeedError(w, http.StatusForbidden, "Khusus moderator")
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/reports/")
	var body struct {
		Status string `json:"status"`
	}
	if id == "" || json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body) != nil ||
		(body.Status != store.ReportStatusResolved && body.Status != store.ReportStatusDismissed && body.Status != store.ReportStatusOpen) {
		writeFeedError(w, http.StatusBadRequest, "Payload tidak valid")
		return
	}
	if err := h.store.SetStatus(r.Context(), claims.TenantID, id, body.Status); err != nil {
		if errors.Is(err, store.ErrReportNotFound) {
			writeFeedError(w, http.StatusNotFound, "Laporan tidak ditemukan")
			return
		}
		writeFeedError(w, http.StatusInternalServerError, "Gagal memperbarui laporan")
		return
	}
	writeFeedJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ReportHandler) create(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	var in struct {
		TargetType   string `json:"target_type"`
		TargetID     string `json:"target_id"`
		TargetUserID string `json:"target_user_id"`
		Reason       string `json:"reason"`
		Details      string `json:"details"`
		Evidence     string `json:"evidence"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&in); err != nil {
		writeFeedError(w, http.StatusBadRequest, "Payload tidak valid")
		return
	}
	in.TargetID = strings.TrimSpace(in.TargetID)
	if !validReportTargets[in.TargetType] || in.TargetID == "" || len(in.TargetID) > 128 || !validReportReasons[in.Reason] {
		writeFeedError(w, http.StatusBadRequest, "Jenis target atau alasan laporan tidak valid")
		return
	}
	if len(in.TargetUserID) > 64 || utf8.RuneCountInString(in.Details) > 500 || utf8.RuneCountInString(in.Evidence) > 2000 {
		writeFeedError(w, http.StatusBadRequest, "Isi laporan terlalu panjang")
		return
	}
	if in.TargetType == store.ReportTargetUser && in.TargetID == claims.UserID {
		writeFeedError(w, http.StatusBadRequest, "Tidak dapat melaporkan diri sendiri")
		return
	}
	rep := &store.ContentReport{
		TenantID: claims.TenantID, ReporterID: claims.UserID, TargetType: in.TargetType, TargetID: in.TargetID,
		TargetUserID: in.TargetUserID, Reason: in.Reason, Details: in.Details, Evidence: in.Evidence,
	}
	if err := h.store.Create(r.Context(), rep); err != nil {
		log.Printf("⚠️ [Report] gagal menyimpan laporan: %v", err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal mengirim laporan")
		return
	}
	log.Printf("🚩 [Report] %s %s dilaporkan (%s) oleh %s", rep.TargetType, rep.TargetID, rep.Reason, rep.ReporterID)
	writeFeedJSON(w, http.StatusCreated, map[string]string{"status": "ok", "message": "Laporan diterima. Terima kasih."})
}
