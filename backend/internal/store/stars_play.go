package store

// Pembelian Star lewat Google Play (V2 Tahap 2b, docs/plans/backlog/STARS_PLAY_BILLING.md).
//
// Invarian tambahan:
//   - Satu token pembelian Play = satu baris play_purchases (PK token_hash) = paling banyak satu kredit dan satu
//     pembalikan. Token milik pengguna lain ditolak.
//   - Pembalikan (voided) mengurangi saldo paling banyak sampai 0; sisanya menjadi utang Star (star_debts). Selama
//     utang > 0 belanja Star ditolak; kredit pembelian berikutnya melunasi utang lebih dulu (entri debt_repay).
//   - Saldo tetap tidak pernah negatif.

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	StarKindReversal  = "reversal"   // pembelian Play dibatalkan/direfund Google
	StarKindDebtRepay = "debt_repay" // pelunasan utang Star dari kredit pembelian

	PlayStateCredited = "credited"
	PlayStateVoided   = "voided"

	playVoidedCursorKey = "play_voided_cursor_ms"
	playProductPrefix   = "star_"
)

var (
	ErrPlayPurchaseOtherUser = errors.New("pembelian ini milik akun lain")
	ErrPlayUnknownProduct    = errors.New("produk Star tidak dikenal")
	ErrStarsDebt             = errors.New("ada utang Star dari pembelian yang dibatalkan")
)

// PlayProductID mengembalikan ID produk Play untuk paket berisi n Star ("star_50"). ID produk permanen di Play Console.
func PlayProductID(stars int) string { return playProductPrefix + strconv.Itoa(stars) }

// PlayProductStars memetakan ID produk ke jumlah Star bila paketnya terdaftar di pengaturan.
func (st StarSettings) PlayProductStars(productID string) (int, bool) {
	if !strings.HasPrefix(productID, playProductPrefix) {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimPrefix(productID, playProductPrefix))
	if err != nil {
		return 0, false
	}
	if slices.Contains(st.Packages, n) {
		return n, true
	}
	return 0, false
}

// PlayPurchase adalah satu pembelian Star lewat Play.
type PlayPurchase struct {
	TokenHash        string     `json:"token_hash"`
	PurchaseToken    string     `json:"-"`
	OrderID          string     `json:"order_id"`
	ProductID        string     `json:"product_id"`
	UserID           string     `json:"user_id"`
	Stars            int        `json:"stars"`
	State            string     `json:"state"`
	Consumed         bool       `json:"consumed"`
	IsTest           bool       `json:"is_test"`
	PurchaseTime     *time.Time `json:"purchase_time,omitempty"`
	LedgerID         string     `json:"ledger_id"`
	ReversalLedgerID string     `json:"reversal_ledger_id,omitempty"`
	VoidedReason     int        `json:"voided_reason"`
	CreatedAt        time.Time  `json:"created_at"`
}

// PlayCreditInput adalah pembelian yang sudah diverifikasi ke Google dan siap dikreditkan.
type PlayCreditInput struct {
	UserID, TokenHash, PurchaseToken, OrderID, ProductID string
	Stars                                                int
	IsTest                                               bool
	PurchaseTime                                         time.Time
}

// PlayCreditResult adalah hasil kredit.
type PlayCreditResult struct {
	Purchase        *PlayPurchase
	StarsAdded      int
	Balance         int
	Debt            int
	AlreadyCredited bool
}

const playPurchaseCols = `token_hash, purchase_token, order_id, product_id, user_id, stars, state, consumed, is_test,
	purchase_time, ledger_id, reversal_ledger_id, voided_reason, created_at`

func scanPlayPurchase(sc interface{ Scan(...any) error }) (*PlayPurchase, error) {
	var p PlayPurchase
	var pt sql.NullTime
	if err := sc.Scan(&p.TokenHash, &p.PurchaseToken, &p.OrderID, &p.ProductID, &p.UserID, &p.Stars, &p.State, &p.Consumed,
		&p.IsTest, &pt, &p.LedgerID, &p.ReversalLedgerID, &p.VoidedReason, &p.CreatedAt); err != nil {
		return nil, err
	}
	if pt.Valid {
		t := pt.Time
		p.PurchaseTime = &t
	}
	return &p, nil
}

// PlayPurchaseByHash mengembalikan pembelian berdasarkan hash token, atau (nil, nil) bila belum ada.
func (s *StarStore) PlayPurchaseByHash(ctx context.Context, tokenHash string) (*PlayPurchase, error) {
	p, err := scanPlayPurchase(s.db.QueryRowContext(ctx, s.q(`SELECT `+playPurchaseCols+` FROM play_purchases WHERE token_hash = ?`), tokenHash))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

func (s *StarStore) debt(ctx context.Context, ex starQueryer, userID string) (int, error) {
	var d int
	err := ex.QueryRowContext(ctx, s.q(`SELECT amount FROM star_debts WHERE tenant_id = ? AND user_id = ?`), starTenantDefault, userID).Scan(&d)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return d, err
}

// Debt mengembalikan utang Star pengguna (0 bila tidak ada).
func (s *StarStore) Debt(ctx context.Context, userID string) (int, error) {
	return s.debt(ctx, s.db, userID)
}

// CreditPlayPurchase mencatat pembelian yang sudah diverifikasi lalu mengkreditkan Star, dalam satu transaksi.
// Idempoten per token: token yang sudah tercatat untuk pengguna yang sama mengembalikan hasil lama tanpa kredit baru.
func (s *StarStore) CreditPlayPurchase(ctx context.Context, in PlayCreditInput) (*PlayCreditResult, error) {
	if in.Stars < 1 || in.TokenHash == "" || in.UserID == "" {
		return nil, ErrStarInvalidAmount
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if existing, err := s.PlayPurchaseByHash(ctx, in.TokenHash); err != nil {
		return nil, err
	} else if existing != nil {
		return s.existingCredit(ctx, existing, in.UserID)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	var pt any
	if !in.PurchaseTime.IsZero() {
		pt = in.PurchaseTime.UTC()
	}
	// Baris pembelian disisipkan lebih dulu: dua permintaan bersamaan dengan token yang sama tidak bisa sama-sama
	// mengkreditkan (PK token_hash).
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO play_purchases (token_hash, purchase_token, order_id, product_id, tenant_id,
		user_id, stars, state, consumed, is_test, purchase_time, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`), in.TokenHash, in.PurchaseToken, in.OrderID, in.ProductID, starTenantDefault,
		in.UserID, in.Stars, PlayStateCredited, false, in.IsTest, pt, now, now); err != nil {
		if isUniqueViolation(err) {
			_ = tx.Rollback()
			existing, rerr := s.PlayPurchaseByHash(ctx, in.TokenHash)
			if rerr != nil || existing == nil {
				return nil, err
			}
			return s.existingCredit(ctx, existing, in.UserID)
		}
		return nil, err
	}
	reason := ""
	if in.IsTest {
		reason = "pembelian uji (penguji lisensi)"
	}
	ledgerID, err := s.applyLedger(ctx, tx, ledgerInsert{tenantID: starTenantDefault, userID: in.UserID, kind: StarKindPurchase,
		idemKey: "purchase:" + in.TokenHash, refID: in.TokenHash, reason: reason, createdBy: in.UserID, delta: in.Stars}, now)
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, s.q(`UPDATE play_purchases SET ledger_id = ? WHERE token_hash = ?`), ledgerID, in.TokenHash); err != nil {
		return nil, err
	}
	// Utang dari pembalikan sebelumnya dilunasi lebih dulu dari kredit ini.
	debt, err := s.debt(ctx, tx, in.UserID)
	if err != nil {
		return nil, err
	}
	if debt > 0 {
		pay := min(debt, in.Stars)
		if _, err := s.applyLedger(ctx, tx, ledgerInsert{tenantID: starTenantDefault, userID: in.UserID, kind: StarKindDebtRepay,
			idemKey: "debt_repay:" + in.TokenHash, refID: in.TokenHash, reason: "pelunasan Star dari pembelian yang dibatalkan",
			createdBy: in.UserID, delta: -pay}, now); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, s.q(`UPDATE star_debts SET amount = amount - ?, updated_at = ? WHERE tenant_id = ? AND user_id = ?`),
			pay, now, starTenantDefault, in.UserID); err != nil {
			return nil, err
		}
		debt -= pay
	}
	b, err := s.balance(ctx, tx, starTenantDefault, in.UserID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	p, err := s.PlayPurchaseByHash(ctx, in.TokenHash)
	if err != nil {
		return nil, err
	}
	return &PlayCreditResult{Purchase: p, StarsAdded: in.Stars, Balance: b, Debt: debt}, nil
}

func (s *StarStore) existingCredit(ctx context.Context, p *PlayPurchase, userID string) (*PlayCreditResult, error) {
	if p.UserID != userID {
		return nil, ErrPlayPurchaseOtherUser
	}
	b, err := s.balance(ctx, s.db, starTenantDefault, userID)
	if err != nil {
		return nil, err
	}
	d, err := s.debt(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	return &PlayCreditResult{Purchase: p, Balance: b, Debt: d, AlreadyCredited: true}, nil
}

// MarkPlayConsumed menandai pembelian sudah dikonsumsi di Google.
func (s *StarStore) MarkPlayConsumed(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, s.q(`UPDATE play_purchases SET consumed = ?, updated_at = ? WHERE token_hash = ?`), true, s.now(), tokenHash)
	return err
}

// PlayConsumePending mengembalikan pembelian yang sudah dikreditkan tetapi belum dikonsumsi (untuk dicoba ulang).
func (s *StarStore) PlayConsumePending(ctx context.Context, limit int) ([]PlayPurchase, error) {
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT `+playPurchaseCols+` FROM play_purchases
		WHERE consumed = ? AND state = ? ORDER BY created_at LIMIT ?`), false, PlayStateCredited, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlayPurchase
	for rows.Next() {
		p, err := scanPlayPurchase(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// VoidPlayPurchase membalik Star sebuah pembelian yang dibatalkan Google. Saldo dikurangi sampai paling rendah 0; sisanya
// menjadi utang. Mengembalikan false bila token tidak dikenal atau sudah dibalik (tidak ada perubahan).
func (s *StarStore) VoidPlayPurchase(ctx context.Context, tokenHash string, voidedReason int) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	p, err := s.PlayPurchaseByHash(ctx, tokenHash)
	if err != nil || p == nil || p.State == PlayStateVoided {
		return false, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	// Klaim baris lebih dulu agar dua putaran worker bersamaan tidak membalik dua kali.
	res, err := tx.ExecContext(ctx, s.q(`UPDATE play_purchases SET state = ?, voided_reason = ?, updated_at = ?
		WHERE token_hash = ? AND state = ?`), PlayStateVoided, voidedReason, now, tokenHash, PlayStateCredited)
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return false, nil
	}
	bal, err := s.balance(ctx, tx, starTenantDefault, p.UserID)
	if err != nil {
		return false, err
	}
	take := min(p.Stars, bal)
	ledgerID, err := s.applyLedger(ctx, tx, ledgerInsert{tenantID: starTenantDefault, userID: p.UserID, kind: StarKindReversal,
		idemKey: "reversal:" + tokenHash, refID: tokenHash, reason: "pembelian Star dibatalkan/direfund Google Play",
		createdBy: "system", delta: -take}, now)
	if err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, s.q(`UPDATE play_purchases SET reversal_ledger_id = ? WHERE token_hash = ?`), ledgerID, tokenHash); err != nil {
		return false, err
	}
	if short := p.Stars - take; short > 0 {
		if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO star_debts (tenant_id, user_id, amount, updated_at) VALUES (?, ?, ?, ?)
			ON CONFLICT (tenant_id, user_id) DO UPDATE SET amount = star_debts.amount + excluded.amount, updated_at = excluded.updated_at`),
			starTenantDefault, p.UserID, short, now); err != nil {
			return false, err
		}
	}
	return true, tx.Commit()
}

// PlayPurchasesForUser mengembalikan pembelian Play terbaru pengguna (alat admin).
func (s *StarStore) PlayPurchasesForUser(ctx context.Context, userID string, limit int) ([]PlayPurchase, error) {
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT `+playPurchaseCols+` FROM play_purchases
		WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?`), starTenantDefault, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PlayPurchase{}
	for rows.Next() {
		p, err := scanPlayPurchase(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// StarDebtor adalah akun dengan utang Star (alat admin).
type StarDebtor struct {
	UserID    string    `json:"user_id"`
	Username  string    `json:"username"`
	Amount    int       `json:"amount"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListDebtors mengembalikan akun dengan utang Star > 0.
func (s *StarStore) ListDebtors(ctx context.Context, limit int) ([]StarDebtor, error) {
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT d.user_id, COALESCE(u.username, ''), d.amount, d.updated_at
		FROM star_debts d LEFT JOIN users u ON u.id = d.user_id
		WHERE d.tenant_id = ? AND d.amount > 0 ORDER BY d.amount DESC LIMIT ?`), starTenantDefault, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StarDebtor{}
	for rows.Next() {
		var d StarDebtor
		if err := rows.Scan(&d.UserID, &d.Username, &d.Amount, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// PlayVoidedCursor mengembalikan batas waktu terakhir pemeriksaan voided (nol bila belum pernah).
func (s *StarStore) PlayVoidedCursor(ctx context.Context) (time.Time, error) {
	var v string
	err := s.db.QueryRowContext(ctx, s.q(`SELECT setting_value FROM star_settings WHERE tenant_id = ? AND setting_key = ?`),
		starTenantDefault, playVoidedCursorKey).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	n, _ := strconv.ParseInt(v, 10, 64)
	if n <= 0 {
		return time.Time{}, nil
	}
	return time.UnixMilli(n).UTC(), nil
}

// SetPlayVoidedCursor menyimpan batas waktu pemeriksaan voided berikutnya.
func (s *StarStore) SetPlayVoidedCursor(ctx context.Context, t time.Time) error {
	_, err := s.db.ExecContext(ctx, s.q(`INSERT INTO star_settings (tenant_id, setting_key, setting_value, updated_by, updated_at)
		VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value,
		updated_at = excluded.updated_at`), starTenantDefault, playVoidedCursorKey, strconv.FormatInt(t.UnixMilli(), 10), "system", s.now())
	return err
}
