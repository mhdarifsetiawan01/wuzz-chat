package store_test

import (
	"errors"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

const creatorAppMsg = "Grup belajar gitar mingguan untuk pemula"

func TestCreatorApplications_Lifecycle(t *testing.T) {
	f, _ := setupStars(t, "st_creator_app.db")
	ctx := t.Context()

	// Mitra aktif tidak bisa mengajukan.
	if _, err := f.stars.SubmitCreatorApplication(ctx, "default", f.creator, creatorAppMsg); !errors.Is(err, store.ErrAlreadyCreator) {
		t.Fatalf("mitra aktif: %v", err)
	}
	// Pesan terlalu pendek/panjang ditolak.
	if _, err := f.stars.SubmitCreatorApplication(ctx, "default", f.guest, "  pendek "); !errors.Is(err, store.ErrCreatorAppMessage) {
		t.Fatalf("pesan pendek: %v", err)
	}
	st, err := f.stars.CreatorApplicationStatus(ctx, "default", f.guest)
	if err != nil || !st.CanApply || st.Application != nil || st.IsCreator {
		t.Fatalf("status awal: %+v %v", st, err)
	}
	st, err = f.stars.SubmitCreatorApplication(ctx, "default", f.guest, creatorAppMsg)
	if err != nil || st.CanApply || st.Application == nil || st.Application.Status != store.CreatorAppPending {
		t.Fatalf("ajukan: %+v %v", st, err)
	}
	if _, err := f.stars.SubmitCreatorApplication(ctx, "default", f.guest, creatorAppMsg); !errors.Is(err, store.ErrCreatorAppPending) {
		t.Fatalf("ajukan dua kali: %v", err)
	}

	// Tolak: jeda pengajuan ulang 7 hari, catatan terlihat oleh pemohon.
	list, err := f.stars.ListCreatorApplications(ctx, "default", store.CreatorAppPending, 0)
	if err != nil || len(list) != 1 || list[0].Username == "" || list[0].Message != creatorAppMsg {
		t.Fatalf("daftar pending: %+v %v", list, err)
	}
	appID := list[0].ID
	if _, err := f.stars.DecideCreatorApplication(ctx, "default", "staf", appID, false, "Lengkapi contoh konten"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.stars.DecideCreatorApplication(ctx, "default", "staf", appID, true, ""); !errors.Is(err, store.ErrCreatorAppNotPending) {
		t.Fatalf("putuskan dua kali: %v", err)
	}
	st, _ = f.stars.CreatorApplicationStatus(ctx, "default", f.guest)
	if st.CanApply || st.RetryAt == nil || st.Application.DecisionNote != "Lengkapi contoh konten" {
		t.Fatalf("setelah ditolak: %+v", st)
	}
	var cd *store.CreatorAppCooldownError
	if _, err := f.stars.SubmitCreatorApplication(ctx, "default", f.guest, creatorAppMsg); !errors.As(err, &cd) {
		t.Fatalf("dalam jeda: %v", err)
	}

	// Setelah jeda lewat: boleh mengajukan lagi, lalu disetujui = menjadi mitra kreator.
	*f.clock = f.clock.Add(store.CreatorAppCooldown + time.Minute)
	st, err = f.stars.SubmitCreatorApplication(ctx, "default", f.guest, creatorAppMsg)
	if err != nil || st.Application.Status != store.CreatorAppPending {
		t.Fatalf("ajukan ulang: %+v %v", st, err)
	}
	app, err := f.stars.DecideCreatorApplication(ctx, "default", "staf", st.Application.ID, true, "")
	if err != nil || app.Status != store.CreatorAppApproved || app.DecidedAt == nil {
		t.Fatalf("setujui: %+v %v", app, err)
	}
	if ok, _ := f.stars.IsCreator(ctx, "default", f.guest); !ok {
		t.Fatal("disetujui tetapi belum mitra kreator")
	}
	st, _ = f.stars.CreatorApplicationStatus(ctx, "default", f.guest)
	if !st.IsCreator || st.CanApply {
		t.Fatalf("status mitra: %+v", st)
	}

	// Dicabut admin: boleh mengajukan lagi tanpa jeda.
	if err := f.stars.SetCreator(ctx, "default", "staf", f.guest, false, ""); err != nil {
		t.Fatal(err)
	}
	if st, _ = f.stars.CreatorApplicationStatus(ctx, "default", f.guest); !st.CanApply {
		t.Fatalf("setelah dicabut: %+v", st)
	}
}

func TestCreatorApplications_ManualGrantApprovesPending(t *testing.T) {
	f, _ := setupStars(t, "st_creator_app_manual.db")
	ctx := t.Context()
	if _, err := f.stars.SubmitCreatorApplication(ctx, "default", f.member, creatorAppMsg); err != nil {
		t.Fatal(err)
	}
	// Admin memberi hak lewat formulir manual: permohonan yang menunggu ikut tertutup.
	if err := f.stars.SetCreator(ctx, "default", "staf", f.member, true, ""); err != nil {
		t.Fatal(err)
	}
	pending, _ := f.stars.ListCreatorApplications(ctx, "default", store.CreatorAppPending, 0)
	if len(pending) != 0 {
		t.Fatalf("masih pending: %+v", pending)
	}
	all, _ := f.stars.ListCreatorApplications(ctx, "default", "", 0)
	if len(all) != 1 || all[0].Status != store.CreatorAppApproved || all[0].DecidedBy != "staf" {
		t.Fatalf("semua: %+v", all)
	}
}

func TestStarsPlay_AdminPurchaseList(t *testing.T) {
	f, _ := setupStars(t, "st_purchase_list.db")
	ctx := t.Context()
	test := playCredit(f.member, "t1", 500)
	test.IsTest = true
	for _, in := range []store.PlayCreditInput{playCredit(f.guest, "p1", 50), playCredit(f.guest, "p2", 100), test} {
		if _, err := f.stars.CreditPlayPurchase(ctx, in); err != nil {
			t.Fatal(err)
		}
		*f.clock = f.clock.Add(time.Second)
	}
	if _, err := f.stars.VoidPlayPurchase(ctx, "p1", 0); err != nil {
		t.Fatal(err)
	}
	list, err := f.stars.ListPlayPurchases(ctx, "", false, 0)
	if err != nil || len(list) != 2 || list[0].TokenHash != "p2" || list[0].Username == "" {
		t.Fatalf("tanpa uji: %+v %v", list, err)
	}
	if sum := store.SummarizePlayPurchases(list); sum.Count != 1 || sum.Stars != 100 || sum.VoidedCount != 1 || sum.TestCount != 0 {
		t.Fatalf("ringkasan: %+v", sum)
	}
	all, _ := f.stars.ListPlayPurchases(ctx, "", true, 0)
	if len(all) != 3 || store.SummarizePlayPurchases(all).TestCount != 1 {
		t.Fatalf("dengan uji: %+v", all)
	}
	voided, _ := f.stars.ListPlayPurchases(ctx, store.PlayStateVoided, true, 0)
	if len(voided) != 1 || voided[0].TokenHash != "p1" {
		t.Fatalf("voided: %+v", voided)
	}
}
