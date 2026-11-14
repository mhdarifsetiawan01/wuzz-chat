package playbilling

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Galat verifikasi yang dipetakan handler ke kode HTTP.
var (
	ErrInvalidToken    = errors.New("token pembelian tidak valid")
	ErrAccountMismatch = errors.New("pembelian tidak terikat ke akun ini")
	ErrCancelled       = errors.New("pembelian dibatalkan")
	ErrProductMismatch = errors.New("produk pembelian tidak cocok")
)

const (
	maxTokenLen     = 4096
	voidedLookback  = 30 * 24 * time.Hour // batas Google untuk startTime
	voidedOverlap   = time.Hour           // tumpang tindih antar-putaran; pembalikan idempoten
	consumeBatch    = 50
	maxVoidedPages  = 20
	ResultCredited  = "credited"
	ResultPending   = "pending"
	ResultCancelled = "cancelled"
)

// Store adalah operasi penyimpanan yang dipakai Service (diimplementasikan *store.StarStore).
type Store interface {
	GetSettings(ctx context.Context) (store.StarSettings, error)
	PlayPurchaseByHash(ctx context.Context, tokenHash string) (*store.PlayPurchase, error)
	CreditPlayPurchase(ctx context.Context, in store.PlayCreditInput) (*store.PlayCreditResult, error)
	MarkPlayConsumed(ctx context.Context, tokenHash string) error
	PlayConsumePending(ctx context.Context, limit int) ([]store.PlayPurchase, error)
	VoidPlayPurchase(ctx context.Context, tokenHash string, voidedReason int) (bool, error)
	PlayVoidedCursor(ctx context.Context) (time.Time, error)
	SetPlayVoidedCursor(ctx context.Context, t time.Time) error
	Debt(ctx context.Context, userID string) (int, error)
}

// Service memverifikasi pembelian Star ke Google Play, mengkreditkan, dan menyapu konsumsi/voided.
type Service struct {
	api   API
	store Store
	now   func() time.Time
}

func NewService(api API, st Store) *Service {
	return &Service{api: api, store: st, now: time.Now}
}

// SetClock dipakai tes.
func (s *Service) SetClock(now func() time.Time) { s.now = now }

// AccountHash adalah nilai obfuscatedAccountId yang wajib dipasang aplikasi saat membeli: SHA-256 heksadesimal dari ID
// pengguna Wuzz (64 karakter, batas Google). Tidak membocorkan ID asli ke Google.
func AccountHash(userID string) string {
	sum := sha256.Sum256([]byte(userID))
	return hex.EncodeToString(sum[:])
}

// TokenHash adalah kunci penyimpanan token pembelian (token mentah bisa lebih panjang dari kolom kunci).
func TokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Package adalah paket Star yang dijual.
type Package struct {
	ProductID string `json:"product_id"`
	Stars     int    `json:"stars"`
}

// Packages mengembalikan daftar paket dari pengaturan Star.
func (s *Service) Packages(ctx context.Context) ([]Package, error) {
	st, err := s.store.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Package, 0, len(st.Packages))
	for _, n := range st.Packages {
		out = append(out, Package{ProductID: store.PlayProductID(n), Stars: n})
	}
	return out, nil
}

// VerifyResult adalah hasil POST pembelian.
type VerifyResult struct {
	State      string `json:"state"` // credited | pending
	StarsAdded int    `json:"stars_added"`
	Balance    int    `json:"balance"`
	Debt       int    `json:"debt"`
}

// VerifyAndCredit memeriksa pembelian ke Google lalu mengkreditkan Star ke userID. Idempoten per token.
func (s *Service) VerifyAndCredit(ctx context.Context, userID, productID, token string) (*VerifyResult, error) {
	token = strings.TrimSpace(token)
	if token == "" || len(token) > maxTokenLen {
		return nil, ErrInvalidToken
	}
	st, err := s.store.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	starsPerUnit, ok := st.PlayProductStars(productID)
	if !ok {
		return nil, store.ErrPlayUnknownProduct
	}
	hash := TokenHash(token)

	// Sudah tercatat: jawab tanpa memanggil Google (permintaan ulang setelah timeout / pemulihan saat aplikasi dibuka).
	if existing, err := s.store.PlayPurchaseByHash(ctx, hash); err != nil {
		return nil, err
	} else if existing != nil {
		if existing.UserID != userID {
			return nil, store.ErrPlayPurchaseOtherUser
		}
		if existing.State == store.PlayStateVoided {
			return nil, ErrCancelled
		}
		if existing.ProductID != productID {
			return nil, ErrProductMismatch
		}
		res, err := s.store.CreditPlayPurchase(ctx, store.PlayCreditInput{UserID: userID, TokenHash: hash, Stars: existing.Stars})
		if err != nil {
			return nil, err
		}
		if !existing.Consumed && existing.State == store.PlayStateCredited {
			s.consume(ctx, existing.ProductID, token, hash)
		}
		return &VerifyResult{State: ResultCredited, Balance: res.Balance, Debt: res.Debt}, nil
	}

	p, err := s.api.GetProductPurchase(ctx, token)
	if errors.Is(err, ErrPurchaseNotFound) {
		return nil, ErrInvalidToken
	}
	if err != nil {
		return nil, err
	}
	var item *LineItem
	for i := range p.LineItems {
		if p.LineItems[i].ProductID == productID {
			item = &p.LineItems[i]
			break
		}
	}
	if item == nil || len(p.LineItems) != 1 {
		return nil, ErrProductMismatch
	}
	switch p.State {
	case StatePurchased:
	case StatePending:
		debt, _ := s.store.Debt(ctx, userID)
		return &VerifyResult{State: ResultPending, Debt: debt}, nil
	case StateCancelled:
		return nil, ErrCancelled
	default:
		return nil, ErrCancelled
	}
	if p.ObfuscatedAccountID == "" || p.ObfuscatedAccountID != AccountHash(userID) {
		return nil, ErrAccountMismatch
	}
	res, err := s.store.CreditPlayPurchase(ctx, store.PlayCreditInput{
		UserID: userID, TokenHash: hash, PurchaseToken: token, OrderID: p.OrderID, ProductID: productID,
		Stars: starsPerUnit * item.Quantity, IsTest: p.IsTest, PurchaseTime: p.PurchaseCompletedAt,
	})
	if err != nil {
		return nil, err
	}
	if item.ConsumptionState == ConsumptionConsumed {
		_ = s.store.MarkPlayConsumed(ctx, hash)
	} else {
		s.consume(ctx, productID, token, hash)
	}
	return &VerifyResult{State: ResultCredited, StarsAdded: res.StarsAdded, Balance: res.Balance, Debt: res.Debt}, nil
}

// consume mengonsumsi pembelian di Google setelah kredit. Gagal tidak membatalkan kredit; worker mencoba ulang.
func (s *Service) consume(ctx context.Context, productID, token, hash string) bool {
	err := s.api.Consume(ctx, productID, token)
	if err != nil {
		// Mungkin sudah dikonsumsi sebelumnya: pastikan dari status terbaru.
		if p, gerr := s.api.GetProductPurchase(ctx, token); gerr == nil {
			for _, li := range p.LineItems {
				if li.ProductID == productID && li.ConsumptionState == ConsumptionConsumed {
					err = nil
				}
			}
		}
	}
	if err != nil {
		log.Printf("⚠️ [PlayBilling] konsumsi tertunda (%s…): %v", hash[:12], err)
		return false
	}
	if err := s.store.MarkPlayConsumed(ctx, hash); err != nil {
		log.Printf("⚠️ [PlayBilling] gagal menandai konsumsi (%s…): %v", hash[:12], err)
		return false
	}
	return true
}

// SweepResult merangkum satu putaran sapuan.
type SweepResult struct {
	Consumed int
	Voided   int
}

// Sweep mencoba ulang konsumsi yang tertunda lalu membalik pembelian yang dibatalkan Google sejak putaran terakhir.
func (s *Service) Sweep(ctx context.Context) (SweepResult, error) {
	var r SweepResult
	pending, err := s.store.PlayConsumePending(ctx, consumeBatch)
	if err != nil {
		return r, err
	}
	for _, p := range pending {
		if s.consume(ctx, p.ProductID, p.PurchaseToken, p.TokenHash) {
			r.Consumed++
		}
	}

	now := s.now().UTC()
	start, err := s.store.PlayVoidedCursor(ctx)
	if err != nil {
		return r, err
	}
	// Google menolak startTime lebih tua dari 30 hari; sisakan jarak satu jam dari batas itu.
	if oldest := now.Add(-voidedLookback + time.Hour); start.IsZero() || start.Before(oldest) {
		start = oldest
	}
	end := now
	pageToken := ""
	for page := 0; page < maxVoidedPages; page++ {
		items, next, err := s.api.ListVoided(ctx, start, end, pageToken)
		if err != nil {
			return r, err
		}
		for _, v := range items {
			changed, err := s.store.VoidPlayPurchase(ctx, TokenHash(v.PurchaseToken), v.Reason)
			if err != nil {
				return r, err
			}
			if changed {
				r.Voided++
			}
		}
		if next == "" {
			break
		}
		pageToken = next
	}
	return r, s.store.SetPlayVoidedCursor(ctx, end.Add(-voidedOverlap))
}
