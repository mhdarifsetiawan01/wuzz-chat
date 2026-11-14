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

// Star & grup privat berbayar (Wuzz Chat V2 Tahap 2a, docs/plans/backlog/STARS_PAID_GROUPS.md).
//
// Invarian:
//   - star_ledger hanya ditambah (tidak pernah UPDATE/DELETE); koreksi lewat entri baru.
//   - star_wallets.balance = SUM(star_ledger.delta) per pengguna, diperbarui dalam transaksi yang sama, dan tidak pernah
//     negatif: perubahan saldo memakai UPDATE bersyarat "balance + delta >= 0" (atomik di Postgres dan SQLite).
//   - Setiap entri punya idempotency_key unik; mengulang permintaan dengan kunci yang sama tidak memotong saldo dua kali.
//   - Star yang diterima kreator disimpan sebagai uang (creator_earnings), dengan snapshot tarif per baris.
// Star hanya bisa dibelanjakan di aplikasi; tidak ada transfer antarpengguna maupun penarikan (kebijakan Play).

const (
	StarKindPurchase   = "purchase" // Tahap 2b (Play Billing)
	StarKindSpend      = "spend"
	StarKindRefund     = "refund"
	StarKindTestGrant  = "test_grant"
	StarKindAdjustment = "adjustment"

	EarningPending  = "pending"
	EarningReversed = "reversed"
	EarningPaid     = "paid" // Tahap 3

	// Mode tautan undangan grup berbayar (lihat InviteModeApproval).
	InviteModePaid = "paid"

	starTenantDefault  = "default"
	starTestGrantMax   = 10000
	starHistoryLimit   = 50
	starDefaultCurrent = "IDR"
)

var (
	ErrStarsTenant           = errors.New("Star hanya tersedia untuk tenant default")
	ErrInsufficientStars     = errors.New("saldo Star tidak cukup")
	ErrPriceChanged          = errors.New("harga grup berubah")
	ErrNotPaidCreator        = errors.New("akun belum terdaftar sebagai mitra kreator")
	ErrPaidPriceOutOfRange   = errors.New("harga di luar rentang yang diizinkan")
	ErrPaidGroupNotPrivate   = errors.New("grup berbayar harus privat")
	ErrPaidGroupPublic       = errors.New("nonaktifkan grup berbayar sebelum menjadikan grup publik")
	ErrNotGroupCreator       = errors.New("hanya pembuat grup yang dapat mengatur harga")
	ErrStarLedgerNotFound    = errors.New("entri Star tidak ditemukan")
	ErrStarAlreadyRefunded   = errors.New("pembayaran ini sudah dikembalikan")
	ErrEarningAlreadyPaid    = errors.New("Star diterima kreator sudah diselesaikan; refund ditangani manual")
	ErrStarInvalidAmount     = errors.New("jumlah Star tidak valid")
	ErrStarReasonRequired    = errors.New("alasan wajib diisi")
	ErrStarSettingsInvalid   = errors.New("pengaturan Star tidak valid")
	ErrIdempotencyKeyMissing = errors.New("Idempotency-Key wajib diisi")
)

// StarSettings adalah angka yang bisa diubah tanpa deploy (tabel star_settings). Nilai bawaan = angka sementara
// (keputusan pengguna 14 Nov 2026) sampai Tahap 0 selesai.
type StarSettings struct {
	StarValueMinor int64  `json:"star_value_minor"`
	Currency       string `json:"currency"`
	Packages       []int  `json:"packages"`
	GroupPriceMin  int    `json:"group_price_min"`
	GroupPriceMax  int    `json:"group_price_max"`
	StoreFeePct    int    `json:"store_fee_pct"`
	PlatformPct    int    `json:"platform_pct"`
	HoldDays       int    `json:"hold_days"`
}

func DefaultStarSettings() StarSettings {
	return StarSettings{StarValueMinor: 100, Currency: starDefaultCurrent, Packages: []int{50, 100, 500},
		GroupPriceMin: 10, GroupPriceMax: 5000, StoreFeePct: 15, PlatformPct: 20, HoldDays: 14}
}

func (s StarSettings) validate() error {
	if s.StarValueMinor <= 0 || len(s.Currency) != 3 || s.GroupPriceMin < 1 || s.GroupPriceMax < s.GroupPriceMin ||
		s.GroupPriceMax > 1_000_000 || s.StoreFeePct < 0 || s.StoreFeePct > 50 || s.PlatformPct < 0 || s.PlatformPct > 90 ||
		s.HoldDays < 0 || s.HoldDays > 365 || len(s.Packages) == 0 || len(s.Packages) > 10 {
		return ErrStarSettingsInvalid
	}
	for _, p := range s.Packages {
		if p < 1 || p > 1_000_000 {
			return ErrStarSettingsInvalid
		}
	}
	return nil
}

// CreatorShareMinor menghitung bagian kreator dalam satuan minor: harga × nilai Star, dipotong biaya toko lalu bagian
// platform, dibulatkan ke bawah.
func (s StarSettings) CreatorShareMinor(stars int) (gross, share int64) {
	gross = int64(stars) * s.StarValueMinor
	share = gross * int64(100-s.StoreFeePct) * int64(100-s.PlatformPct) / 10000
	return gross, share
}

type StarLedgerEntry struct {
	ID         string    `json:"id"`
	Delta      int       `json:"delta"`
	Kind       string    `json:"kind"`
	GroupID    string    `json:"group_id,omitempty"`
	GroupTitle string    `json:"group_title,omitempty"`
	RefID      string    `json:"ref_id,omitempty"`
	Reason     string    `json:"reason,omitempty"`
	CreatedBy  string    `json:"created_by,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type StarWallet struct {
	Balance int `json:"balance"`
	// Debt: utang Star dari pembelian Play yang dibatalkan (0 bila tidak ada). Selama > 0 belanja Star ditolak.
	Debt    int               `json:"debt"`
	History []StarLedgerEntry `json:"history"`
}

// StarsReceivedGroup merangkum Star yang diterima kreator per grup (UI netral: "Star diterima").
type StarsReceivedGroup struct {
	GroupID        string `json:"group_id"`
	GroupTitle     string `json:"group_title"`
	Purchases      int    `json:"purchases"`
	Stars          int    `json:"stars"`
	PendingStars   int    `json:"pending_stars"`
	AvailableStars int    `json:"available_stars"`
	AmountMinor    int64  `json:"amount_minor"`
	Currency       string `json:"currency"`
}

type PaidGroupInfo struct {
	GroupID    string `json:"group_id"`
	CreatorID  string `json:"creator_id"`
	PriceStars int    `json:"price_stars"`
	Enabled    bool   `json:"enabled"`
}

type PaidCreator struct {
	UserID      string    `json:"user_id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	Status      string    `json:"status"`
	GrantedBy   string    `json:"granted_by"`
	Note        string    `json:"note"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// PurchaseResult adalah hasil pembayaran akses grup.
type PurchaseResult struct {
	GroupID     string `json:"group_id"`
	Status      string `json:"status"` // member
	StarsPaid   int    `json:"stars_paid"`
	Balance     int    `json:"balance"`
	AlreadyPaid bool   `json:"-"`
}

// StarStore menyimpan dompet, buku besar, mitra kreator, dan grup berbayar.
type StarStore struct {
	db         *sql.DB
	driverName string
	invites    *InviteLinkStore
	now        func() time.Time
}

func NewStarStore(db *sql.DB, driverName string, invites *InviteLinkStore) *StarStore {
	return &StarStore{db: db, driverName: driverName, invites: invites, now: func() time.Time { return time.Now().UTC() }}
}

func (s *StarStore) SetClock(now func() time.Time) { s.now = now }

func (s *StarStore) q(query string) string { return rebindQuery(s.driverName, query) }

type starQueryer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func normTenant(t string) string {
	if strings.TrimSpace(t) == "" {
		return starTenantDefault
	}
	return t
}

// RequireStarsTenant: Star hanya untuk tenant default (dipakai handler sebelum memanggil layanan Play).
func RequireStarsTenant(t string) error { return requireDefaultTenant(t) }

func requireDefaultTenant(t string) error {
	if normTenant(t) != starTenantDefault {
		return ErrStarsTenant
	}
	return nil
}

// ── Pengaturan ────────────────────────────────────────────────────────────────

var starSettingKeys = []string{"star_value_minor", "currency", "packages", "group_price_min", "group_price_max", "store_fee_pct", "platform_pct", "hold_days"}

func (s *StarStore) GetSettings(ctx context.Context) (StarSettings, error) {
	return s.settings(ctx, s.db)
}

func (s *StarStore) settings(ctx context.Context, ex interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}) (StarSettings, error) {
	st := DefaultStarSettings()
	rows, err := ex.QueryContext(ctx, s.q(`SELECT setting_key, setting_value FROM star_settings WHERE tenant_id = ?`), starTenantDefault)
	if err != nil {
		return st, err
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return st, err
		}
		n, _ := strconv.ParseInt(v, 10, 64)
		switch k {
		case "star_value_minor":
			st.StarValueMinor = n
		case "currency":
			st.Currency = v
		case "packages":
			var ps []int
			for _, p := range strings.Split(v, ",") {
				if x, err := strconv.Atoi(strings.TrimSpace(p)); err == nil {
					ps = append(ps, x)
				}
			}
			if len(ps) > 0 {
				st.Packages = ps
			}
		case "group_price_min":
			st.GroupPriceMin = int(n)
		case "group_price_max":
			st.GroupPriceMax = int(n)
		case "store_fee_pct":
			st.StoreFeePct = int(n)
		case "platform_pct":
			st.PlatformPct = int(n)
		case "hold_days":
			st.HoldDays = int(n)
		}
	}
	return st, rows.Err()
}

// UpdateSettings menyimpan seluruh pengaturan (staf; peran diperiksa handler). Tidak mengubah baris yang sudah ada.
func (s *StarStore) UpdateSettings(ctx context.Context, actorID string, st StarSettings) error {
	if err := st.validate(); err != nil {
		return err
	}
	pk := make([]string, len(st.Packages))
	for i, p := range st.Packages {
		pk[i] = strconv.Itoa(p)
	}
	vals := map[string]string{
		"star_value_minor": strconv.FormatInt(st.StarValueMinor, 10), "currency": strings.ToUpper(st.Currency),
		"packages": strings.Join(pk, ","), "group_price_min": strconv.Itoa(st.GroupPriceMin),
		"group_price_max": strconv.Itoa(st.GroupPriceMax), "store_fee_pct": strconv.Itoa(st.StoreFeePct),
		"platform_pct": strconv.Itoa(st.PlatformPct), "hold_days": strconv.Itoa(st.HoldDays),
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	for _, k := range starSettingKeys {
		if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO star_settings (tenant_id, setting_key, setting_value, updated_by, updated_at)
			VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value,
			updated_by = excluded.updated_by, updated_at = excluded.updated_at`), starTenantDefault, k, vals[k], actorID, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ── Buku besar & dompet ───────────────────────────────────────────────────────

type ledgerInsert struct {
	tenantID, userID, kind, idemKey, groupID, refID, reason, createdBy string
	delta                                                              int
}

// applyLedger menulis satu entri dan menyesuaikan saldo dalam transaksi tx. Mengembalikan ID entri.
// ErrInsufficientStars bila saldo akan negatif; galat unik (isUniqueViolation) bila kunci idempoten sudah dipakai.
func (s *StarStore) applyLedger(ctx context.Context, tx *sql.Tx, e ledgerInsert, now time.Time) (string, error) {
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO star_wallets (tenant_id, user_id, balance, updated_at) VALUES (?, ?, 0, ?)
		ON CONFLICT (tenant_id, user_id) DO NOTHING`), e.tenantID, e.userID, now); err != nil {
		return "", err
	}
	id := "stl_" + uuid.New().String()
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO star_ledger (id, tenant_id, user_id, delta, kind, idempotency_key, group_id, ref_id, reason, created_by, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`), id, e.tenantID, e.userID, e.delta, e.kind, e.idemKey, e.groupID, e.refID, e.reason, e.createdBy, now); err != nil {
		return "", err
	}
	res, err := tx.ExecContext(ctx, s.q(`UPDATE star_wallets SET balance = balance + ?, updated_at = ?
		WHERE tenant_id = ? AND user_id = ? AND balance + ? >= 0`), e.delta, now, e.tenantID, e.userID, e.delta)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return "", ErrInsufficientStars
	}
	return id, nil
}

func (s *StarStore) balance(ctx context.Context, ex starQueryer, tenantID, userID string) (int, error) {
	var b int
	err := ex.QueryRowContext(ctx, s.q(`SELECT balance FROM star_wallets WHERE tenant_id = ? AND user_id = ?`), tenantID, userID).Scan(&b)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return b, err
}

// Wallet mengembalikan saldo dan riwayat terbaru pengguna.
func (s *StarStore) Wallet(ctx context.Context, tenantID, userID string) (*StarWallet, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	b, err := s.balance(ctx, s.db, starTenantDefault, userID)
	if err != nil {
		return nil, err
	}
	d, err := s.debt(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT l.id, l.delta, l.kind, COALESCE(l.group_id, ''), COALESCE(c.title, ''),
		COALESCE(l.ref_id, ''), COALESCE(l.reason, ''), COALESCE(l.created_by, ''), l.created_at
		FROM star_ledger l LEFT JOIN conversations c ON c.id = l.group_id
		WHERE l.tenant_id = ? AND l.user_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT ?`), starTenantDefault, userID, starHistoryLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	w := &StarWallet{Balance: b, Debt: d, History: []StarLedgerEntry{}}
	for rows.Next() {
		var e StarLedgerEntry
		if err := rows.Scan(&e.ID, &e.Delta, &e.Kind, &e.GroupID, &e.GroupTitle, &e.RefID, &e.Reason, &e.CreatedBy, &e.CreatedAt); err != nil {
			return nil, err
		}
		w.History = append(w.History, e)
	}
	return w, rows.Err()
}

// TestGrant mengkreditkan Star uji (staf; sakelar STARS_TEST_GRANTS diperiksa handler).
func (s *StarStore) TestGrant(ctx context.Context, tenantID, actorID, userID string, stars int, reason, idemKey string) (int, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return 0, err
	}
	if stars < 1 || stars > starTestGrantMax {
		return 0, ErrStarInvalidAmount
	}
	if strings.TrimSpace(reason) == "" {
		return 0, ErrStarReasonRequired
	}
	if strings.TrimSpace(idemKey) == "" {
		return 0, ErrIdempotencyKeyMissing
	}
	if _, err := s.invites.userTenant(ctx, userID); err != nil {
		return 0, err
	}
	return s.adminApply(ctx, ledgerInsert{tenantID: starTenantDefault, userID: userID, kind: StarKindTestGrant,
		idemKey: "test_grant:" + idemKey, reason: strings.TrimSpace(reason), createdBy: actorID, delta: stars})
}

func (s *StarStore) adminApply(ctx context.Context, e ledgerInsert) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := s.applyLedger(ctx, tx, e, s.now()); err != nil {
		if isUniqueViolation(err) {
			// Klik ganda dengan kunci yang sama: tidak ada perubahan kedua.
			_ = tx.Rollback()
			return s.balance(ctx, s.db, e.tenantID, e.userID)
		}
		return 0, err
	}
	b, err := s.balance(ctx, tx, e.tenantID, e.userID)
	if err != nil {
		return 0, err
	}
	return b, tx.Commit()
}

// RefundSpend mengembalikan Star sebuah pembayaran akses grup ke pembelinya dan membalik Star yang diterima kreator
// (bila belum diselesaikan). Keanggotaan tidak diubah. Satu pembayaran hanya bisa dikembalikan sekali.
func (s *StarStore) RefundSpend(ctx context.Context, tenantID, actorID, spendID, reason string) (int, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return 0, err
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return 0, ErrStarReasonRequired
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var userID, kind, groupID string
	var delta int
	err := s.db.QueryRowContext(ctx, s.q(`SELECT user_id, kind, delta, COALESCE(group_id, '') FROM star_ledger WHERE id = ? AND tenant_id = ?`),
		spendID, starTenantDefault).Scan(&userID, &kind, &delta, &groupID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && kind != StarKindSpend) {
		return 0, ErrStarLedgerNotFound
	}
	if err != nil {
		return 0, err
	}
	var earnStatus string
	err = s.db.QueryRowContext(ctx, s.q(`SELECT status FROM creator_earnings WHERE ledger_id = ?`), spendID).Scan(&earnStatus)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	if earnStatus == EarningPaid {
		return 0, ErrEarningAlreadyPaid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	if _, err := s.applyLedger(ctx, tx, ledgerInsert{tenantID: starTenantDefault, userID: userID, kind: StarKindRefund,
		idemKey: "refund:" + spendID, groupID: groupID, refID: spendID, reason: reason, createdBy: actorID, delta: -delta}, now); err != nil {
		if isUniqueViolation(err) {
			return 0, ErrStarAlreadyRefunded
		}
		return 0, err
	}
	res, err := tx.ExecContext(ctx, s.q(`UPDATE creator_earnings SET status = ?, reversed_at = ? WHERE ledger_id = ? AND status = ?`),
		EarningReversed, now, spendID, EarningPending)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n == 0 && earnStatus != "" {
		return 0, ErrEarningAlreadyPaid // berubah di antara pembacaan dan transaksi
	}
	b, err := s.balance(ctx, tx, starTenantDefault, userID)
	if err != nil {
		return 0, err
	}
	return b, tx.Commit()
}

// ── Mitra kreator ─────────────────────────────────────────────────────────────

func (s *StarStore) IsCreator(ctx context.Context, tenantID, userID string) (bool, error) {
	if normTenant(tenantID) != starTenantDefault {
		return false, nil
	}
	var st string
	err := s.db.QueryRowContext(ctx, s.q(`SELECT status FROM paid_group_creators WHERE tenant_id = ? AND user_id = ?`), starTenantDefault, userID).Scan(&st)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return st == "active", err
}

// SetCreator memberi (active=true) atau mencabut hak mitra kreator. Mencabut juga menonaktifkan grup berbayarnya.
func (s *StarStore) SetCreator(ctx context.Context, tenantID, actorID, userID string, active bool, note string) error {
	if err := requireDefaultTenant(tenantID); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tenant, err := s.invites.userTenant(ctx, userID)
	if err != nil {
		return err
	}
	if tenant != starTenantDefault {
		return ErrStarsTenant
	}
	status, granted, revoked := "active", actorID, ""
	if !active {
		status, granted, revoked = "revoked", "", actorID
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO paid_group_creators (tenant_id, user_id, status, granted_by, revoked_by, note, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = excluded.status,
		granted_by = CASE WHEN excluded.status = 'active' THEN excluded.granted_by ELSE paid_group_creators.granted_by END,
		revoked_by = excluded.revoked_by, note = excluded.note, updated_at = excluded.updated_at`),
		starTenantDefault, userID, status, granted, revoked, strings.TrimSpace(note), now, now); err != nil {
		return err
	}
	if !active {
		if _, err := tx.ExecContext(ctx, s.q(`UPDATE paid_groups SET enabled = ?, updated_by = ?, updated_at = ? WHERE creator_id = ? AND enabled = ?`),
			false, actorID, now, userID, true); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *StarStore) ListCreators(ctx context.Context, tenantID string) ([]PaidCreator, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT p.user_id, COALESCE(u.username, ''), COALESCE(u.display_name, ''), p.status,
		p.granted_by, p.note, p.updated_at FROM paid_group_creators p LEFT JOIN users u ON u.id = p.user_id
		WHERE p.tenant_id = ? ORDER BY p.updated_at DESC`), starTenantDefault)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PaidCreator{}
	for rows.Next() {
		var c PaidCreator
		if err := rows.Scan(&c.UserID, &c.Username, &c.DisplayName, &c.Status, &c.GrantedBy, &c.Note, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ── Grup berbayar ─────────────────────────────────────────────────────────────

// activePaidGroup mengembalikan info grup berbayar yang BERLAKU: diaktifkan, dan pembuatnya masih mitra aktif.
// nil = bukan grup berbayar (tautan undangan kembali ke mode approval).
func (s *StarStore) activePaidGroup(ctx context.Context, ex starQueryer, groupID string) (*PaidGroupInfo, error) {
	var p PaidGroupInfo
	var creatorStatus sql.NullString
	err := ex.QueryRowContext(ctx, s.q(`SELECT g.group_id, g.creator_id, g.price_stars, g.enabled, c.status
		FROM paid_groups g LEFT JOIN paid_group_creators c ON c.tenant_id = ? AND c.user_id = g.creator_id
		WHERE g.group_id = ?`), starTenantDefault, groupID).Scan(&p.GroupID, &p.CreatorID, &p.PriceStars, &p.Enabled, &creatorStatus)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !p.Enabled || creatorStatus.String != "active" {
		return nil, nil
	}
	return &p, nil
}

// PaidGroup mengembalikan pengaturan berbayar grup apa adanya (untuk layar kreator), nil bila belum pernah diatur.
func (s *StarStore) PaidGroup(ctx context.Context, groupID string) (*PaidGroupInfo, error) {
	var p PaidGroupInfo
	err := s.db.QueryRowContext(ctx, s.q(`SELECT group_id, creator_id, price_stars, enabled FROM paid_groups WHERE group_id = ?`), groupID).
		Scan(&p.GroupID, &p.CreatorID, &p.PriceStars, &p.Enabled)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &p, err
}

// IsPaidGroup dipakai GroupService untuk menolak menjadikan grup berbayar publik (keputusan K3).
func (s *StarStore) IsPaidGroup(ctx context.Context, groupID string) (bool, error) {
	p, err := s.PaidGroup(ctx, groupID)
	return p != nil && p.Enabled, err
}

// SetGroupPaid mengatur harga dan status berbayar grup. Hanya pembuat grup (role creator) yang juga mitra aktif
// (keputusan K2), grup harus utama dan privat. Bila status berbayar berubah dan ada tautan undangan aktif, tautan
// direset agar mode tautan mengikuti (tautan lama berhenti bekerja).
func (s *StarStore) SetGroupPaid(ctx context.Context, tenantID, actorID, groupID string, price int, enabled bool) (*PaidGroupInfo, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	g, err := s.invites.loadMainGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if g.tenantID != starTenantDefault {
		return nil, ErrStarsTenant
	}
	role, err := s.invites.roleIn(ctx, groupID, actorID)
	if err != nil {
		return nil, err
	}
	if role != "creator" {
		return nil, ErrNotGroupCreator
	}
	if g.isPublic {
		return nil, ErrPaidGroupNotPrivate
	}
	if enabled {
		ok, err := s.IsCreator(ctx, starTenantDefault, actorID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrNotPaidCreator
		}
	}
	st, err := s.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	if price < st.GroupPriceMin || price > st.GroupPriceMax {
		return nil, ErrPaidPriceOutOfRange
	}
	prev, err := s.activePaidGroup(ctx, s.db, groupID)
	if err != nil {
		return nil, err
	}
	now := s.now()
	if _, err := s.db.ExecContext(ctx, s.q(`INSERT INTO paid_groups (group_id, creator_id, price_stars, enabled, updated_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (group_id) DO UPDATE SET creator_id = excluded.creator_id,
		price_stars = excluded.price_stars, enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at`),
		groupID, actorID, price, enabled, actorID, now, now); err != nil {
		return nil, err
	}
	if (prev != nil) != enabled {
		if l, err := s.invites.activeLink(ctx, groupID); err == nil && l != nil {
			if _, err := s.invites.CreateOrReset(ctx, groupID, actorID, true); err != nil {
				return nil, fmt.Errorf("harga tersimpan, tetapi tautan undangan gagal direset: %w", err)
			}
		}
	}
	return &PaidGroupInfo{GroupID: groupID, CreatorID: actorID, PriceStars: price, Enabled: enabled}, nil
}

// PurchaseAccess membayar akses grup berbayar lewat token undangan lalu memasukkan pembeli sebagai anggota, dalam satu
// transaksi. Idempoten per (pengguna, idemKey): mengulang tidak memotong saldo lagi. Sudah anggota = tanpa potongan.
func (s *StarStore) PurchaseAccess(ctx context.Context, token, userID string, expectedPrice int, idemKey string) (*PurchaseResult, error) {
	idemKey = strings.TrimSpace(idemKey)
	if idemKey == "" || len(idemKey) > 100 {
		return nil, ErrIdempotencyKeyMissing
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	g, _, err := s.invites.resolveToken(ctx, token, userID, false)
	if err != nil {
		return nil, err
	}
	if g.tenantID != starTenantDefault {
		return nil, ErrInviteNotFound
	}
	paid, err := s.activePaidGroup(ctx, s.db, g.id)
	if err != nil {
		return nil, err
	}
	if paid == nil {
		return nil, ErrInviteNotFound // bukan (lagi) grup berbayar: klien memuat ulang pratinjau
	}
	if paid.PriceStars != expectedPrice {
		return nil, ErrPriceChanged
	}
	key := "spend:" + userID + ":" + idemKey
	// Utang Star dari pembelian yang dibatalkan Google memblokir belanja sampai lunas (STARS_PLAY_BILLING.md K4).
	if debt, err := s.debt(ctx, s.db, userID); err != nil {
		return nil, err
	} else if debt > 0 {
		return nil, ErrStarsDebt
	}
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	// Keanggotaan disisipkan LEBIH DULU dan menjadi kunci: dua pembayaran bersamaan dari pengguna yang sama ke grup yang
	// sama (kunci idempoten berbeda) tidak bisa sama-sama memotong saldo. Sisipan kedua menunggu baris yang pertama
	// (Postgres) atau terserialisasi (SQLite), lalu tidak menambah baris = sudah anggota, tanpa potongan.
	res, err := tx.ExecContext(ctx, s.q(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
		VALUES (?, ?, 'member', ?) ON CONFLICT (conversation_id, user_id) DO NOTHING`), g.id, userID, now)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_ = tx.Rollback()
		if replay, rerr := s.replayPurchase(ctx, key, userID, g.id); rerr == nil {
			return replay, nil
		}
		b, _ := s.balance(ctx, s.db, starTenantDefault, userID)
		return &PurchaseResult{GroupID: g.id, Status: InviteStatusMember, Balance: b, AlreadyPaid: true}, nil
	}
	ledgerID, err := s.applyLedger(ctx, tx, ledgerInsert{tenantID: starTenantDefault, userID: userID, kind: StarKindSpend,
		idemKey: key, groupID: g.id, createdBy: userID, delta: -paid.PriceStars}, now)
	if isUniqueViolation(err) {
		_ = tx.Rollback()
		return s.replayPurchase(ctx, key, userID, g.id)
	}
	if err != nil {
		return nil, err
	}
	gross, share := settings.CreatorShareMinor(paid.PriceStars)
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO creator_earnings (id, tenant_id, creator_id, group_id, buyer_id, ledger_id, stars,
		gross_minor, amount_minor, currency, star_value_minor, store_fee_pct, platform_pct, status, available_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`), "earn_"+uuid.New().String(), starTenantDefault, paid.CreatorID, g.id,
		userID, ledgerID, paid.PriceStars, gross, share, settings.Currency, settings.StarValueMinor, settings.StoreFeePct,
		settings.PlatformPct, EarningPending, now.Add(time.Duration(settings.HoldDays)*24*time.Hour), now); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO paid_group_access (group_id, user_id, ledger_id, stars_paid, created_at)
		VALUES (?, ?, ?, ?, ?)`), g.id, userID, ledgerID, paid.PriceStars, now); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, s.q(`UPDATE conversations SET updated_at = ? WHERE id = ?`), now, g.id); err != nil {
		return nil, err
	}
	b, err := s.balance(ctx, tx, starTenantDefault, userID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &PurchaseResult{GroupID: g.id, Status: InviteStatusMember, StarsPaid: paid.PriceStars, Balance: b}, nil
}

// replayPurchase menjawab permintaan ulang dengan kunci idempoten yang sudah dipakai: hasil sama, tanpa potongan baru.
func (s *StarStore) replayPurchase(ctx context.Context, key, userID, groupID string) (*PurchaseResult, error) {
	var delta int
	var ledgerGroup string
	err := s.db.QueryRowContext(ctx, s.q(`SELECT delta, COALESCE(group_id, '') FROM star_ledger WHERE idempotency_key = ?`), key).Scan(&delta, &ledgerGroup)
	if err != nil {
		return nil, err
	}
	if ledgerGroup != groupID {
		return nil, ErrIdempotencyKeyMissing // kunci dipakai ulang untuk grup lain: tolak
	}
	b, err := s.balance(ctx, s.db, starTenantDefault, userID)
	if err != nil {
		return nil, err
	}
	return &PurchaseResult{GroupID: groupID, Status: InviteStatusMember, StarsPaid: -delta, Balance: b, AlreadyPaid: true}, nil
}

// StarsReceived merangkum Star yang diterima kreator per grup. Baris pending yang sudah melewati masa tahan dihitung
// sebagai available (tanpa worker).
func (s *StarStore) StarsReceived(ctx context.Context, tenantID, creatorID string) ([]StarsReceivedGroup, error) {
	if err := requireDefaultTenant(tenantID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT e.group_id, COALESCE(c.title, ''), e.stars, e.amount_minor, e.currency, e.status, e.available_at
		FROM creator_earnings e LEFT JOIN conversations c ON c.id = e.group_id
		WHERE e.tenant_id = ? AND e.creator_id = ? AND e.status <> ? ORDER BY e.created_at`), starTenantDefault, creatorID, EarningReversed)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := s.now()
	byGroup := map[string]*StarsReceivedGroup{}
	order := []string{}
	for rows.Next() {
		var gid, title, cur, status string
		var stars int
		var amount int64
		var availableAt time.Time
		if err := rows.Scan(&gid, &title, &stars, &amount, &cur, &status, &availableAt); err != nil {
			return nil, err
		}
		g := byGroup[gid]
		if g == nil {
			g = &StarsReceivedGroup{GroupID: gid, GroupTitle: title, Currency: cur}
			byGroup[gid] = g
			order = append(order, gid)
		}
		g.Purchases++
		g.Stars += stars
		g.AmountMinor += amount
		if status == EarningPending && availableAt.After(now) {
			g.PendingStars += stars
		} else if status == EarningPending {
			g.AvailableStars += stars
		}
	}
	out := make([]StarsReceivedGroup, 0, len(order))
	for _, id := range order {
		out = append(out, *byGroup[id])
	}
	return out, rows.Err()
}

// SumLedger mengembalikan SUM(delta) pengguna; dipakai tes invarian saldo dan rekonsiliasi admin.
func (s *StarStore) SumLedger(ctx context.Context, userID string) (int, error) {
	var sum sql.NullInt64
	err := s.db.QueryRowContext(ctx, s.q(`SELECT SUM(delta) FROM star_ledger WHERE tenant_id = ? AND user_id = ?`), starTenantDefault, userID).Scan(&sum)
	return int(sum.Int64), err
}

// ResolveUserRef mengembalikan ID pengguna tenant default dari ID atau @username (alat admin).
func (s *StarStore) ResolveUserRef(ctx context.Context, ref string) (string, error) {
	ref = strings.TrimPrefix(strings.TrimSpace(ref), "@")
	if ref == "" {
		return "", ErrUserNotFound
	}
	var id string
	err := s.db.QueryRowContext(ctx, s.q(`SELECT id FROM users WHERE (id = ? OR LOWER(username) = LOWER(?)) AND COALESCE(tenant_id, 'default') = ?`),
		ref, ref, starTenantDefault).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrUserNotFound
	}
	return id, err
}
