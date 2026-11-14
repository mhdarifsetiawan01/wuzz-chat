package playbilling

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// fakeAPI meniru Google Play Developer API.
type fakeAPI struct {
	mu          sync.Mutex
	purchases   map[string]*ProductPurchase
	consumeErr  error
	consumed    []string
	voided      []VoidedPurchase
	voidedCalls []time.Time
}

func (f *fakeAPI) GetProductPurchase(_ context.Context, token string) (*ProductPurchase, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.purchases[token]
	if !ok {
		return nil, ErrPurchaseNotFound
	}
	cp := *p
	cp.LineItems = append([]LineItem(nil), p.LineItems...)
	return &cp, nil
}

func (f *fakeAPI) Consume(_ context.Context, productID, token string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.consumeErr != nil {
		return f.consumeErr
	}
	f.consumed = append(f.consumed, token)
	if p, ok := f.purchases[token]; ok {
		for i := range p.LineItems {
			p.LineItems[i].ConsumptionState = ConsumptionConsumed
		}
	}
	return nil
}

func (f *fakeAPI) ListVoided(_ context.Context, start, _ time.Time, _ string) ([]VoidedPurchase, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.voidedCalls = append(f.voidedCalls, start)
	return f.voided, "", nil
}

func (f *fakeAPI) add(token, product, account, state string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.purchases == nil {
		f.purchases = map[string]*ProductPurchase{}
	}
	f.purchases[token] = &ProductPurchase{State: state, OrderID: "GPA." + token, ObfuscatedAccountID: account,
		LineItems: []LineItem{{ProductID: product, Quantity: 1, ConsumptionState: ConsumptionNotConsumed}}}
}

func newTestService(t *testing.T) (*Service, *fakeAPI, *store.StarStore) {
	t.Helper()
	ms, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "play.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ms.Close() })
	st := store.NewStarStore(ms.DB(), ms.DriverName(), store.NewInviteLinkStore(ms.DB(), ms.DriverName()))
	api := &fakeAPI{}
	return NewService(api, st), api, st
}

func TestService_PackagesAndAccountHash(t *testing.T) {
	svc, _, _ := newTestService(t)
	pk, err := svc.Packages(t.Context())
	if err != nil || len(pk) != 3 || pk[0].ProductID != "star_50" || pk[2].Stars != 500 {
		t.Fatalf("paket: %+v %v", pk, err)
	}
	if h := AccountHash("user-1"); len(h) != 64 || h == AccountHash("user-2") {
		t.Fatalf("hash akun: %q", h)
	}
}

func TestService_VerifyAndCredit(t *testing.T) {
	svc, api, st := newTestService(t)
	ctx := t.Context()
	u := "user-a"
	api.add("tok-ok", "star_100", AccountHash(u), StatePurchased)

	res, err := svc.VerifyAndCredit(ctx, u, "star_100", "tok-ok")
	if err != nil || res.State != ResultCredited || res.StarsAdded != 100 || res.Balance != 100 {
		t.Fatalf("kredit: %+v %v", res, err)
	}
	if len(api.consumed) != 1 {
		t.Fatalf("dikonsumsi %d kali", len(api.consumed))
	}
	p, _ := st.PlayPurchaseByHash(ctx, TokenHash("tok-ok"))
	if p == nil || !p.Consumed || p.OrderID != "GPA.tok-ok" {
		t.Fatalf("baris: %+v", p)
	}
	// Dikirim ulang (pemulihan saat aplikasi dibuka): tanpa kredit kedua, tanpa panggilan Google baru.
	res, err = svc.VerifyAndCredit(ctx, u, "star_100", "tok-ok")
	if err != nil || res.StarsAdded != 0 || res.Balance != 100 {
		t.Fatalf("ulang: %+v %v", res, err)
	}
	// Akun lain memakai token yang sama.
	if _, err := svc.VerifyAndCredit(ctx, "user-b", "star_100", "tok-ok"); !errors.Is(err, store.ErrPlayPurchaseOtherUser) {
		t.Fatalf("token akun lain: %v", err)
	}

	cases := []struct {
		name, token, product string
		setup                func()
		want                 error
	}{
		{"token kosong", "", "star_100", nil, ErrInvalidToken},
		{"produk tak dikenal", "x", "star_77", nil, store.ErrPlayUnknownProduct},
		{"token tak dikenal Google", "palsu", "star_50", nil, ErrInvalidToken},
		{"akun tidak cocok", "tok-akun", "star_50", func() { api.add("tok-akun", "star_50", AccountHash("orang-lain"), StatePurchased) }, ErrAccountMismatch},
		{"tanpa obfuscated id", "tok-kosong", "star_50", func() { api.add("tok-kosong", "star_50", "", StatePurchased) }, ErrAccountMismatch},
		{"produk beda", "tok-beda", "star_50", func() { api.add("tok-beda", "star_500", AccountHash(u), StatePurchased) }, ErrProductMismatch},
		{"dibatalkan", "tok-batal", "star_50", func() { api.add("tok-batal", "star_50", AccountHash(u), StateCancelled) }, ErrCancelled},
	}
	for _, c := range cases {
		if c.setup != nil {
			c.setup()
		}
		if _, err := svc.VerifyAndCredit(ctx, u, c.product, c.token); !errors.Is(err, c.want) {
			t.Fatalf("%s: %v, want %v", c.name, err, c.want)
		}
	}

	// Tertunda: tidak dikreditkan sampai PURCHASED.
	api.add("tok-tunda", "star_50", AccountHash(u), StatePending)
	res, err = svc.VerifyAndCredit(ctx, u, "star_50", "tok-tunda")
	if err != nil || res.State != ResultPending || res.StarsAdded != 0 {
		t.Fatalf("tertunda: %+v %v", res, err)
	}
	api.add("tok-tunda", "star_50", AccountHash(u), StatePurchased)
	res, err = svc.VerifyAndCredit(ctx, u, "star_50", "tok-tunda")
	if err != nil || res.StarsAdded != 50 || res.Balance != 150 {
		t.Fatalf("setelah lunas: %+v %v", res, err)
	}
	if sum, _ := st.SumLedger(ctx, u); sum != 150 {
		t.Fatalf("buku besar %d", sum)
	}
}

func TestService_ConsumeRetryAndVoidedSweep(t *testing.T) {
	svc, api, st := newTestService(t)
	ctx := t.Context()
	now := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	svc.SetClock(func() time.Time { return now })
	u := "user-c"

	// Konsumsi gagal: Star tetap dikreditkan, konsumsi dicoba ulang oleh sapuan.
	api.consumeErr = errors.New("google sibuk")
	api.add("t1", "star_500", AccountHash(u), StatePurchased)
	res, err := svc.VerifyAndCredit(ctx, u, "star_500", "t1")
	if err != nil || res.Balance != 500 {
		t.Fatalf("kredit saat konsumsi gagal: %+v %v", res, err)
	}
	if pending, _ := st.PlayConsumePending(ctx, 10); len(pending) != 1 {
		t.Fatalf("tertunda konsumsi: %d", len(pending))
	}
	api.consumeErr = nil
	r, err := svc.Sweep(ctx)
	if err != nil || r.Consumed != 1 {
		t.Fatalf("sapuan konsumsi: %+v %v", r, err)
	}
	if pending, _ := st.PlayConsumePending(ctx, 10); len(pending) != 0 {
		t.Fatalf("masih tertunda: %d", len(pending))
	}
	// Cursor pertama = 30 hari ke belakang + 1 jam; cursor berikutnya = akhir putaran - 1 jam.
	if got := api.voidedCalls[0]; !got.Equal(now.Add(-30*24*time.Hour + time.Hour)) {
		t.Fatalf("startTime pertama %v", got)
	}

	// Voided: Star dibalik sekali walau muncul di beberapa putaran.
	api.voided = []VoidedPurchase{{PurchaseToken: "t1", Reason: 7}, {PurchaseToken: "tidak-dikenal"}}
	now = now.Add(time.Hour)
	if r, err := svc.Sweep(ctx); err != nil || r.Voided != 1 {
		t.Fatalf("sapuan voided: %+v %v", r, err)
	}
	if got := api.voidedCalls[1]; !got.Equal(now.Add(-2 * time.Hour)) {
		t.Fatalf("startTime kedua %v, want akhir putaran sebelumnya - 1 jam", got)
	}
	if r, _ := svc.Sweep(ctx); r.Voided != 0 {
		t.Fatalf("voided diulang: %+v", r)
	}
	w, _ := st.Wallet(ctx, "default", u)
	if w.Balance != 0 || w.Debt != 0 {
		t.Fatalf("dompet setelah voided: %+v", w)
	}
	// Token yang sudah dibalik tidak bisa dikreditkan lagi.
	if _, err := svc.VerifyAndCredit(ctx, u, "star_500", "t1"); !errors.Is(err, ErrCancelled) {
		t.Fatalf("token voided dikirim ulang: %v", err)
	}
}
