package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Permohonan menjadi Creator (mitra kreator), keputusan pengguna 15 Nov 2026.
//
// Aturan (docs/domains/STARS_WALLET.md aturan 6a):
//   - Permohonan hanya permintaan. Hak membuat grup berbayar tetap diberikan wuzz_admin (paid_group_creators).
//   - Paling banyak satu permohonan "pending" per pengguna (indeks unik parsial).
//   - Mitra aktif tidak bisa mengajukan. Setelah ditolak, pengajuan ulang baru boleh setelah CreatorAppCooldown.
//   - Menyetujui = menjadikan mitra kreator dalam transaksi yang sama.
//   - Pesan dan catatan keputusan adalah data pribadi biasa: dihapus saat akun dihapus (bukan catatan keuangan).

const (
	CreatorAppPending  = "pending"
	CreatorAppApproved = "approved"
	CreatorAppRejected = "rejected"

	// CreatorAppCooldown: jeda pengajuan ulang setelah permohonan ditolak.
	CreatorAppCooldown = 7 * 24 * time.Hour

	creatorAppMessageMin = 10
	creatorAppMessageMax = 500
	creatorAppNoteMax    = 500
	creatorAppListMax    = 200
)

var (
	ErrCreatorAppMessage    = errors.New("ceritakan rencana grup Anda (10-500 karakter)")
	ErrCreatorAppPending    = errors.New("permohonan Anda masih ditinjau")
	ErrAlreadyCreator       = errors.New("akun Anda sudah terdaftar sebagai Creator")
	ErrCreatorAppNotFound   = errors.New("permohonan tidak ditemukan")
	ErrCreatorAppNotPending = errors.New("permohonan ini sudah diputuskan")
	ErrCreatorAppNote       = errors.New("catatan maksimal 500 karakter")
)

// CreatorAppCooldownError: permohonan terakhir ditolak dan jeda pengajuan ulang belum lewat.
type CreatorAppCooldownError struct{ RetryAt time.Time }

func (e *CreatorAppCooldownError) Error() string { return "pengajuan ulang belum bisa dilakukan" }

// CreatorApplication adalah satu permohonan.
type CreatorApplication struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	Username     string     `json:"username,omitempty"`
	DisplayName  string     `json:"display_name,omitempty"`
	Status       string     `json:"status"`
	Message      string     `json:"message"`
	DecisionNote string     `json:"decision_note,omitempty"`
	DecidedBy    string     `json:"decided_by,omitempty"`
	DecidedAt    *time.Time `json:"decided_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// CreatorApplicationState adalah status pendaftaran Creator milik pemanggil (layar Saldo Star).
type CreatorApplicationState struct {
	IsCreator   bool                `json:"is_creator"`
	Application *CreatorApplication `json:"application"`
	CanApply    bool                `json:"can_apply"`
	// RetryAt diisi bila permohonan terakhir ditolak dan jeda pengajuan ulang belum lewat.
	RetryAt *time.Time `json:"retry_at,omitempty"`
}

const creatorAppCols = `a.id, a.user_id, COALESCE(u.username, ''), COALESCE(u.display_name, ''), a.status, a.message,
	a.decision_note, a.decided_by, a.decided_at, a.created_at`

func scanCreatorApp(sc interface{ Scan(...any) error }) (*CreatorApplication, error) {
	var a CreatorApplication
	var decided sql.NullTime
	if err := sc.Scan(&a.ID, &a.UserID, &a.Username, &a.DisplayName, &a.Status, &a.Message, &a.DecisionNote, &a.DecidedBy,
		&decided, &a.CreatedAt); err != nil {
		return nil, err
	}
	if decided.Valid {
		t := decided.Time
		a.DecidedAt = &t
	}
	return &a, nil
}

func (s *StarStore) latestCreatorApp(ctx context.Context, ex starQueryer, userID string) (*CreatorApplication, error) {
	a, err := scanCreatorApp(ex.QueryRowContext(ctx, s.q(`SELECT `+creatorAppCols+` FROM creator_applications a
		LEFT JOIN users u ON u.id = a.user_id WHERE a.tenant_id = ? AND a.user_id = ? ORDER BY a.created_at DESC LIMIT 1`),
		starTenantDefault, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

// creatorAppState menghitung status dari hak mitra dan permohonan terakhir.
func (s *StarStore) creatorAppState(isCreator bool, last *CreatorApplication) *CreatorApplicationState {
	st := &CreatorApplicationState{IsCreator: isCreator, Application: last}
	switch {
	case isCreator:
	case last == nil:
		st.CanApply = true
	case last.Status == CreatorAppPending:
	case last.Status == CreatorAppRejected && last.DecidedAt != nil && s.now().Before(last.DecidedAt.Add(CreatorAppCooldown)):
		t := last.DecidedAt.Add(CreatorAppCooldown)
		st.RetryAt = &t
	default:
		st.CanApply = true // disetujui lalu dicabut, atau jeda penolakan sudah lewat
	}
	return st
}

// CreatorApplicationStatus mengembalikan status pendaftaran Creator pemanggil.
func (s *StarStore) CreatorApplicationStatus(ctx context.Context, tenantID, userID string) (*CreatorApplicationState, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	isCreator, err := s.IsCreator(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	last, err := s.latestCreatorApp(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	return s.creatorAppState(isCreator, last), nil
}

// SubmitCreatorApplication membuat permohonan baru berstatus pending.
func (s *StarStore) SubmitCreatorApplication(ctx context.Context, tenantID, userID, message string) (*CreatorApplicationState, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	message = strings.TrimSpace(message)
	if n := utf8.RuneCountInString(message); n < creatorAppMessageMin || n > creatorAppMessageMax {
		return nil, ErrCreatorAppMessage
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tenant, err := s.invites.userTenant(ctx, userID)
	if err != nil {
		return nil, err
	}
	if tenant != starTenantDefault {
		return nil, ErrStarsTenant
	}
	state, err := s.CreatorApplicationStatus(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	switch {
	case state.IsCreator:
		return nil, ErrAlreadyCreator
	case state.Application != nil && state.Application.Status == CreatorAppPending:
		return nil, ErrCreatorAppPending
	case state.RetryAt != nil:
		return nil, &CreatorAppCooldownError{RetryAt: *state.RetryAt}
	}
	now := s.now()
	_, err = s.db.ExecContext(ctx, s.q(`INSERT INTO creator_applications (id, tenant_id, user_id, status, message, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`), uuid.NewString(), starTenantDefault, userID, CreatorAppPending, message, now, now)
	if err != nil {
		// Dua pengajuan bersamaan: indeks unik parsial menolak yang kedua.
		if isUniqueViolation(err) {
			return nil, ErrCreatorAppPending
		}
		return nil, err
	}
	return s.CreatorApplicationStatus(ctx, tenantID, userID)
}

// ListCreatorApplications mengembalikan permohonan terbaru (status kosong = semua), terlama lebih dulu untuk pending.
func (s *StarStore) ListCreatorApplications(ctx context.Context, tenantID, status string, limit int) ([]CreatorApplication, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > creatorAppListMax {
		limit = creatorAppListMax
	}
	query := `SELECT ` + creatorAppCols + ` FROM creator_applications a LEFT JOIN users u ON u.id = a.user_id WHERE a.tenant_id = ?`
	args := []any{starTenantDefault}
	order := ` ORDER BY a.created_at DESC`
	if status != "" {
		query += ` AND a.status = ?`
		args = append(args, status)
		if status == CreatorAppPending {
			order = ` ORDER BY a.created_at ASC` // antrean: yang paling lama menunggu di atas
		}
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, s.q(query+order+` LIMIT ?`), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CreatorApplication{}
	for rows.Next() {
		a, err := scanCreatorApp(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

// DecideCreatorApplication menyetujui (sekaligus menjadikan mitra kreator) atau menolak permohonan pending.
// note terlihat oleh pemohon.
func (s *StarStore) DecideCreatorApplication(ctx context.Context, tenantID, actorID, appID string, approve bool, note string) (*CreatorApplication, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > creatorAppNoteMax {
		return nil, ErrCreatorAppNote
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var userID, status string
	err = tx.QueryRowContext(ctx, s.q(`SELECT user_id, status FROM creator_applications WHERE id = ? AND tenant_id = ?`),
		appID, starTenantDefault).Scan(&userID, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrCreatorAppNotFound
	}
	if err != nil {
		return nil, err
	}
	if status != CreatorAppPending {
		return nil, ErrCreatorAppNotPending
	}
	newStatus := CreatorAppRejected
	if approve {
		newStatus = CreatorAppApproved
	}
	now := s.now()
	res, err := tx.ExecContext(ctx, s.q(`UPDATE creator_applications SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?,
		updated_at = ? WHERE id = ? AND status = ?`), newStatus, actorID, note, now, now, appID, CreatorAppPending)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrCreatorAppNotPending // diputuskan admin lain di antara pembacaan dan pembaruan
	}
	if approve {
		if err := s.setCreatorTx(ctx, tx, actorID, userID, true, "Disetujui dari permohonan Creator"); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return scanCreatorApp(s.db.QueryRowContext(ctx, s.q(`SELECT `+creatorAppCols+` FROM creator_applications a
		LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?`), appID))
}
