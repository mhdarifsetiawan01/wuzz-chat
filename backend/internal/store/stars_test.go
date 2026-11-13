package store_test

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

type starFixture struct {
	*inviteFixture
	stars *store.StarStore
}

// setupStars: grup privat "Grup Rahasia" milik creator (mitra aktif), harga 100 Star, tautan undangan aktif.
func setupStars(t *testing.T, name string) (*starFixture, string) {
	t.Helper()
	f := setupInvite(t, name)
	st := store.NewStarStore(f.ms.DB(), f.ms.DriverName(), f.inv)
	st.SetClock(func() time.Time { return *f.clock })
	f.inv.SetStarStore(st)
	ctx := t.Context()
	if err := st.SetCreator(ctx, "default", "staf", f.creator, true, "uji"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SetGroupPaid(ctx, "default", f.creator, f.groupID, 100, true); err != nil {
		t.Fatal(err)
	}
	return &starFixture{inviteFixture: f, stars: st}, f.link(t)
}

func (f *starFixture) grant(t *testing.T, user string, stars int, key string) {
	t.Helper()
	if _, err := f.stars.TestGrant(t.Context(), "default", "staf", user, stars, "uji", key); err != nil {
		t.Fatal(err)
	}
}

func (f *starFixture) assertInvariant(t *testing.T, user string) int {
	t.Helper()
	w, err := f.stars.Wallet(t.Context(), "default", user)
	if err != nil {
		t.Fatal(err)
	}
	sum, err := f.stars.SumLedger(t.Context(), user)
	if err != nil {
		t.Fatal(err)
	}
	if w.Balance != sum || w.Balance < 0 {
		t.Fatalf("invarian saldo rusak: balance=%d sum=%d", w.Balance, sum)
	}
	return w.Balance
}

func TestStars_SettingsDefaultsAndValidation(t *testing.T) {
	f, _ := setupStars(t, "st_settings.db")
	ctx := t.Context()
	st, err := f.stars.GetSettings(ctx)
	if err != nil || st.StarValueMinor != 100 || st.PlatformPct != 20 || st.StoreFeePct != 15 || st.HoldDays != 14 || len(st.Packages) != 3 {
		t.Fatalf("bawaan: %+v %v", st, err)
	}
	if gross, share := st.CreatorShareMinor(100); gross != 10000 || share != 6800 {
		t.Fatalf("bagian kreator 100 Star: gross=%d share=%d, want 10000/6800", gross, share)
	}
	bad := st
	bad.PlatformPct = 95
	if err := f.stars.UpdateSettings(ctx, "staf", bad); !errors.Is(err, store.ErrStarSettingsInvalid) {
		t.Fatalf("platform 95%%: %v", err)
	}
	st.PlatformPct = 30
	st.Packages = []int{20, 200}
	if err := f.stars.UpdateSettings(ctx, "staf", st); err != nil {
		t.Fatal(err)
	}
	got, _ := f.stars.GetSettings(ctx)
	if got.PlatformPct != 30 || len(got.Packages) != 2 || got.Packages[1] != 200 {
		t.Fatalf("setelah ubah: %+v", got)
	}
}

func TestStars_TestGrantIdempotentAndValidated(t *testing.T) {
	f, _ := setupStars(t, "st_grant.db")
	ctx := t.Context()
	for range 2 {
		f.grant(t, f.guest, 300, "k1")
	}
	if b := f.assertInvariant(t, f.guest); b != 300 {
		t.Fatalf("kunci sama dua kali: saldo %d, want 300", b)
	}
	if _, err := f.stars.TestGrant(ctx, "default", "staf", f.guest, 0, "x", "k2"); !errors.Is(err, store.ErrStarInvalidAmount) {
		t.Fatalf("0 Star: %v", err)
	}
	if _, err := f.stars.TestGrant(ctx, "default", "staf", f.guest, 5, " ", "k3"); !errors.Is(err, store.ErrStarReasonRequired) {
		t.Fatalf("tanpa alasan: %v", err)
	}
	if _, err := f.stars.Wallet(ctx, "tenant_lain", f.guest); !errors.Is(err, store.ErrStarsTenant) {
		t.Fatalf("tenant lain: %v", err)
	}
}

func TestStars_SetGroupPaidRules(t *testing.T) {
	f, tok := setupStars(t, "st_rules.db")
	ctx := t.Context()
	if _, err := f.stars.SetGroupPaid(ctx, "default", f.admin, f.groupID, 100, true); !errors.Is(err, store.ErrNotGroupCreator) {
		t.Fatalf("admin bukan creator: %v", err)
	}
	if _, err := f.stars.SetGroupPaid(ctx, "default", f.creator, f.groupID, 5, true); !errors.Is(err, store.ErrPaidPriceOutOfRange) {
		t.Fatalf("harga 5: %v", err)
	}
	// Tautan aktif ber-mode paid; pratinjau menampilkan harga dan saldo; pengajuan approval ditolak.
	p, err := f.inv.Preview(ctx, tok, f.guest)
	if err != nil || p.Mode != store.InviteModePaid || p.PriceStars != 100 || p.MyBalance == nil || *p.MyBalance != 0 {
		t.Fatalf("pratinjau berbayar: %+v %v", p, err)
	}
	if l, _ := f.inv.GetActive(ctx, f.groupID, f.creator); l == nil || l.Mode != store.InviteModePaid {
		t.Fatalf("mode tautan: %+v", l)
	}
	if _, err := f.inv.RequestJoin(ctx, tok, f.guest); !errors.Is(err, store.ErrPaymentRequired) {
		t.Fatalf("ajukan ke grup berbayar: %v", err)
	}
	if paid, _ := f.stars.IsPaidGroup(ctx, f.groupID); !paid {
		t.Fatal("IsPaidGroup harus true")
	}

	// Menonaktifkan berbayar mereset tautan kembali ke approval (tautan lama mati).
	if _, err := f.stars.SetGroupPaid(ctx, "default", f.creator, f.groupID, 100, false); err != nil {
		t.Fatal(err)
	}
	if _, err := f.inv.Preview(ctx, tok, f.guest); !errors.Is(err, store.ErrInviteNotFound) {
		t.Fatalf("tautan lama setelah nonaktif: %v", err)
	}
	l, _ := f.inv.GetActive(ctx, f.groupID, f.creator)
	if l == nil || l.Mode != store.InviteModeApproval {
		t.Fatalf("tautan baru approval: %+v", l)
	}

	// Mitra dicabut: grup berbayar ikut nonaktif; tanpa hak mitra tidak bisa mengaktifkan lagi.
	if _, err := f.stars.SetGroupPaid(ctx, "default", f.creator, f.groupID, 100, true); err != nil {
		t.Fatal(err)
	}
	if err := f.stars.SetCreator(ctx, "default", "staf", f.creator, false, "selesai"); err != nil {
		t.Fatal(err)
	}
	if paid, _ := f.stars.IsPaidGroup(ctx, f.groupID); paid {
		t.Fatal("mitra dicabut: grup harus nonaktif")
	}
	if _, err := f.stars.SetGroupPaid(ctx, "default", f.creator, f.groupID, 100, true); !errors.Is(err, store.ErrNotPaidCreator) {
		t.Fatalf("bukan mitra: %v", err)
	}
}

func TestStars_PurchaseAccess(t *testing.T) {
	f, tok := setupStars(t, "st_buy.db")
	ctx := t.Context()

	if _, err := f.stars.PurchaseAccess(ctx, tok, f.guest, 100, "b1"); !errors.Is(err, store.ErrInsufficientStars) {
		t.Fatalf("saldo 0: %v", err)
	}
	if role, _ := f.gs.GetUserRoleInGroup(f.groupID, f.guest); role != "" {
		t.Fatalf("gagal bayar tidak boleh jadi anggota: %q", role)
	}
	f.grant(t, f.guest, 250, "g1")
	if _, err := f.stars.PurchaseAccess(ctx, tok, f.guest, 90, "b2"); !errors.Is(err, store.ErrPriceChanged) {
		t.Fatalf("harga berubah: %v", err)
	}
	if _, err := f.stars.PurchaseAccess(ctx, tok, f.guest, 100, ""); !errors.Is(err, store.ErrIdempotencyKeyMissing) {
		t.Fatalf("tanpa kunci: %v", err)
	}
	res, err := f.stars.PurchaseAccess(ctx, tok, f.guest, 100, "b3")
	if err != nil || res.Status != store.InviteStatusMember || res.StarsPaid != 100 || res.Balance != 150 || res.AlreadyPaid {
		t.Fatalf("bayar: %+v %v", res, err)
	}
	if role, _ := f.gs.GetUserRoleInGroup(f.groupID, f.guest); role != "member" {
		t.Fatalf("harus jadi anggota: %q", role)
	}
	// Ulang dengan kunci sama: tanpa potongan; kunci lain saat sudah anggota: tanpa potongan.
	for _, k := range []string{"b3", "b4"} {
		res, err := f.stars.PurchaseAccess(ctx, tok, f.guest, 100, k)
		if err != nil || !res.AlreadyPaid || res.Balance != 150 {
			t.Fatalf("ulang %s: %+v %v", k, res, err)
		}
	}
	if b := f.assertInvariant(t, f.guest); b != 150 {
		t.Fatalf("saldo akhir %d", b)
	}

	// Bagian kreator tercatat dalam uang dengan snapshot tarif.
	var amount, gross int64
	var status, cur string
	var platform int
	if err := f.ms.DB().QueryRow(rebindPG(f.ms, `SELECT amount_minor, gross_minor, status, currency, platform_pct FROM creator_earnings WHERE creator_id = ?`), f.creator).
		Scan(&amount, &gross, &status, &cur, &platform); err != nil {
		t.Fatal(err)
	}
	if amount != 6800 || gross != 10000 || status != store.EarningPending || cur != "IDR" || platform != 20 {
		t.Fatalf("earning: amount=%d gross=%d status=%s cur=%s platform=%d", amount, gross, status, cur, platform)
	}
	recv, _ := f.stars.StarsReceived(ctx, "default", f.creator)
	if len(recv) != 1 || recv[0].Stars != 100 || recv[0].PendingStars != 100 || recv[0].AvailableStars != 0 {
		t.Fatalf("diterima (masa tahan): %+v", recv)
	}
	*f.clock = f.clock.Add(15 * 24 * time.Hour)
	recv, _ = f.stars.StarsReceived(ctx, "default", f.creator)
	if recv[0].AvailableStars != 100 || recv[0].PendingStars != 0 {
		t.Fatalf("diterima (lewat masa tahan): %+v", recv)
	}

	// Refund manual: Star kembali, bagian kreator dibalik, tidak bisa dua kali; keanggotaan tidak berubah.
	w, _ := f.stars.Wallet(ctx, "default", f.guest)
	var spendID string
	for _, e := range w.History {
		if e.Kind == store.StarKindSpend {
			spendID = e.ID
		}
	}
	if b, err := f.stars.RefundSpend(ctx, "default", "staf", spendID, "keluhan"); err != nil || b != 250 {
		t.Fatalf("refund: %d %v", b, err)
	}
	if _, err := f.stars.RefundSpend(ctx, "default", "staf", spendID, "lagi"); !errors.Is(err, store.ErrStarAlreadyRefunded) {
		t.Fatalf("refund ganda: %v", err)
	}
	if _, err := f.stars.RefundSpend(ctx, "default", "staf", "stl_tidak_ada", "x"); !errors.Is(err, store.ErrStarLedgerNotFound) {
		t.Fatalf("refund entri tak ada: %v", err)
	}
	if recv, _ := f.stars.StarsReceived(ctx, "default", f.creator); len(recv) != 0 {
		t.Fatalf("setelah refund, Star diterima harus kosong: %+v", recv)
	}
	f.assertInvariant(t, f.guest)
	if role, _ := f.gs.GetUserRoleInGroup(f.groupID, f.guest); role != "member" {
		t.Fatalf("refund tidak mengubah keanggotaan: %q", role)
	}

	// Dikeluarkan lalu masuk lagi = bayar lagi.
	if err := f.gs.RemoveGroupMember(f.groupID, f.creator, f.guest); err != nil {
		t.Fatal(err)
	}
	if res, err := f.stars.PurchaseAccess(ctx, tok, f.guest, 100, "b5"); err != nil || res.AlreadyPaid || res.Balance != 150 {
		t.Fatalf("bayar ulang setelah dikeluarkan: %+v %v", res, err)
	}
	f.assertInvariant(t, f.guest)
}

// Pembayaran bersamaan: ke grup yang sama dengan kunci berbeda hanya terpotong sekali; ke banyak grup, saldo tidak
// pernah negatif dan invarian saldo terjaga.
func TestStars_ConcurrentPurchases(t *testing.T) {
	f, tok := setupStars(t, "st_conc.db")
	ctx := t.Context()
	f.grant(t, f.guest, 1000, "g")

	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _ = f.stars.PurchaseAccess(ctx, tok, f.guest, 100, fmt.Sprintf("same-%d", i))
		}(i)
	}
	wg.Wait()
	if b := f.assertInvariant(t, f.guest); b != 900 {
		t.Fatalf("grup sama, 8 permintaan bersamaan: saldo %d, want 900 (sekali potong)", b)
	}

	// Lima grup berbayar lain @300 Star; saldo 900 cukup untuk tepat tiga.
	tokens := make([]string, 5)
	for i := range tokens {
		g, err := f.gs.CreateGroup(fmt.Sprintf("Grup %d", i), "", "", f.creator, "", false, nil)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.stars.SetGroupPaid(ctx, "default", f.creator, g.ID, 300, true); err != nil {
			t.Fatal(err)
		}
		l, err := f.inv.CreateOrReset(ctx, g.ID, f.creator, false)
		if err != nil {
			t.Fatal(err)
		}
		tokens[i] = l.Token
	}
	var mu sync.Mutex
	ok, insufficient, busy := 0, 0, 0
	for i, tk := range tokens {
		wg.Add(1)
		go func(i int, tk string) {
			defer wg.Done()
			_, err := f.stars.PurchaseAccess(ctx, tk, f.guest, 300, fmt.Sprintf("multi-%d", i))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				ok++
			case errors.Is(err, store.ErrInsufficientStars):
				insufficient++
			case f.ms.DriverName() == "sqlite" && strings.Contains(err.Error(), "SQLITE_BUSY"):
				// Keterbatasan lama SQLite (busy_timeout hanya pada satu koneksi pool): transaksi ditolak tanpa potongan.
				busy++
			default:
				t.Errorf("galat tak terduga: %v", err)
			}
		}(i, tk)
	}
	wg.Wait()
	b := f.assertInvariant(t, f.guest)
	if b != 900-300*ok || ok > 3 || ok+insufficient+busy != 5 {
		t.Fatalf("banyak grup: ok=%d kurang=%d busy=%d saldo=%d", ok, insufficient, busy, b)
	}
	if f.ms.DriverName() == "postgres" && (ok != 3 || insufficient != 2) {
		t.Fatalf("Postgres: ok=%d kurang=%d, want 3/2", ok, insufficient)
	}
}
