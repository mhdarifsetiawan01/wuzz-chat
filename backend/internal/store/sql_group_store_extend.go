package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/entitlement"
)

// ExtendResult adalah keadaan forum sesudah masa aktifnya diperpanjang.
type ExtendResult struct {
	ParentID         string     `json:"parent_id"`
	Title            string     `json:"title"`
	ExpiresAt        time.Time  `json:"expires_at"`
	RemainingSeconds int64      `json:"remaining_seconds"`
	ExtendedDays     int        `json:"extended_days"`
	ExtendRemaining  int        `json:"extend_remaining_days"`
	AddedDays        int        `json:"added_days"`
	PreviousExpires  *time.Time `json:"-"`
}

// ExtendSubGroup menambah masa aktif forum aktif sebanyak days hari (1..3), maksimal 30 hari total per forum.
//
// Aturan: hanya pembuat forum (conversations.created_by) dan, di tenant publik saat FORUM_LIMITS_ENABLED menyala, hanya
// paket Pro. Forum yang sudah berakhir (status bukan active atau expires_at lewat) tidak bisa diperpanjang; tidak ada jalur
// aktifkan ulang. Seluruh pemeriksaan dan pembaruan ada dalam satu transaksi; UPDATE bersyarat menjaga batas 30 hari
// walau dua permintaan datang bersamaan.
func (s *SQLGroupStore) ExtendSubGroup(ctx context.Context, parentID, subID, userID string, days int) (*ExtendResult, error) {
	if days < entitlement.ForumExtendMinDays || days > entitlement.ForumExtendMaxDays {
		return nil, ErrExtendDaysInvalid
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("gagal memulai transaksi database: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	lock := ""
	if s.driverName == "postgres" {
		lock = " FOR UPDATE"
	}
	var (
		tenantID, createdBy, status string
		title                       string
		expiresAt                   sql.NullTime
		extended                    int
	)
	err = tx.QueryRowContext(ctx, rebindQuery(s.driverName, `
		SELECT COALESCE(tenant_id, 'default'), COALESCE(created_by, ''), COALESCE(status, 'active'),
		       COALESCE(title, ''), expires_at, COALESCE(extended_days, 0)
		FROM conversations
		WHERE id = ? AND parent_id = ?`+lock), subID, parentID).
		Scan(&tenantID, &createdBy, &status, &title, &expiresAt, &extended)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}
	if createdBy == "" || createdBy != userID {
		return nil, ErrExtendNotCreator
	}

	now := time.Now().UTC()
	if status != "active" || !expiresAt.Valid || !expiresAt.Time.After(now) {
		return nil, ErrExtendForumExpired
	}

	// Batas paket hanya ditegakkan di tenant publik saat sakelar menyala (sama dengan pembuatan forum).
	if s.forumLimits.Load() && tenantID == entitlement.DefaultTenant {
		ent, err := readEntitlement(ctx, tx, s.driverName, tenantID, userID)
		if err != nil {
			return nil, fmt.Errorf("gagal membaca paket pengguna: %w", err)
		}
		if !entitlement.LimitsFor(ent.EffectivePlan(now)).CanExtendForum {
			return nil, ErrExtendProRequired
		}
	}

	if extended+days > entitlement.ForumExtendMaxTotalDays {
		return nil, ErrExtendLimitReached
	}

	prev := expiresAt.Time.UTC()
	next := prev.AddDate(0, 0, days)
	res, err := tx.ExecContext(ctx, rebindQuery(s.driverName, `
		UPDATE conversations
		SET expires_at = ?, extended_days = COALESCE(extended_days, 0) + ?, updated_at = ?
		WHERE id = ? AND status = 'active' AND COALESCE(extended_days, 0) + ? <= ?`),
		next, days, now, subID, days, entitlement.ForumExtendMaxTotalDays)
	if err != nil {
		return nil, fmt.Errorf("gagal memperpanjang forum: %w", err)
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return nil, ErrExtendLimitReached
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("gagal commit perpanjangan forum: %w", err)
	}

	total := extended + days
	return &ExtendResult{
		ParentID:         parentID,
		Title:            title,
		ExpiresAt:        next,
		RemainingSeconds: int64(next.Sub(now).Seconds()),
		ExtendedDays:     total,
		ExtendRemaining:  entitlement.ForumExtendMaxTotalDays - total,
		AddedDays:        days,
		PreviousExpires:  &prev,
	}, nil
}
