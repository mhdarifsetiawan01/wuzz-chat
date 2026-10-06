package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// Aksi pengelolaan staf yang tercatat di moderation_actions (bersama aksi laporan di moderation_store.go).
const (
	ModActionGrantModerator  = "grant_moderator"
	ModActionRevokeModerator = "revoke_moderator"
)

var (
	// ErrStaffAlreadyStaff: akun sudah berperan staf (tidak diangkat ulang; ubah peran admin hanya lewat SQL).
	ErrStaffAlreadyStaff = errors.New("akun ini sudah berperan staf")
	// ErrStaffNotModerator: pencabutan hanya untuk peran wuzz_moderator. Admin tidak bisa dicabut lewat alat ini.
	ErrStaffNotModerator = errors.New("hanya akun moderator yang bisa dicabut lewat alat ini")
	// ErrStaffSelf: tidak boleh mengubah peran akun sendiri.
	ErrStaffSelf = errors.New("tidak boleh mengubah peran akun sendiri")
	// ErrStaffSuspended: akun yang ditangguhkan tidak boleh diangkat menjadi moderator.
	ErrStaffSuspended = errors.New("akun yang ditangguhkan tidak bisa diangkat menjadi moderator")
)

// StaffMember adalah akun staf (admin/moderator) atau hasil pencarian akun.
type StaffMember struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	SystemRole  string `json:"system_role"`
	Suspended   bool   `json:"suspended"`
	// HasPassword=false berarti akun hanya bisa masuk lewat Google, sehingga belum bisa masuk ke /admin (web).
	HasPassword bool      `json:"has_password"`
	CreatedAt   time.Time `json:"created_at"`
}

const staffColumns = `id, username, display_name, COALESCE(system_role, 'user'), (suspended_at IS NOT NULL),
	(COALESCE(password_hash, '') <> ''), created_at`

func scanStaff(sc interface{ Scan(...any) error }) (*StaffMember, error) {
	var m StaffMember
	if err := sc.Scan(&m.ID, &m.Username, &m.DisplayName, &m.SystemRole, &m.Suspended, &m.HasPassword, &m.CreatedAt); err != nil {
		return nil, err
	}
	return &m, nil
}

// ListStaff mengembalikan semua akun staf pada tenant (admin dulu, lalu moderator, urut nama).
func (s *SQLModerationStore) ListStaff(ctx context.Context, tenantID string) ([]StaffMember, error) {
	rows, err := s.db.QueryContext(ctx, s.rebind(`SELECT `+staffColumns+` FROM users
		WHERE tenant_id = ? AND system_role IN (?, ?)
		ORDER BY CASE system_role WHEN ? THEN 0 ELSE 1 END, LOWER(username)`),
		tenantID, SystemRoleWuzzAdmin, SystemRoleWuzzModerator, SystemRoleWuzzAdmin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StaffMember{}
	for rows.Next() {
		m, err := scanStaff(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

// LookupUser mencari satu akun berdasarkan username persis (tanpa membedakan huruf besar/kecil) pada tenant ini.
func (s *SQLModerationStore) LookupUser(ctx context.Context, tenantID, username string) (*StaffMember, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, ErrModerationUserNotFound
	}
	m, err := scanStaff(s.db.QueryRowContext(ctx, s.rebind(`SELECT `+staffColumns+` FROM users WHERE tenant_id = ? AND LOWER(username) = LOWER(?)`), tenantID, username))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrModerationUserNotFound
	}
	return m, err
}

func (s *SQLModerationStore) lockStaffRow(ctx context.Context, tx *sql.Tx, tenantID, userID string) (*StaffMember, error) {
	m, err := scanStaff(tx.QueryRowContext(ctx, s.rebind(`SELECT `+staffColumns+` FROM users WHERE id = ? AND tenant_id = ?`), userID, tenantID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrModerationUserNotFound
	}
	return m, err
}

// GrantModerator mengangkat akun berperan "user" menjadi wuzz_moderator dan mencatat audit, dalam satu transaksi.
// Peran admin tidak bisa diberikan lewat alat ini (hanya SQL), agar eskalasi hak tidak terjadi lewat antarmuka.
func (s *SQLModerationStore) GrantModerator(ctx context.Context, tenantID, actorID, userID, note string) (*StaffMember, error) {
	if userID == actorID {
		return nil, ErrStaffSelf
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	m, err := s.lockStaffRow(ctx, tx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	if IsStaff(m.SystemRole) {
		return nil, ErrStaffAlreadyStaff
	}
	if m.Suspended {
		return nil, ErrStaffSuspended
	}
	// Syarat system_role = 'user' pada UPDATE menjaga dari perubahan peran bersamaan.
	r, err := tx.ExecContext(ctx, s.rebind(`UPDATE users SET system_role = ? WHERE id = ? AND tenant_id = ? AND COALESCE(system_role, 'user') = 'user'`),
		SystemRoleWuzzModerator, userID, tenantID)
	if err != nil {
		return nil, err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return nil, ErrStaffAlreadyStaff
	}
	if err := s.audit(ctx, tx, ModerationAction{
		TenantID: tenantID, ModeratorID: actorID, Action: ModActionGrantModerator,
		TargetType: ReportTargetUser, TargetID: userID, TargetUserID: userID, Note: strings.TrimSpace(note),
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	m.SystemRole = SystemRoleWuzzModerator
	return m, nil
}

// RevokeModerator mengembalikan wuzz_moderator menjadi "user" dan mencatat audit. Admin dan akun sendiri dilindungi.
func (s *SQLModerationStore) RevokeModerator(ctx context.Context, tenantID, actorID, userID, note string) (*StaffMember, error) {
	if userID == actorID {
		return nil, ErrStaffSelf
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	m, err := s.lockStaffRow(ctx, tx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	if m.SystemRole != SystemRoleWuzzModerator {
		return nil, ErrStaffNotModerator
	}
	r, err := tx.ExecContext(ctx, s.rebind(`UPDATE users SET system_role = 'user' WHERE id = ? AND tenant_id = ? AND system_role = ?`),
		userID, tenantID, SystemRoleWuzzModerator)
	if err != nil {
		return nil, err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return nil, ErrStaffNotModerator
	}
	if err := s.audit(ctx, tx, ModerationAction{
		TenantID: tenantID, ModeratorID: actorID, Action: ModActionRevokeModerator,
		TargetType: ReportTargetUser, TargetID: userID, TargetUserID: userID, Note: strings.TrimSpace(note),
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	m.SystemRole = "user"
	return m, nil
}

// IsAdmin menjawab apakah peran sistem ini boleh mengelola staf (hanya wuzz_admin).
func IsAdmin(systemRole string) bool { return systemRole == SystemRoleWuzzAdmin }
