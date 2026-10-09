package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// Aksi pengelolaan akun oleh staf yang tercatat di moderation_actions.
const (
	ModActionSuspendAccount = "suspend_account" // tangguhkan langsung dari daftar pengguna (tanpa laporan)
	ModActionRevokeSessions = "revoke_sessions"
	ModActionDeleteAccount  = "delete_account"
)

var (
	// ErrModerationAlreadyDeleted: akun sudah dihapus (tombstone), tidak ada lagi yang bisa ditindak.
	ErrModerationAlreadyDeleted = errors.New("akun ini sudah dihapus")
)

const tombstonePrefix = "deleted_"

// UserSummary adalah satu baris di daftar pengguna alat moderasi (data minimal; tanpa kunci, hash, atau isi pesan).
type UserSummary struct {
	ID              string    `json:"id"`
	Username        string    `json:"username"`
	DisplayName     string    `json:"display_name"`
	SystemRole      string    `json:"system_role"`
	Suspended       bool      `json:"suspended"`
	SuspendedReason string    `json:"suspended_reason,omitempty"`
	HasPassword     bool      `json:"has_password"`
	GoogleLinked    bool      `json:"google_linked"`
	Deleted         bool      `json:"deleted"`
	CreatedAt       time.Time `json:"created_at"`
}

// UserDeviceInfo adalah perangkat aktif milik akun (untuk konteks sebelum menindak).
type UserDeviceInfo struct {
	Name       string     `json:"name"`
	Platform   string     `json:"platform"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
}

// UserDetail adalah ringkasan akun untuk halaman detail pengguna.
type UserDetail struct {
	User           UserSummary        `json:"user"`
	ReportsAgainst int                `json:"reports_against"`
	OpenReports    int                `json:"open_reports"`
	ActiveSessions int                `json:"active_sessions"`
	Devices        []UserDeviceInfo   `json:"devices"`
	History        []ModerationAction `json:"history"`
}

// UserFilter menyaring daftar pengguna. Status: "" (semua), "active", "suspended", "deleted".
type UserFilter struct {
	Query  string
	Status string
}

const userSummaryColumns = `u.id, u.username, u.display_name, COALESCE(u.system_role, 'user'), (u.suspended_at IS NOT NULL),
	COALESCE(u.suspended_reason, ''), (COALESCE(u.password_hash, '') <> ''),
	EXISTS (SELECT 1 FROM user_credentials c WHERE c.user_id = u.id AND c.type = 'oauth'), u.created_at`

func scanUserSummary(sc interface{ Scan(...any) error }) (*UserSummary, error) {
	var u UserSummary
	if err := sc.Scan(&u.ID, &u.Username, &u.DisplayName, &u.SystemRole, &u.Suspended, &u.SuspendedReason,
		&u.HasPassword, &u.GoogleLinked, &u.CreatedAt); err != nil {
		return nil, err
	}
	u.Deleted = strings.HasPrefix(u.Username, tombstonePrefix)
	return &u, nil
}

// escapeLike menetralkan karakter khusus LIKE pada masukan pencarian.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

// ListUsers mengembalikan akun pada tenant, terbaru dulu, dengan pencarian username/nama dan penyaring status.
func (s *SQLModerationStore) ListUsers(ctx context.Context, tenantID string, f UserFilter, limit, offset int) ([]UserSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	where := []string{"u.tenant_id = ?"}
	args := []any{tenantID}
	if q := strings.ToLower(strings.TrimSpace(f.Query)); q != "" {
		like := "%" + escapeLike(q) + "%"
		where = append(where, `(LOWER(u.username) LIKE ? ESCAPE '\' OR LOWER(u.display_name) LIKE ? ESCAPE '\')`)
		args = append(args, like, like)
	}
	switch f.Status {
	case "active":
		where = append(where, `u.suspended_at IS NULL AND u.username NOT LIKE ? ESCAPE '\'`)
		args = append(args, escapeLike(tombstonePrefix)+"%")
	case "suspended":
		where = append(where, `u.suspended_at IS NOT NULL`)
	case "deleted":
		where = append(where, `u.username LIKE ? ESCAPE '\'`)
		args = append(args, escapeLike(tombstonePrefix)+"%")
	}
	args = append(args, limit, offset)
	rows, err := s.db.QueryContext(ctx, s.rebind(`SELECT `+userSummaryColumns+` FROM users u WHERE `+strings.Join(where, " AND ")+
		` ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?`), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserSummary{}
	for rows.Next() {
		u, err := scanUserSummary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

// GetUserDetail memuat ringkasan akun, jumlah laporan terhadapnya, perangkat aktif, dan riwayat tindakan staf.
func (s *SQLModerationStore) GetUserDetail(ctx context.Context, tenantID, userID string) (*UserDetail, error) {
	u, err := scanUserSummary(s.db.QueryRowContext(ctx, s.rebind(`SELECT `+userSummaryColumns+` FROM users u WHERE u.id = ? AND u.tenant_id = ?`), userID, tenantID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrModerationUserNotFound
	}
	if err != nil {
		return nil, err
	}
	d := &UserDetail{User: *u, Devices: []UserDeviceInfo{}, History: []ModerationAction{}}

	if err := s.db.QueryRowContext(ctx, s.rebind(`SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0)
		FROM content_reports WHERE tenant_id = ? AND target_user_id = ?`), ReportStatusOpen, tenantID, userID).Scan(&d.ReportsAgainst, &d.OpenReports); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, s.rebind(`SELECT COUNT(*) FROM sessions WHERE user_id = ? AND is_revoked = ? AND expires_at > ?`), userID, false, time.Now().UTC()).Scan(&d.ActiveSessions); err != nil {
		return nil, err
	}

	drows, err := s.db.QueryContext(ctx, s.rebind(`SELECT COALESCE(name, ''), COALESCE(platform, ''), last_seen_at FROM devices
		WHERE user_id = ? AND is_active = ? ORDER BY last_seen_at DESC LIMIT 10`), userID, true)
	if err != nil {
		return nil, err
	}
	defer drows.Close()
	for drows.Next() {
		var dv UserDeviceInfo
		var seen sql.NullTime
		if err := drows.Scan(&dv.Name, &dv.Platform, &seen); err != nil {
			return nil, err
		}
		if seen.Valid {
			t := seen.Time
			dv.LastSeenAt = &t
		}
		d.Devices = append(d.Devices, dv)
	}
	if err := drows.Err(); err != nil {
		return nil, err
	}

	hrows, err := s.db.QueryContext(ctx, s.rebind(`SELECT id, COALESCE(report_id, ''), moderator_id, action, COALESCE(target_type, ''),
		COALESCE(target_id, ''), COALESCE(target_user_id, ''), COALESCE(note, ''), created_at
		FROM moderation_actions WHERE tenant_id = ? AND target_user_id = ? ORDER BY created_at DESC LIMIT 50`), tenantID, userID)
	if err != nil {
		return nil, err
	}
	defer hrows.Close()
	for hrows.Next() {
		var a ModerationAction
		if err := hrows.Scan(&a.ID, &a.ReportID, &a.ModeratorID, &a.Action, &a.TargetType, &a.TargetID, &a.TargetUserID, &a.Note, &a.CreatedAt); err != nil {
			return nil, err
		}
		d.History = append(d.History, a)
	}
	return d, hrows.Err()
}

// guardTarget memeriksa akun sasaran di dalam transaksi: harus ada di tenant, bukan akun sendiri, bukan staf,
// dan belum dihapus. Mengembalikan username untuk konfirmasi.
func (s *SQLModerationStore) guardTarget(ctx context.Context, tx *sql.Tx, tenantID, actorID, userID string) (string, error) {
	if userID == actorID {
		return "", ErrModerationProtectedUser
	}
	var username, role string
	err := tx.QueryRowContext(ctx, s.rebind(`SELECT username, COALESCE(system_role, 'user') FROM users WHERE id = ? AND tenant_id = ?`), userID, tenantID).Scan(&username, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrModerationUserNotFound
	}
	if err != nil {
		return "", err
	}
	if IsStaff(role) {
		return "", ErrModerationProtectedUser
	}
	if strings.HasPrefix(username, tombstonePrefix) {
		return "", ErrModerationAlreadyDeleted
	}
	return username, nil
}

// SuspendUser menangguhkan akun langsung (tanpa laporan) dan mencatat audit. Catatan wajib.
func (s *SQLModerationStore) SuspendUser(ctx context.Context, tenantID, actorID, userID, note string) error {
	note = strings.TrimSpace(note)
	if note == "" {
		return ErrModerationNoteRequired
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := s.guardTarget(ctx, tx, tenantID, actorID, userID); err != nil {
		return err
	}
	reason := note
	if len(reason) > 255 {
		reason = reason[:255]
	}
	if _, err := tx.ExecContext(ctx, s.rebind(`UPDATE users SET suspended_at = ?, suspended_reason = ?, suspended_by = ? WHERE id = ? AND tenant_id = ? AND suspended_at IS NULL`),
		time.Now().UTC(), reason, actorID, userID, tenantID); err != nil {
		return err
	}
	if err := s.audit(ctx, tx, ModerationAction{
		TenantID: tenantID, ModeratorID: actorID, Action: ModActionSuspendAccount,
		TargetType: ReportTargetUser, TargetID: userID, TargetUserID: userID, Note: note,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

// RevokeUserSessions mencabut semua token yang sudah terbit dan menghapus sesi akun (paksa keluar dari semua perangkat).
// Akun tetap bisa masuk lagi dengan kredensialnya. Catatan wajib.
func (s *SQLModerationStore) RevokeUserSessions(ctx context.Context, tenantID, actorID, userID, note string) error {
	note = strings.TrimSpace(note)
	if note == "" {
		return ErrModerationNoteRequired
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := s.guardTarget(ctx, tx, tenantID, actorID, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, s.rebind(`INSERT INTO user_token_revocations (user_id, revoked_before) VALUES (?, ?)
		ON CONFLICT(user_id) DO UPDATE SET revoked_before = excluded.revoked_before`), userID, time.Now().UTC()); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, s.rebind(`DELETE FROM sessions WHERE user_id = ?`), userID); err != nil {
		return err
	}
	if err := s.audit(ctx, tx, ModerationAction{
		TenantID: tenantID, ModeratorID: actorID, Action: ModActionRevokeSessions,
		TargetType: ReportTargetUser, TargetID: userID, TargetUserID: userID, Note: note,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

// PrepareAccountDeletion memeriksa bahwa akun boleh dihapus paksa dan mengembalikan username-nya (untuk konfirmasi
// ketik-ulang). Tidak mengubah apa pun.
func (s *SQLModerationStore) PrepareAccountDeletion(ctx context.Context, tenantID, actorID, userID string) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	return s.guardTarget(ctx, tx, tenantID, actorID, userID)
}

// RecordAccountDeletion mencatat audit penghapusan paksa (dipanggil setelah EraseUser berhasil). Jejak audit
// menyimpan username asli di catatan karena baris users sudah dianonimkan.
func (s *SQLModerationStore) RecordAccountDeletion(ctx context.Context, tenantID, actorID, userID, username, note string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := s.audit(ctx, tx, ModerationAction{
		TenantID: tenantID, ModeratorID: actorID, Action: ModActionDeleteAccount,
		TargetType: ReportTargetUser, TargetID: userID, TargetUserID: userID,
		Note: "[" + username + "] " + strings.TrimSpace(note),
	}); err != nil {
		return err
	}
	return tx.Commit()
}
