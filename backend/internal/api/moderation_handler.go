package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/notify"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

const (
	adminReportsPath = "/api/admin/reports"
	adminUsersPath   = "/api/admin/users/"
	maxModNoteRunes  = 500
)

// ModerationHandler melayani alat moderasi (hanya staf): daftar laporan, detail, keputusan, dan pemulihan akun.
// Pemeriksaan peran SELALU dilakukan di sini; UI hanya kosmetik. Setiap kueri dibatasi tenant dari klaim JWT.
type ModerationHandler struct {
	store      store.ModerationStore
	suspension *authz.SuspensionPolicy
	notifier   NotifyTester
	retention  time.Duration               // masa simpan bukti setelah laporan ditutup (0 = tidak dihapus otomatis)
	onDeleted  func(store.DeletedMessage)  // dipanggil setelah pesan grup dihapus moderator (siaran realtime)
	roles      *authz.RolePolicy           // dibuang cache-nya saat peran diubah lewat alat ini (nil = hanya TTL)
	revoke     func(userID string) error   // mencabut semua token akun (nil = dilewati)
	kick       func(userID, reason string) // memutus semua koneksi WebSocket akun (nil = dilewati)
}

// SetEvidenceRetention memberi tahu halaman detail kapan bukti akan dihapus otomatis (days <= 0 = tidak dihapus).
func (h *ModerationHandler) SetEvidenceRetention(days int) {
	if days > 0 {
		h.retention = time.Duration(days) * 24 * time.Hour
	} else {
		h.retention = 0
	}
}

// SetMessageDeletedHook memasang pemanggil yang menyiarkan penghapusan pesan grup ke anggota ruang yang sedang terbuka.
func (h *ModerationHandler) SetMessageDeletedHook(fn func(store.DeletedMessage)) { h.onDeleted = fn }

// SetRolePolicy memasang kebijakan peran agar perubahan peran langsung berlaku di instans ini.
func (h *ModerationHandler) SetRolePolicy(p *authz.RolePolicy) { h.roles = p }

// NotifyTester menguji saluran pemberitahuan (notify.Dispatcher).
type NotifyTester interface {
	SendTest(ctx context.Context) ([]notify.TestResult, error)
}

// SetNotifier memasang penguji saluran pemberitahuan (nil = endpoint tes menjawab 503).
func (h *ModerationHandler) SetNotifier(n NotifyTester) { h.notifier = n }

func NewModerationHandler(s store.ModerationStore, suspension *authz.SuspensionPolicy) *ModerationHandler {
	return &ModerationHandler{store: s, suspension: suspension}
}

// SetSessionControl memasang pencabut token dan pemutus koneksi yang dipakai saat akun ditangguhkan.
func (h *ModerationHandler) SetSessionControl(revoke func(userID string) error, kick func(userID, reason string)) {
	h.revoke, h.kick = revoke, kick
}

func (h *ModerationHandler) staff(w http.ResponseWriter, r *http.Request) (*auth.UserClaims, bool) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeFeedError(w, http.StatusUnauthorized, "Sesi tidak valid atau telah berakhir")
		return nil, false
	}
	if !store.IsStaff(claims.SystemRole) {
		writeFeedError(w, http.StatusForbidden, "Khusus moderator")
		return nil, false
	}
	return claims, true
}

// HandleReports melayani GET /api/admin/reports.
func (h *ModerationHandler) HandleReports(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.staff(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		return
	}
	q := r.URL.Query()
	status := q.Get("status")
	if status != "" && status != store.ReportStatusOpen && status != store.ReportStatusResolved && status != store.ReportStatusDismissed {
		writeFeedError(w, http.StatusBadRequest, "Status tidak valid")
		return
	}
	if tt := q.Get("target_type"); tt != "" && !validReportTargets[tt] {
		writeFeedError(w, http.StatusBadRequest, "Jenis target tidak valid")
		return
	}
	if rs := q.Get("reason"); rs != "" && !validReportReasons[rs] {
		writeFeedError(w, http.StatusBadRequest, "Alasan tidak valid")
		return
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	list, err := h.store.ListReports(r.Context(), claims.TenantID, store.ReportFilter{
		Status: status, TargetType: q.Get("target_type"), Reason: q.Get("reason"),
	}, limit, offset)
	if err != nil {
		log.Printf("⚠️ [Moderation] gagal memuat laporan: %v", err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memuat laporan")
		return
	}
	// Daftar sengaja ringkas: bukti dan rincian pelapor hanya tampil di halaman detail (minimalkan data).
	for i := range list {
		list[i].Evidence, list[i].Details, list[i].ReporterID = "", "", ""
	}
	writeFeedJSON(w, http.StatusOK, map[string]any{"reports": list})
}

// HandleReportItem melayani GET /api/admin/reports/{id} dan POST /api/admin/reports/{id}/action.
func (h *ModerationHandler) HandleReportItem(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.staff(w, r)
	if !ok {
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, adminReportsPath+"/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) == 0 || parts[0] == "" || len(parts[0]) > 64 {
		writeFeedError(w, http.StatusNotFound, "Tidak ditemukan")
		return
	}
	id := parts[0]

	switch {
	case len(parts) == 1 && r.Method == http.MethodGet:
		d, err := h.store.GetReportDetail(r.Context(), claims.TenantID, id)
		if errors.Is(err, store.ErrReportNotFound) {
			writeFeedError(w, http.StatusNotFound, "Laporan tidak ditemukan")
			return
		}
		if err != nil {
			log.Printf("⚠️ [Moderation] gagal memuat detail %s: %v", id, err)
			writeFeedError(w, http.StatusInternalServerError, "Gagal memuat laporan")
			return
		}
		writeFeedJSON(w, http.StatusOK, h.detailResponse(d))
	case len(parts) == 2 && parts[1] == "action" && r.Method == http.MethodPost:
		h.applyAction(w, r, claims, id)
	default:
		writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
	}
}

func (h *ModerationHandler) applyAction(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, reportID string) {
	var body struct {
		Action string `json:"action"`
		Note   string `json:"note"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil || utf8.RuneCountInString(body.Note) > maxModNoteRunes {
		writeFeedError(w, http.StatusBadRequest, "Payload tidak valid")
		return
	}
	res, err := h.store.ApplyAction(r.Context(), store.ApplyActionInput{
		TenantID: claims.TenantID, ReportID: reportID, ModeratorID: claims.UserID, Action: body.Action, Note: body.Note,
	})
	switch {
	case errors.Is(err, store.ErrReportNotFound):
		writeFeedError(w, http.StatusNotFound, "Laporan tidak ditemukan")
		return
	case errors.Is(err, store.ErrModerationInvalidAction), errors.Is(err, store.ErrModerationNoteRequired):
		writeFeedError(w, http.StatusBadRequest, err.Error())
		return
	case errors.Is(err, store.ErrModerationNotApplicable):
		writeFeedError(w, http.StatusUnprocessableEntity, err.Error())
		return
	case errors.Is(err, store.ErrModerationProtectedUser):
		writeFeedError(w, http.StatusForbidden, err.Error())
		return
	case errors.Is(err, store.ErrModerationEvidencePurged):
		writeFeedError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, store.ErrModerationUserNotFound):
		writeFeedError(w, http.StatusNotFound, err.Error())
		return
	case err != nil:
		log.Printf("⚠️ [Moderation] aksi %s pada %s gagal: %v", body.Action, reportID, err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal menjalankan tindakan")
		return
	}
	log.Printf("🛡️ [Moderation] %s: laporan=%s moderator=%s", body.Action, reportID, claims.UserID)
	if res.SuspendedUser != "" {
		h.enforceSuspension(res.SuspendedUser)
	}
	if res.DeletedMessage != nil && h.onDeleted != nil {
		h.onDeleted(*res.DeletedMessage) // siaran realtime; gagal/ketiadaan hook tidak memengaruhi hasil tindakan
	}
	writeFeedJSON(w, http.StatusOK, map[string]any{"status": "ok", "report_status": res.Report.Status, "content_already_gone": res.ContentGone})
}

// enforceSuspension membuat penangguhan langsung berlaku: cache dibuang, token dicabut, koneksi diputus.
func (h *ModerationHandler) enforceSuspension(userID string) {
	h.suspension.Invalidate(userID)
	if h.revoke != nil {
		if err := h.revoke(userID); err != nil {
			log.Printf("⚠️ [Moderation] gagal mencabut token %s: %v", userID, err)
		}
	}
	if h.kick != nil {
		h.kick(userID, "ACCOUNT_SUSPENDED: Akun Anda ditangguhkan.")
	}
}

// HandleUser melayani POST /api/admin/users/{id}/unsuspend.
func (h *ModerationHandler) HandleUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.staff(w, r)
	if !ok {
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, adminUsersPath), "/"), "/")
	if len(parts) != 2 || parts[0] == "" || len(parts[0]) > 64 || parts[1] != "unsuspend" || r.Method != http.MethodPost {
		writeFeedError(w, http.StatusNotFound, "Tidak ditemukan")
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
	if utf8.RuneCountInString(body.Note) > maxModNoteRunes {
		writeFeedError(w, http.StatusBadRequest, "Catatan terlalu panjang")
		return
	}
	if err := h.store.Unsuspend(r.Context(), claims.TenantID, claims.UserID, parts[0], body.Note); err != nil {
		if errors.Is(err, store.ErrModerationUserNotFound) {
			writeFeedError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
			return
		}
		log.Printf("⚠️ [Moderation] unsuspend %s gagal: %v", parts[0], err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memulihkan akun")
		return
	}
	h.suspension.Invalidate(parts[0])
	log.Printf("🛡️ [Moderation] unsuspend: user=%s moderator=%s", parts[0], claims.UserID)
	writeFeedJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// HandleNotifyTest melayani POST /api/admin/notify/test: mengirim pesan uji ke setiap saluran pemberitahuan dan
// melaporkan hasilnya, supaya token dan chat id bisa diperiksa tanpa menunggu laporan sungguhan.
func (h *ModerationHandler) HandleNotifyTest(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.staff(w, r); !ok {
		return
	}
	if r.Method != http.MethodPost {
		writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		return
	}
	if h.notifier == nil {
		writeFeedError(w, http.StatusServiceUnavailable, "Notifikasi belum dikonfigurasi (MODERATION_NOTIFY)")
		return
	}
	res, err := h.notifier.SendTest(r.Context())
	if errors.Is(err, notify.ErrNoChannels) {
		writeFeedError(w, http.StatusServiceUnavailable, "Notifikasi belum dikonfigurasi (MODERATION_NOTIFY)")
		return
	}
	if err != nil {
		writeFeedError(w, http.StatusInternalServerError, "Gagal menguji notifikasi")
		return
	}
	writeFeedJSON(w, http.StatusOK, map[string]any{"channels": res})
}

// reportDetailResponse menambahkan perkiraan waktu bukti dihapus otomatis ke detail laporan.
type reportDetailResponse struct {
	*store.ReportDetail
	EvidenceExpiresAt *time.Time `json:"evidence_expires_at,omitempty"`
}

// detailResponse menghitung kapan bukti dihapus otomatis: hanya untuk laporan yang sudah ditutup, tidak ditahan,
// belum dibersihkan, dan masih memuat teks. Laporan lama tanpa closed_at memakai waktu pembuatan.
func (h *ModerationHandler) detailResponse(d *store.ReportDetail) reportDetailResponse {
	resp := reportDetailResponse{ReportDetail: d}
	r := d.Report
	if h.retention <= 0 || r.Status == store.ReportStatusOpen || r.EvidenceHold || r.EvidencePurgedAt != nil || (r.Evidence == "" && r.Details == "") {
		return resp
	}
	base := r.CreatedAt
	if r.ClosedAt != nil {
		base = *r.ClosedAt
	}
	at := base.Add(h.retention)
	resp.EvidenceExpiresAt = &at
	return resp
}
