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

// Jenis target & status laporan konten pengguna (kebijakan User-Generated Content Google Play).
const (
	ReportTargetMessage = "message"
	ReportTargetUser    = "user"
	ReportTargetPost    = "post"
	ReportTargetComment = "comment"
	ReportTargetGroup   = "group"

	ReportStatusOpen      = "open"
	ReportStatusResolved  = "resolved"
	ReportStatusDismissed = "dismissed"
)

var (
	ErrReportInvalid  = errors.New("laporan tidak valid")
	ErrReportNotFound = errors.New("laporan tidak ditemukan")
)

// ContentReport adalah satu laporan konten/pengguna dari seorang pelapor.
type ContentReport struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id,omitempty"`
	ReporterID   string    `json:"reporter_id"`
	TargetType   string    `json:"target_type"`
	TargetID     string    `json:"target_id"`
	TargetUserID string    `json:"target_user_id,omitempty"`
	Reason       string    `json:"reason"`
	Details      string    `json:"details,omitempty"`
	Evidence     string    `json:"evidence,omitempty"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	// Duplicate diisi Create: true bila pelapor yang sama sudah melaporkan target ini (tidak ada baris baru).
	Duplicate bool `json:"-"`

	// Retensi bukti (diisi hanya oleh GetReportDetail; kosong/false di daftar). ClosedAt adalah waktu laporan terakhir
	// ditutup (selesai/ditolak); EvidenceHold menahan penghapusan otomatis (mis. bukti yang mungkin diteruskan ke pihak
	// berwenang); EvidencePurgedAt adalah waktu bukti dan rincian pelapor dihapus otomatis.
	ClosedAt         *time.Time `json:"closed_at,omitempty"`
	EvidenceHold     bool       `json:"evidence_hold,omitempty"`
	EvidencePurgedAt *time.Time `json:"evidence_purged_at,omitempty"`
}

// ReportStore menyimpan laporan untuk ditinjau moderator.
type ReportStore interface {
	// Create menyimpan laporan. Laporan ganda dari pelapor yang sama untuk target yang sama diabaikan (idempoten).
	Create(ctx context.Context, r *ContentReport) error
	List(ctx context.Context, tenantID, status string, limit int) ([]ContentReport, error)
	SetStatus(ctx context.Context, tenantID, id, status string) error
}

// SQLReportStore adalah implementasi ReportStore untuk SQLite & PostgreSQL.
type SQLReportStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLReportStore membuat store dan memastikan tabelnya ada.
func NewSQLReportStore(db *sql.DB, driverName string) (*SQLReportStore, error) {
	s := &SQLReportStore{db: db, driverName: driverName}
	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS content_reports (
			id VARCHAR(64) PRIMARY KEY,
			tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
			reporter_id VARCHAR(64) NOT NULL,
			target_type VARCHAR(16) NOT NULL,
			target_id VARCHAR(128) NOT NULL,
			target_user_id VARCHAR(64) NOT NULL DEFAULT '',
			reason VARCHAR(32) NOT NULL,
			details TEXT NOT NULL DEFAULT '',
			evidence TEXT NOT NULL DEFAULT '',
			status VARCHAR(16) NOT NULL DEFAULT 'open',
			created_at TIMESTAMP NOT NULL,
			UNIQUE(reporter_id, target_type, target_id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(tenant_id, status, created_at DESC);`,
	} {
		if _, err := db.Exec(q); err != nil {
			return nil, fmt.Errorf("migrasi content_reports gagal: %w", err)
		}
	}
	// Kolom retensi bukti (idempoten; PostgreSQL IF NOT EXISTS, SQLite mengabaikan galat "duplicate column").
	for _, col := range []string{
		`closed_at TIMESTAMP NULL`,
		`evidence_hold BOOLEAN NOT NULL DEFAULT FALSE`,
		`evidence_purged_at TIMESTAMP NULL`,
	} {
		q := `ALTER TABLE content_reports ADD COLUMN ` + col
		if driverName == "postgres" {
			q = `ALTER TABLE content_reports ADD COLUMN IF NOT EXISTS ` + col
		}
		if _, err := db.Exec(q); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			return nil, fmt.Errorf("migrasi kolom retensi content_reports gagal: %w", err)
		}
	}
	return s, nil
}

func (s *SQLReportStore) rebind(query string) string {
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

func (s *SQLReportStore) Create(ctx context.Context, r *ContentReport) error {
	if r.ID == "" {
		r.ID = "rpt_" + uuid.NewString()
	}
	if r.TenantID == "" {
		r.TenantID = "default"
	}
	r.Status = ReportStatusOpen
	r.CreatedAt = time.Now().UTC()
	res, err := s.db.ExecContext(ctx, s.rebind(`INSERT INTO content_reports
		(id, tenant_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, status, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(reporter_id, target_type, target_id) DO NOTHING`),
		r.ID, r.TenantID, r.ReporterID, r.TargetType, r.TargetID, r.TargetUserID, r.Reason, r.Details, r.Evidence, r.Status, r.CreatedAt)
	if err != nil {
		return fmt.Errorf("gagal menyimpan laporan: %w", err)
	}
	n, _ := res.RowsAffected()
	r.Duplicate = n == 0
	return nil
}

// CountForTarget menghitung semua laporan (apa pun statusnya) pada target yang sama dalam satu tenant.
func (s *SQLReportStore) CountForTarget(ctx context.Context, tenantID, targetType, targetID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, s.rebind(`SELECT COUNT(*) FROM content_reports WHERE tenant_id = ? AND target_type = ? AND target_id = ?`),
		tenantID, targetType, targetID).Scan(&n)
	return n, err
}

func (s *SQLReportStore) List(ctx context.Context, tenantID, status string, limit int) ([]ContentReport, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if status == "" {
		status = ReportStatusOpen
	}
	rows, err := s.db.QueryContext(ctx, s.rebind(`SELECT id, tenant_id, reporter_id, target_type, target_id, target_user_id,
		reason, details, evidence, status, created_at FROM content_reports
		WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?`), tenantID, status, limit)
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

func (s *SQLReportStore) SetStatus(ctx context.Context, tenantID, id, status string) error {
	// closed_at mengikuti status: terisi saat ditutup, dikosongkan saat dibuka kembali (dasar jam retensi bukti).
	var closedAt any
	if status != ReportStatusOpen {
		closedAt = time.Now().UTC()
	}
	res, err := s.db.ExecContext(ctx, s.rebind(`UPDATE content_reports SET status = ?, closed_at = ? WHERE id = ? AND tenant_id = ?`), status, closedAt, id, tenantID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrReportNotFound
	}
	return nil
}
