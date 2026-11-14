package store_test

import (
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func playCredit(user, hash string, stars int) store.PlayCreditInput {
	return store.PlayCreditInput{UserID: user, TokenHash: hash, PurchaseToken: "tok-" + hash, OrderID: "GPA." + hash,
		ProductID: store.PlayProductID(stars), Stars: stars}
}

func TestStarsPlay_ProductMapping(t *testing.T) {
	st := store.DefaultStarSettings()
	if n, ok := st.PlayProductStars("star_100"); !ok || n != 100 {
		t.Fatalf("star_100 = %d %v", n, ok)
	}
	for _, bad := range []string{"star_75", "stars_100", "star_", "star_abc", ""} {
		if _, ok := st.PlayProductStars(bad); ok {
			t.Fatalf("%q seharusnya tidak dikenal", bad)
		}
	}
	if store.PlayProductID(500) != "star_500" {
		t.Fatal("PlayProductID")
	}
}

func TestStarsPlay_CreditIdempotentAndOwned(t *testing.T) {
	f, _ := setupStars(t, "st_play_credit.db")
	ctx := t.Context()

	res, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.guest, "h1", 100))
	if err != nil || res.StarsAdded != 100 || res.Balance != 100 || res.AlreadyCredited {
		t.Fatalf("kredit pertama: %+v %v", res, err)
	}
	again, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.guest, "h1", 100))
	if err != nil || !again.AlreadyCredited || again.Balance != 100 || again.StarsAdded != 0 {
		t.Fatalf("kredit ulang token sama: %+v %v", again, err)
	}
	if _, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.member, "h1", 100)); !errors.Is(err, store.ErrPlayPurchaseOtherUser) {
		t.Fatalf("token milik akun lain: %v", err)
	}
	f.assertInvariant(t, f.guest)

	p, err := f.stars.PlayPurchaseByHash(ctx, "h1")
	if err != nil || p == nil || p.State != store.PlayStateCredited || p.Consumed || p.LedgerID == "" {
		t.Fatalf("baris pembelian: %+v %v", p, err)
	}
	pending, _ := f.stars.PlayConsumePending(ctx, 10)
	if len(pending) != 1 {
		t.Fatalf("belum dikonsumsi: %d", len(pending))
	}
	if err := f.stars.MarkPlayConsumed(ctx, "h1"); err != nil {
		t.Fatal(err)
	}
	if pending, _ := f.stars.PlayConsumePending(ctx, 10); len(pending) != 0 {
		t.Fatalf("setelah konsumsi masih tertunda: %d", len(pending))
	}
	w, _ := f.stars.Wallet(ctx, "default", f.guest)
	if len(w.History) != 1 || w.History[0].Kind != store.StarKindPurchase || w.History[0].Delta != 100 {
		t.Fatalf("riwayat: %+v", w.History)
	}
}

func TestStarsPlay_VoidWithBalanceAndDebt(t *testing.T) {
	f, tok := setupStars(t, "st_play_void.db")
	ctx := t.Context()

	// Saldo cukup: pembalikan penuh, tanpa utang.
	if _, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.guest, "a", 50)); err != nil {
		t.Fatal(err)
	}
	changed, err := f.stars.VoidPlayPurchase(ctx, "a", 1)
	if err != nil || !changed {
		t.Fatalf("void a: %v %v", changed, err)
	}
	if again, _ := f.stars.VoidPlayPurchase(ctx, "a", 1); again {
		t.Fatal("void kedua seharusnya tidak berubah")
	}
	if changed, _ := f.stars.VoidPlayPurchase(ctx, "tidak-dikenal", 1); changed {
		t.Fatal("token tak dikenal seharusnya diabaikan")
	}
	if b := f.assertInvariant(t, f.guest); b != 0 {
		t.Fatalf("saldo setelah void penuh: %d", b)
	}
	if d, _ := f.stars.Debt(ctx, f.guest); d != 0 {
		t.Fatalf("utang: %d", d)
	}

	// Star dibelanjakan lalu pembeliannya dibatalkan: saldo 0, sisanya utang, belanja diblokir.
	if _, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.guest, "b", 100)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.stars.PurchaseAccess(ctx, tok, f.guest, 100, "k1"); err != nil {
		t.Fatal(err)
	}
	if changed, err := f.stars.VoidPlayPurchase(ctx, "b", 7); err != nil || !changed {
		t.Fatalf("void b: %v %v", changed, err)
	}
	if b := f.assertInvariant(t, f.guest); b != 0 {
		t.Fatalf("saldo tidak boleh negatif: %d", b)
	}
	if d, _ := f.stars.Debt(ctx, f.guest); d != 100 {
		t.Fatalf("utang = %d, want 100", d)
	}
	w, _ := f.stars.Wallet(ctx, "default", f.guest)
	if w.Debt != 100 {
		t.Fatalf("dompet.debt = %d", w.Debt)
	}
	debtors, _ := f.stars.ListDebtors(ctx, 10)
	if len(debtors) != 1 || debtors[0].UserID != f.guest || debtors[0].Amount != 100 {
		t.Fatalf("daftar utang: %+v", debtors)
	}

	// Grup berbayar lain: ditolak karena utang, walau saldo cukup setelah kredit uji.
	g, err := f.gs.CreateGroup("Grup Lain", "", "", f.creator, "", false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.stars.SetGroupPaid(ctx, "default", f.creator, g.ID, 10, true); err != nil {
		t.Fatal(err)
	}
	l, err := f.inv.CreateOrReset(ctx, g.ID, f.creator, false)
	if err != nil {
		t.Fatal(err)
	}
	f.grant(t, f.guest, 20, "g20")
	if _, err := f.stars.PurchaseAccess(ctx, l.Token, f.guest, 10, "k2"); !errors.Is(err, store.ErrStarsDebt) {
		t.Fatalf("belanja saat berutang: %v", err)
	}

	// Kredit berikutnya melunasi utang lebih dulu: 20 + 150 - 100 = 70, utang 0, belanja kembali boleh.
	res, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.guest, "c", 150))
	if err != nil || res.Debt != 0 || res.Balance != 70 {
		t.Fatalf("kredit pelunasan: %+v %v", res, err)
	}
	if _, err := f.stars.PurchaseAccess(ctx, l.Token, f.guest, 10, "k3"); err != nil {
		t.Fatalf("belanja setelah lunas: %v", err)
	}
	if b := f.assertInvariant(t, f.guest); b != 60 {
		t.Fatalf("saldo akhir: %d", b)
	}

	// Saldo 40 lalu pembelian 50 dibatalkan: utang 10; kredit 5 hanya melunasi sebagian.
	if _, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.member, "m1", 50)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.stars.PurchaseAccess(ctx, l.Token, f.member, 10, "m-k"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.stars.VoidPlayPurchase(ctx, "m1", 5); err != nil {
		t.Fatal(err)
	}
	res, err = f.stars.CreditPlayPurchase(ctx, playCredit(f.member, "m2", 5))
	if err != nil || res.Debt != 5 || res.Balance != 0 {
		t.Fatalf("lunas sebagian: %+v %v", res, err)
	}
	f.assertInvariant(t, f.member)
}

func TestStarsPlay_VoidedCursor(t *testing.T) {
	f, _ := setupStars(t, "st_play_cursor.db")
	ctx := t.Context()
	c, err := f.stars.PlayVoidedCursor(ctx)
	if err != nil || !c.IsZero() {
		t.Fatalf("cursor awal: %v %v", c, err)
	}
	want := f.clock.Truncate(1e6)
	if err := f.stars.SetPlayVoidedCursor(ctx, want); err != nil {
		t.Fatal(err)
	}
	got, _ := f.stars.PlayVoidedCursor(ctx)
	if !got.Equal(want) {
		t.Fatalf("cursor = %v, want %v", got, want)
	}
	// Kunci cursor di star_settings tidak mengganggu pengaturan.
	if st, err := f.stars.GetSettings(ctx); err != nil || st.StarValueMinor != 100 {
		t.Fatalf("pengaturan: %+v %v", st, err)
	}
}

func TestStarsPlay_ConcurrentSameToken(t *testing.T) {
	f, _ := setupStars(t, "st_play_conc.db")
	ctx := t.Context()
	var wg sync.WaitGroup
	var mu sync.Mutex
	credited, replay, busy := 0, 0, 0
	for i := range 8 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			res, err := f.stars.CreditPlayPurchase(ctx, playCredit(f.guest, "same", 100))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil && !res.AlreadyCredited:
				credited++
			case err == nil:
				replay++
			case f.ms.DriverName() == "sqlite" && strings.Contains(err.Error(), "SQLITE_BUSY"):
				busy++
			default:
				t.Errorf("permintaan %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()
	if credited != 1 {
		t.Fatalf("token sama bersamaan: credited=%d replay=%d busy=%d, want tepat 1 kredit", credited, replay, busy)
	}
	if b := f.assertInvariant(t, f.guest); b != 100 {
		t.Fatalf("saldo %d, want 100", b)
	}
}
