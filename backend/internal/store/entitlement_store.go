package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/entitlement"
	"github.com/google/uuid"
)

var (
	// ErrForumLimitReached dibungkus oleh *ForumLimitError saat user sudah memakai seluruh jatah forum aktif paketnya.
	ErrForumLimitReached = errors.New("batas forum aktif paket tercapai")
	// ErrDurationNotInPlan dikembalikan saat durasi forum yang diminta tidak termasuk paket pembuat.
	ErrDurationNotInPlan = errors.New("durasi forum ini tidak tersedia di paket Anda")
	// ErrMemoryQuotaExceeded dibungkus oleh *MemoryQuotaError saat pembuat forum sudah memakai seluruh kuota ringkasan AI bulan ini.
	ErrMemoryQuotaExceeded = errors.New("kuota AI Memory bulan ini habis")
	// ErrEntitlementInvalid dikembalikan saat paket/masa berlaku yang diberikan admin tidak valid.
	ErrEntitlementInvalid = errors.New("paket atau masa berlaku tidak valid")
	// ErrEntitlementUserNotFound dikembalikan saat akun target tidak ada di tenant tersebut.
	ErrEntitlementUserNotFound = errors.New("pengguna tidak ditemukan")
)

// ForumLimitError membawa detail batas agar klien dapat menampilkan pesan yang tepat.
type ForumLimitError struct {
	Plan   string
	Limit  int
	Active int
}

func (e *ForumLimitError) Error() string { return ErrForumLimitReached.Error() }
func (e *ForumLimitError) Unwrap() error { return ErrForumLimitReached }

// MemoryQuotaError membawa detail kuota AI untuk pesan yang jujur kepada pengguna.
type MemoryQuotaError struct {
	Plan    string
	Limit   int
	Used    int
	ResetAt time.Time
}

func (e *MemoryQuotaError) Error() string { return ErrMemoryQuotaExceeded.Error() }
func (e *MemoryQuotaError) Unwrap() error { return ErrMemoryQuotaExceeded }

// MemoryQuotaChecker memeriksa kuota ringkasan AI sebelum job dibuat (dipasang pada GatedMemoryStore).
type MemoryQuotaChecker interface {
	CheckMemoryJobQuota(ctx context.Context, forumID string) error
}

// Entitlement adalah paket yang tercatat untuk satu user.
type Entitlement struct {
	TenantID   string     `json:"tenant_id"`
	UserID     string     `json:"user_id"`
	Plan       string     `json:"plan"`
	Status     string     `json:"status"`
	ValidUntil *time.Time `json:"valid_until,omitempty"`
	Source     string     `json:"source"`
	GrantedBy  string     `json:"granted_by,omitempty"`
	Note       string     `json:"note,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// EffectivePlan paket yang berlaku saat now (Free bila dicabut atau lewat masa berlaku).
func (e *Entitlement) EffectivePlan(now time.Time) string {
	if e == nil {
		return entitlement.PlanFree
	}
	return entitlement.EffectivePlan(e.Plan, e.Status, e.ValidUntil, now)
}

// SetEntitlementInput memberi/mengubah paket user. ValidUntil nil = tanpa batas waktu.
type SetEntitlementInput struct {
	TenantID   string
	ActorID    string
	UserID     string
	Plan       string
	ValidUntil *time.Time
	Source     string
	Note       string
}

// EntitlementStore mengelola paket pengguna. Pembacaan paket untuk penegakan batas forum dilakukan langsung di
// dalam transaksi pembuatan forum (SQLGroupStore), bukan lewat interface ini.
type EntitlementStore interface {
	// GetEntitlement mengembalikan nil, nil bila user belum punya baris (= Free).
	GetEntitlement(ctx context.Context, tenantID, userID string) (*Entitlement, error)
	// CountActiveForums menghitung forum aktif milik pembuat dengan definisi yang sama dengan penegakan batas.
	CountActiveForums(ctx context.Context, tenantID, userID string) (int, error)
	// CountMemoryJobs menghitung job AI Memory bulan kalender (UTC) berjalan untuk forum buatan user. Job yang gagal
	// permanen tidak dihitung karena tidak menghasilkan ringkasan.
	CountMemoryJobs(ctx context.Context, tenantID, userID string, now time.Time) (int, error)
	SetEntitlement(ctx context.Context, in SetEntitlementInput) (*Entitlement, error)
	RevokeEntitlement(ctx context.Context, tenantID, actorID, userID, note string) error
}

// SQLEntitlementStore implementasi SQL (Postgres/SQLite). Tabel dibuat oleh SQLMessageStore.autoMigrate.
type SQLEntitlementStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLEntitlementStore membuat store memakai koneksi yang sudah ada.
func NewSQLEntitlementStore(db *sql.DB, driverName string) *SQLEntitlementStore {
	return &SQLEntitlementStore{db: db, driverName: driverName}
}

var (
	_ EntitlementStore   = (*SQLEntitlementStore)(nil)
	_ MemoryQuotaChecker = (*SQLEntitlementStore)(nil)
)

// rebindQuery mengubah placeholder ? menjadi $n untuk Postgres.
func rebindQuery(driverName, query string) string {
	if driverName != "postgres" {
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

type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// activeForumCount menghitung forum aktif milik pembuat. Aktif = status active DAN belum lewat expires_at, sehingga
// jeda worker kedaluwarsa (±15 menit) atau tombol akhiri manual tidak menahan user dari membuat forum baru.
func activeForumCount(ctx context.Context, q rowQuerier, driverName, tenantID, userID string, now time.Time) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, rebindQuery(driverName, `
		SELECT COUNT(*) FROM conversations
		WHERE created_by = ? AND COALESCE(tenant_id, 'default') = ?
		  AND parent_id IS NOT NULL AND parent_id <> ''
		  AND (status = 'active' OR status IS NULL)
		  AND (expires_at IS NULL OR expires_at > ?)`),
		userID, tenantID, now).Scan(&n)
	return n, err
}

// readEntitlement membaca baris entitlement (nil bila tidak ada).
func readEntitlement(ctx context.Context, q rowQuerier, driverName, tenantID, userID string) (*Entitlement, error) {
	var (
		e     Entitlement
		valid sql.NullTime
	)
	err := q.QueryRowContext(ctx, rebindQuery(driverName, `
		SELECT tenant_id, user_id, plan, status, valid_until, source, granted_by, note, created_at, updated_at
		FROM user_entitlements WHERE tenant_id = ? AND user_id = ?`), tenantID, userID).
		Scan(&e.TenantID, &e.UserID, &e.Plan, &e.Status, &valid, &e.Source, &e.GrantedBy, &e.Note, &e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if valid.Valid {
		t := valid.Time.UTC()
		e.ValidUntil = &t
	}
	return &e, nil
}

func (s *SQLEntitlementStore) GetEntitlement(ctx context.Context, tenantID, userID string) (*Entitlement, error) {
	return readEntitlement(ctx, s.db, s.driverName, tenantID, userID)
}

func (s *SQLEntitlementStore) CountActiveForums(ctx context.Context, tenantID, userID string) (int, error) {
	return activeForumCount(ctx, s.db, s.driverName, tenantID, userID, time.Now().UTC())
}

func (s *SQLEntitlementStore) CountMemoryJobs(ctx context.Context, tenantID, userID string, now time.Time) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, rebindQuery(s.driverName, `
		SELECT COUNT(*) FROM forum_memory_jobs j
		JOIN conversations c ON c.id = j.forum_id
		WHERE c.created_by = ? AND COALESCE(c.tenant_id, 'default') = ?
		  AND j.created_at >= ? AND j.is_terminal_fail = ?`),
		userID, tenantID, entitlement.PeriodStart(now), false).Scan(&n)
	return n, err
}

// CheckMemoryJobQuota menolak (ErrMemoryQuotaExceeded) bila pembuat forum sudah memakai kuota ringkasan AI bulan ini.
// Kuota dimiliki pembuat forum dan hanya berlaku di tenant default. Forum yang sudah punya job tidak diperiksa
// (INSERT akan ditolak UNIQUE(forum_id) oleh pemanggil). Pengecekan dan INSERT tidak atomik: dua forum milik pembuat
// yang sama yang berakhir bersamaan tepat di ambang kuota dapat melampaui batas satu job; biaya per job terbatas
// sehingga ini diterima demi menghindari penguncian di jalur worker.
func (s *SQLEntitlementStore) CheckMemoryJobQuota(ctx context.Context, forumID string) error {
	var creator, tenantID string
	err := s.db.QueryRowContext(ctx, rebindQuery(s.driverName,
		`SELECT COALESCE(created_by, ''), COALESCE(tenant_id, 'default') FROM conversations WHERE id = ?`), forumID).Scan(&creator, &tenantID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if creator == "" || tenantID != entitlement.DefaultTenant {
		return nil
	}
	var exists int
	err = s.db.QueryRowContext(ctx, rebindQuery(s.driverName, `SELECT 1 FROM forum_memory_jobs WHERE forum_id = ?`), forumID).Scan(&exists)
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	now := time.Now().UTC()
	ent, err := readEntitlement(ctx, s.db, s.driverName, tenantID, creator)
	if err != nil {
		return err
	}
	plan := ent.EffectivePlan(now)
	limit := entitlement.LimitsFor(plan).MonthlyAIJobs
	used, err := s.CountMemoryJobs(ctx, tenantID, creator, now)
	if err != nil {
		return err
	}
	if used >= limit {
		return &MemoryQuotaError{Plan: plan, Limit: limit, Used: used, ResetAt: entitlement.PeriodEnd(now)}
	}
	return nil
}

func (s *SQLEntitlementStore) SetEntitlement(ctx context.Context, in SetEntitlementInput) (*Entitlement, error) {
	plan := strings.ToLower(strings.TrimSpace(in.Plan))
	if !entitlement.IsValidPlan(plan) {
		return nil, ErrEntitlementInvalid
	}
	now := time.Now().UTC()
	if in.ValidUntil != nil && !in.ValidUntil.After(now) {
		return nil, ErrEntitlementInvalid
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = entitlement.SourceManual
	}
	note := strings.TrimSpace(in.Note)
	var validUntil any
	if in.ValidUntil != nil {
		validUntil = in.ValidUntil.UTC()
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var exists int
	err = tx.QueryRowContext(ctx, rebindQuery(s.driverName, `SELECT 1 FROM users WHERE id = ? AND tenant_id = ?`), in.UserID, in.TenantID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrEntitlementUserNotFound
	}
	if err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, rebindQuery(s.driverName, `
		INSERT INTO user_entitlements (tenant_id, user_id, plan, status, valid_until, source, granted_by, note, created_at, updated_at)
		VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
		ON CONFLICT (tenant_id, user_id) DO UPDATE SET
			plan = excluded.plan, status = 'active', valid_until = excluded.valid_until, source = excluded.source,
			granted_by = excluded.granted_by, note = excluded.note, updated_at = excluded.updated_at`),
		in.TenantID, in.UserID, plan, validUntil, source, in.ActorID, note, now, now); err != nil {
		return nil, err
	}
	if err := insertEntitlementEvent(ctx, tx, s.driverName, in.TenantID, in.UserID, in.ActorID, "set", plan, validUntil, source, note, now); err != nil {
		return nil, err
	}
	e, err := readEntitlement(ctx, tx, s.driverName, in.TenantID, in.UserID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return e, nil
}

// RevokeEntitlement mencabut paket (menjadi Free). Tidak menghapus baris agar riwayat tetap terbaca.
// Mencabut user yang belum punya baris adalah no-op yang berhasil.
func (s *SQLEntitlementStore) RevokeEntitlement(ctx context.Context, tenantID, actorID, userID, note string) error {
	now := time.Now().UTC()
	note = strings.TrimSpace(note)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var exists int
	err = tx.QueryRowContext(ctx, rebindQuery(s.driverName, `SELECT 1 FROM users WHERE id = ? AND tenant_id = ?`), userID, tenantID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrEntitlementUserNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, rebindQuery(s.driverName, `
		UPDATE user_entitlements SET status = 'revoked', granted_by = ?, note = ?, updated_at = ?
		WHERE tenant_id = ? AND user_id = ?`), actorID, note, now, tenantID, userID); err != nil {
		return err
	}
	if err := insertEntitlementEvent(ctx, tx, s.driverName, tenantID, userID, actorID, "revoke", "", nil, "", note, now); err != nil {
		return err
	}
	return tx.Commit()
}

func insertEntitlementEvent(ctx context.Context, tx *sql.Tx, driverName, tenantID, userID, actorID, action, plan string, validUntil any, source, note string, now time.Time) error {
	_, err := tx.ExecContext(ctx, rebindQuery(driverName, `
		INSERT INTO entitlement_events (id, tenant_id, user_id, actor_id, action, plan, valid_until, source, note, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
		"ent_"+uuid.NewString(), tenantID, userID, actorID, action, plan, validUntil, source, note, now)
	if err != nil {
		return fmt.Errorf("gagal mencatat riwayat entitlement: %w", err)
	}
	return nil
}
