package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Aksi moderator yang tercatat di moderation_actions (jejak audit, hanya ditambah, tidak pernah diubah).
const (
	ModActionDismiss       = "dismiss"
	ModActionResolve       = "resolve"
	ModActionDeleteContent = "delete_content"
	ModActionSuspendUser   = "suspend_user"
	ModActionUnsuspendUser = "unsuspend_user"
	ModActionReopen        = "reopen"
)

// Peran staf. Satu-satunya sumber kebenaran untuk "siapa boleh memoderasi" (Linimasa dan laporan memakainya).
const (
	SystemRoleWuzzAdmin     = "wuzz_admin"
	SystemRoleWuzzModerator = "wuzz_moderator"
)

// IsStaff menjawab apakah peran sistem ini boleh memoderasi.
func IsStaff(systemRole string) bool {
	return systemRole == SystemRoleWuzzAdmin || systemRole == SystemRoleWuzzModerator
}

var (
	ErrModerationInvalidAction = errors.New("aksi moderasi tidak valid")
	// ErrModerationNotApplicable: aksi tidak cocok dengan jenis target (mis. hapus konten pada laporan profil).
	ErrModerationNotApplicable = errors.New("aksi tidak berlaku untuk jenis target ini")
	// ErrModerationProtectedUser: staf dan akun sendiri tidak boleh ditangguhkan lewat alat ini.
	ErrModerationProtectedUser = errors.New("akun staf atau akun sendiri tidak boleh ditangguhkan")
	ErrModerationUserNotFound  = errors.New("pengguna tidak ditemukan")
	ErrModerationNoteRequired  = errors.New("catatan wajib untuk hapus konten dan tangguhkan")
)

// ModerationAction adalah satu baris jejak audit.
type ModerationAction struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id,omitempty"`
	ReportID     string    `json:"report_id,omitempty"`
	ModeratorID  string    `json:"moderator_id"`
	Action       string    `json:"action"`
	TargetType   string    `json:"target_type,omitempty"`
	TargetID     string    `json:"target_id,omitempty"`
	TargetUserID string    `json:"target_user_id,omitempty"`
	Note         string    `json:"note,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// ReportFilter menyaring daftar laporan untuk moderator.
type ReportFilter struct {
	Status     string // default "open"
	TargetType string
	Reason     string
}

// ApplyActionInput adalah satu keputusan moderator atas satu laporan.
type ApplyActionInput struct {
	TenantID    string
	ReportID    string
	ModeratorID string
	Action      string
	Note        string
}

// ApplyActionResult memberi tahu pemanggil efek samping yang harus dilakukan di luar transaksi.
type ApplyActionResult struct {
	Report        ContentReport
	SuspendedUser string // diisi bila aksi menangguhkan akun (cabut token dan putus koneksi)
	ContentGone   bool   // konten memang sudah tidak ada (dihapus pemiliknya sebelumnya)
}

// TargetContent adalah isi yang dilaporkan, apa adanya untuk dibaca moderator.
type TargetContent struct {
	// Available=false berarti server tidak boleh/tidak bisa menampilkan isi (DM E2EE, atau konten sudah dihapus).
	Available bool   `json:"available"`
	Note      string `json:"note,omitempty"` // alasan isi tidak tersedia
	AuthorID  string `json:"author_id,omitempty"`
	Text      string `json:"text,omitempty"`
	MediaURLs string `json:"media_urls,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

// ReportDetail adalah laporan beserta konteks untuk memutuskan.
type ReportDetail struct {
	Report  ContentReport      `json:"report"`
	Content TargetContent      `json:"content"`
	Related []ContentReport    `json:"related"` // laporan lain pada target yang sama
	History []ModerationAction `json:"history"`
	// TargetUserSuspended menunjukkan apakah pemilik konten sedang ditangguhkan.
	TargetUserSuspended bool `json:"target_user_suspended"`
}

// ModerationStore menyimpan keputusan moderator dan status penangguhan akun.
type ModerationStore interface {
	// IsSuspended: akun ditangguhkan (tidak ada baris = false).
	IsSuspended(ctx context.Context, userID string) (bool, error)
	ListReports(ctx context.Context, tenantID string, f ReportFilter, limit, offset int) ([]ContentReport, error)
	GetReportDetail(ctx context.Context, tenantID, reportID string) (*ReportDetail, error)
	// ApplyAction menjalankan keputusan dan mencatat audit dalam satu transaksi.
	ApplyAction(ctx context.Context, in ApplyActionInput) (*ApplyActionResult, error)
	// Unsuspend memulihkan akun dan mencatat audit.
	Unsuspend(ctx context.Context, tenantID, moderatorID, userID, note string) error
}

// SQLModerationStore adalah implementasi untuk SQLite & PostgreSQL.
type SQLModerationStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLModerationStore membuat store dan memastikan kolom/tabelnya ada (idempoten).
func NewSQLModerationStore(db *sql.DB, driverName string) (*SQLModerationStore, error) {
	s := &SQLModerationStore{db: db, driverName: driverName}

	for _, col := range []string{
		`suspended_at TIMESTAMP NULL`,
		`suspended_reason VARCHAR(255) NOT NULL DEFAULT ''`,
		`suspended_by VARCHAR(64) NOT NULL DEFAULT ''`,
	} {
		q := `ALTER TABLE users ADD COLUMN ` + col
		if driverName == "postgres" {
			q = `ALTER TABLE users ADD COLUMN IF NOT EXISTS ` + col
		}
		if _, err := db.Exec(q); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			return nil, fmt.Errorf("migrasi kolom penangguhan users gagal: %w", err)
		}
	}
	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS moderation_actions (
			id VARCHAR(64) PRIMARY KEY,
			tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
			report_id VARCHAR(64) NOT NULL DEFAULT '',
			moderator_id VARCHAR(64) NOT NULL,
			action VARCHAR(32) NOT NULL,
			target_type VARCHAR(16) NOT NULL DEFAULT '',
			target_id VARCHAR(128) NOT NULL DEFAULT '',
			target_user_id VARCHAR(64) NOT NULL DEFAULT '',
			note TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_moderation_actions_report ON moderation_actions(tenant_id, report_id, created_at);`,
		`CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_user ON moderation_actions(tenant_id, target_user_id, created_at);`,
	} {
		if _, err := db.Exec(q); err != nil {
			return nil, fmt.Errorf("migrasi moderation_actions gagal: %w", err)
		}
	}
	return s, nil
}

func (s *SQLModerationStore) rebind(query string) string {
	if s.driverName != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// SystemRoleOf membaca peran sistem akun dari database ("user" bila akun tidak ada).
func (s *SQLModerationStore) SystemRoleOf(ctx context.Context, userID string) (string, error) {
	var role string
	err := s.db.QueryRowContext(ctx, s.rebind(`SELECT COALESCE(system_role, 'user') FROM users WHERE id = ?`), userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "user", nil
	}
	return role, err
}

func (s *SQLModerationStore) IsSuspended(ctx context.Context, userID string) (bool, error) {
	var suspended bool
	err := s.db.QueryRowContext(ctx, s.rebind(`SELECT (suspended_at IS NOT NULL) FROM users WHERE id = ?`), userID).Scan(&suspended)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return suspended, err
}

// reportPriorityOrder: keselamatan anak/seksual dan ilegal paling dulu, lalu kekerasan/kebencian, sisanya terbaru.
const reportPriorityOrder = `CASE reason
	WHEN 'sexual' THEN 0 WHEN 'illegal' THEN 0
	WHEN 'violence' THEN 1 WHEN 'hate' THEN 1 WHEN 'harassment' THEN 1
	ELSE 2 END`

func (s *SQLModerationStore) ListReports(ctx context.Context, tenantID string, f ReportFilter, limit, offset int) ([]ContentReport, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	if f.Status == "" {
		f.Status = ReportStatusOpen
	}
	q := `SELECT id, tenant_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, status, created_at
		FROM content_reports WHERE tenant_id = ? AND status = ?`
	args := []any{tenantID, f.Status}
	if f.TargetType != "" {
		q += ` AND target_type = ?`
		args = append(args, f.TargetType)
	}
	if f.Reason != "" {
		q += ` AND reason = ?`
		args = append(args, f.Reason)
	}
	q += ` ORDER BY ` + reportPriorityOrder + `, created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, s.rebind(q), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ContentReport{}
	for rows.Next() {
		var r ContentReport
		if err := rows.Scan(&r.ID, &r.TenantID, &r.ReporterID, &r.TargetType, &r.TargetID, &r.TargetUserID,
			&r.Reason, &r.Details, &r.Evidence, &r.Status, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *SQLModerationStore) getReport(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, tenantID, id string) (*ContentReport, error) {
	var r ContentReport
	err := q.QueryRowContext(ctx, s.rebind(`SELECT id, tenant_id, reporter_id, target_type, target_id, target_user_id,
		reason, details, evidence, status, created_at FROM content_reports WHERE id = ? AND tenant_id = ?`), id, tenantID).
		Scan(&r.ID, &r.TenantID, &r.ReporterID, &r.TargetType, &r.TargetID, &r.TargetUserID, &r.Reason, &r.Details, &r.Evidence, &r.Status, &r.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrReportNotFound
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// ownerOf mencari pemilik konten bila laporan tidak membawa target_user_id.
func (s *SQLModerationStore) ownerOf(ctx context.Context, tenantID string, r *ContentReport) string {
	if r.TargetUserID != "" {
		return r.TargetUserID
	}
	var owner string
	switch r.TargetType {
	case ReportTargetUser:
		return r.TargetID
	case ReportTargetPost:
		_ = s.db.QueryRowContext(ctx, s.rebind(`SELECT user_id FROM feed_posts WHERE id = ? AND tenant_id = ?`), r.TargetID, tenantID).Scan(&owner)
	case ReportTargetComment:
		_ = s.db.QueryRowContext(ctx, s.rebind(`SELECT user_id FROM feed_comments WHERE id = ? AND tenant_id = ?`), r.TargetID, tenantID).Scan(&owner)
	}
	return owner
}

func (s *SQLModerationStore) loadContent(ctx context.Context, tenantID string, r *ContentReport) TargetContent {
	gone := TargetContent{Available: false, Note: "Konten sudah dihapus atau tidak ditemukan. Bukti dari pelapor (jika ada) adalah satu-satunya rujukan."}
	switch r.TargetType {
	case ReportTargetPost:
		var c TargetContent
		var created time.Time
		err := s.db.QueryRowContext(ctx, s.rebind(`SELECT user_id, content, COALESCE(media_urls, ''), created_at FROM feed_posts WHERE id = ? AND tenant_id = ?`),
			r.TargetID, tenantID).Scan(&c.AuthorID, &c.Text, &c.MediaURLs, &created)
		if err != nil {
			return gone
		}
		c.Available, c.CreatedAt = true, created.UTC().Format(time.RFC3339)
		return c
	case ReportTargetComment:
		var c TargetContent
		var created time.Time
		err := s.db.QueryRowContext(ctx, s.rebind(`SELECT user_id, content, created_at FROM feed_comments WHERE id = ? AND tenant_id = ?`),
			r.TargetID, tenantID).Scan(&c.AuthorID, &c.Text, &created)
		if err != nil {
			return gone
		}
		c.Available, c.CreatedAt = true, created.UTC().Format(time.RFC3339)
		return c
	case ReportTargetMessage:
		var c TargetContent
		var created time.Time
		var e2ee sql.NullBool
		var deleted sql.NullBool
		err := s.db.QueryRowContext(ctx, s.rebind(`SELECT m.from_id, m.content, m.created_at, c.is_e2ee, m.is_deleted
			FROM messages m JOIN conversations c ON c.id = m.room_id
			WHERE m.id = ? AND c.tenant_id = ?`), r.TargetID, tenantID).Scan(&c.AuthorID, &c.Text, &created, &e2ee, &deleted)
		if err != nil {
			return gone
		}
		if e2ee.Bool {
			// Pesan terenkripsi ujung ke ujung: server hanya menyimpan sandi. Jangan tampilkan, jangan coba dekripsi.
			return TargetContent{Available: false, AuthorID: c.AuthorID, Note: "Pesan terenkripsi ujung ke ujung: isinya tidak dapat diverifikasi server. Hanya bukti dari pelapor yang tersedia."}
		}
		if deleted.Bool {
			return gone
		}
		c.Available, c.CreatedAt = true, created.UTC().Format(time.RFC3339)
		return c
	case ReportTargetUser:
		var c TargetContent
		var display, bio string
		err := s.db.QueryRowContext(ctx, s.rebind(`SELECT username, COALESCE(display_name, ''), COALESCE(bio, '') FROM users WHERE id = ? AND tenant_id = ?`),
			r.TargetID, tenantID).Scan(&c.AuthorID, &display, &bio)
		if err != nil {
			return gone
		}
		c.Available, c.Text = true, "@"+c.AuthorID+"\n"+display+"\n"+bio
		c.AuthorID = r.TargetID
		return c
	}
	return TargetContent{Available: false, Note: "Jenis target ini belum didukung untuk pratinjau isi."}
}

func (s *SQLModerationStore) GetReportDetail(ctx context.Context, tenantID, reportID string) (*ReportDetail, error) {
	rep, err := s.getReport(ctx, s.db, tenantID, reportID)
	if err != nil {
		return nil, err
	}
	d := &ReportDetail{Report: *rep, Content: s.loadContent(ctx, tenantID, rep), Related: []ContentReport{}, History: []ModerationAction{}}

	rows, err := s.db.QueryContext(ctx, s.rebind(`SELECT id, tenant_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, status, created_at
		FROM content_reports WHERE tenant_id = ? AND target_type = ? AND target_id = ? AND id <> ? ORDER BY created_at DESC LIMIT 20`),
		tenantID, rep.TargetType, rep.TargetID, rep.ID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r ContentReport
		if err := rows.Scan(&r.ID, &r.TenantID, &r.ReporterID, &r.TargetType, &r.TargetID, &r.TargetUserID, &r.Reason, &r.Details, &r.Evidence, &r.Status, &r.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		d.Related = append(d.Related, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	owner := s.ownerOf(ctx, tenantID, rep)
	hrows, err := s.db.QueryContext(ctx, s.rebind(`SELECT id, tenant_id, report_id, moderator_id, action, target_type, target_id, target_user_id, note, created_at
		FROM moderation_actions WHERE tenant_id = ? AND (report_id = ? OR (target_user_id <> '' AND target_user_id = ?)) ORDER BY created_at DESC LIMIT 50`),
		tenantID, rep.ID, owner)
	if err != nil {
		return nil, err
	}
	defer hrows.Close()
	for hrows.Next() {
		var a ModerationAction
		if err := hrows.Scan(&a.ID, &a.TenantID, &a.ReportID, &a.ModeratorID, &a.Action, &a.TargetType, &a.TargetID, &a.TargetUserID, &a.Note, &a.CreatedAt); err != nil {
			return nil, err
		}
		d.History = append(d.History, a)
	}
	if owner != "" {
		d.TargetUserSuspended, _ = s.IsSuspended(ctx, owner)
	}
	return d, hrows.Err()
}

func (s *SQLModerationStore) audit(ctx context.Context, tx *sql.Tx, a ModerationAction) error {
	a.ID = "mod_" + uuid.NewString()
	a.CreatedAt = time.Now().UTC()
	_, err := tx.ExecContext(ctx, s.rebind(`INSERT INTO moderation_actions
		(id, tenant_id, report_id, moderator_id, action, target_type, target_id, target_user_id, note, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?)`),
		a.ID, a.TenantID, a.ReportID, a.ModeratorID, a.Action, a.TargetType, a.TargetID, a.TargetUserID, a.Note, a.CreatedAt)
	return err
}

func (s *SQLModerationStore) ApplyAction(ctx context.Context, in ApplyActionInput) (*ApplyActionResult, error) {
	note := strings.TrimSpace(in.Note)
	switch in.Action {
	case ModActionDismiss, ModActionResolve, ModActionReopen:
	case ModActionDeleteContent, ModActionSuspendUser:
		if note == "" {
			return nil, ErrModerationNoteRequired
		}
	default:
		return nil, ErrModerationInvalidAction
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	rep, err := s.getReport(ctx, tx, in.TenantID, in.ReportID)
	if err != nil {
		return nil, err
	}
	res := &ApplyActionResult{}
	newStatus := ReportStatusResolved
	targetUser := ""

	switch in.Action {
	case ModActionDismiss:
		newStatus = ReportStatusDismissed
	case ModActionReopen:
		newStatus = ReportStatusOpen
	case ModActionResolve:
	case ModActionDeleteContent:
		gone, err := s.deleteContent(ctx, tx, in.TenantID, rep)
		if err != nil {
			return nil, err
		}
		res.ContentGone = gone
		targetUser = rep.TargetUserID
	case ModActionSuspendUser:
		uid := s.ownerOf(ctx, in.TenantID, rep)
		if uid == "" {
			return nil, ErrModerationUserNotFound
		}
		if uid == in.ModeratorID {
			return nil, ErrModerationProtectedUser
		}
		var role string
		err := tx.QueryRowContext(ctx, s.rebind(`SELECT COALESCE(system_role, 'user') FROM users WHERE id = ? AND tenant_id = ?`), uid, in.TenantID).Scan(&role)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrModerationUserNotFound
		}
		if err != nil {
			return nil, err
		}
		if IsStaff(role) {
			return nil, ErrModerationProtectedUser
		}
		reason := note
		if len(reason) > 255 {
			reason = reason[:255]
		}
		if _, err := tx.ExecContext(ctx, s.rebind(`UPDATE users SET suspended_at = ?, suspended_reason = ?, suspended_by = ? WHERE id = ? AND tenant_id = ? AND suspended_at IS NULL`),
			time.Now().UTC(), reason, in.ModeratorID, uid, in.TenantID); err != nil {
			return nil, err
		}
		res.SuspendedUser = uid
		targetUser = uid
	}

	if _, err := tx.ExecContext(ctx, s.rebind(`UPDATE content_reports SET status = ? WHERE id = ? AND tenant_id = ?`), newStatus, rep.ID, in.TenantID); err != nil {
		return nil, err
	}
	if targetUser == "" {
		targetUser = s.ownerOf(ctx, in.TenantID, rep)
	}
	if err := s.audit(ctx, tx, ModerationAction{
		TenantID: in.TenantID, ReportID: rep.ID, ModeratorID: in.ModeratorID, Action: in.Action,
		TargetType: rep.TargetType, TargetID: rep.TargetID, TargetUserID: targetUser, Note: note,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	rep.Status = newStatus
	res.Report = *rep
	return res, nil
}

// deleteContent menghapus konten yang dilaporkan (hanya jenis yang kontennya terbaca server). gone=true bila sudah tidak ada.
func (s *SQLModerationStore) deleteContent(ctx context.Context, tx *sql.Tx, tenantID string, rep *ContentReport) (gone bool, err error) {
	switch rep.TargetType {
	case ReportTargetPost:
		if _, err := tx.ExecContext(ctx, s.rebind(`DELETE FROM feed_likes WHERE post_id = ?`), rep.TargetID); err != nil {
			return false, err
		}
		if _, err := tx.ExecContext(ctx, s.rebind(`DELETE FROM feed_comments WHERE post_id = ? AND tenant_id = ?`), rep.TargetID, tenantID); err != nil {
			return false, err
		}
		r, err := tx.ExecContext(ctx, s.rebind(`DELETE FROM feed_posts WHERE id = ? AND tenant_id = ?`), rep.TargetID, tenantID)
		if err != nil {
			return false, err
		}
		n, _ := r.RowsAffected()
		return n == 0, nil
	case ReportTargetComment:
		var postID string
		err := tx.QueryRowContext(ctx, s.rebind(`SELECT post_id FROM feed_comments WHERE id = ? AND tenant_id = ?`), rep.TargetID, tenantID).Scan(&postID)
		if errors.Is(err, sql.ErrNoRows) {
			return true, nil
		}
		if err != nil {
			return false, err
		}
		if _, err := tx.ExecContext(ctx, s.rebind(`DELETE FROM feed_comments WHERE id = ? AND tenant_id = ?`), rep.TargetID, tenantID); err != nil {
			return false, err
		}
		_, err = tx.ExecContext(ctx, s.rebind(`UPDATE feed_posts SET comments_count = CASE WHEN comments_count > 0 THEN comments_count - 1 ELSE 0 END WHERE id = ? AND tenant_id = ?`), postID, tenantID)
		return false, err
	case ReportTargetMessage:
		// Hanya pesan non-E2EE (grup/forum). Pesan DM terenkripsi tidak bisa dimoderasi isinya; pakai tangguhkan akun.
		var e2ee sql.NullBool
		err := tx.QueryRowContext(ctx, s.rebind(`SELECT c.is_e2ee FROM messages m JOIN conversations c ON c.id = m.room_id WHERE m.id = ? AND c.tenant_id = ?`),
			rep.TargetID, tenantID).Scan(&e2ee)
		if errors.Is(err, sql.ErrNoRows) {
			return true, nil
		}
		if err != nil {
			return false, err
		}
		if e2ee.Bool {
			return false, ErrModerationNotApplicable
		}
		_, err = tx.ExecContext(ctx, s.rebind(`UPDATE messages SET is_deleted = ? WHERE id = ?`), true, rep.TargetID)
		return false, err
	}
	return false, ErrModerationNotApplicable
}

func (s *SQLModerationStore) Unsuspend(ctx context.Context, tenantID, moderatorID, userID, note string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	r, err := tx.ExecContext(ctx, s.rebind(`UPDATE users SET suspended_at = NULL, suspended_reason = '', suspended_by = '' WHERE id = ? AND tenant_id = ?`), userID, tenantID)
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return ErrModerationUserNotFound
	}
	if err := s.audit(ctx, tx, ModerationAction{
		TenantID: tenantID, ModeratorID: moderatorID, Action: ModActionUnsuspendUser,
		TargetType: ReportTargetUser, TargetID: userID, TargetUserID: userID, Note: strings.TrimSpace(note),
	}); err != nil {
		return err
	}
	return tx.Commit()
}
