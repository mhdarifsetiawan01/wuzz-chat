package store_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func (e *limitEnv) expiresAt(subID string) time.Time {
	e.t.Helper()
	var at time.Time
	if err := e.ms.DB().QueryRow(`SELECT expires_at FROM conversations WHERE id = ?`, subID).Scan(&at); err != nil {
		e.t.Fatalf("baca expires_at: %v", err)
	}
	return at.UTC()
}

func TestExtendSubGroup_ProCreatorAddsDays(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_pro")
	e.grantPro(u, nil)
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")
	before := e.expiresAt(sub.ID)

	res, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 3)
	if err != nil {
		t.Fatalf("perpanjang: %v", err)
	}
	if res.ExtendedDays != 3 || res.ExtendRemaining != 27 || res.AddedDays != 3 {
		t.Fatalf("hasil salah: %+v", res)
	}
	if got := e.expiresAt(sub.ID); !got.Equal(before.AddDate(0, 0, 3)) {
		t.Fatalf("expires_at harus bertambah 3 hari: sebelum %v sesudah %v", before, got)
	}
}

func TestExtendSubGroup_FreeCreatorRejected(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_free")
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")

	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 1); !errors.Is(err, store.ErrExtendProRequired) {
		t.Fatalf("Free harus ditolak ErrExtendProRequired, dapat %v", err)
	}
}

func TestExtendSubGroup_ExpiredProLosesRight(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_lapsed")
	until := time.Now().UTC().Add(time.Hour)
	e.grantPro(u, &until)
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")
	if _, err := e.ms.DB().Exec(`UPDATE user_entitlements SET valid_until = ? WHERE user_id = ?`, time.Now().UTC().Add(-time.Minute), u); err != nil {
		t.Fatal(err)
	}
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 1); !errors.Is(err, store.ErrExtendProRequired) {
		t.Fatalf("Pro kedaluwarsa harus ditolak, dapat %v", err)
	}
}

func TestExtendSubGroup_OnlyForumCreator(t *testing.T) {
	e := newLimitEnv(t, true)
	owner := e.user("ext_owner")
	e.grantPro(owner, nil)
	admin := e.user("ext_admin")
	e.grantPro(admin, nil)
	g := e.group(owner, "Grup")
	if err := e.gs.AddGroupMembers(g, owner, []string{admin}); err != nil {
		t.Fatal(err)
	}
	if err := e.gs.UpdateMemberRole(g, owner, admin, "admin"); err != nil {
		t.Fatal(err)
	}
	sub := e.mustSub(g, owner, "7_days")

	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, admin, 1); !errors.Is(err, store.ErrExtendNotCreator) {
		t.Fatalf("admin non-pembuat harus ditolak, dapat %v", err)
	}
}

func TestExtendSubGroup_DaysBounds(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_days")
	e.grantPro(u, nil)
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")

	for _, d := range []int{-1, 0, 4, 30} {
		if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, d); !errors.Is(err, store.ErrExtendDaysInvalid) {
			t.Fatalf("days=%d harus ErrExtendDaysInvalid, dapat %v", d, err)
		}
	}
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 1); err != nil {
		t.Fatalf("1 hari harus lolos: %v", err)
	}
}

func TestExtendSubGroup_TotalCappedAt30(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_cap")
	e.grantPro(u, nil)
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")

	for i := 0; i < 10; i++ { // 10 x 3 = 30
		if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 3); err != nil {
			t.Fatalf("perpanjangan ke-%d: %v", i+1, err)
		}
	}
	for _, d := range []int{1, 3} {
		if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, d); !errors.Is(err, store.ErrExtendLimitReached) {
			t.Fatalf("setelah 30 hari, days=%d harus ErrExtendLimitReached, dapat %v", d, err)
		}
	}
}

func TestExtendSubGroup_PartialRoomRejectsOvershoot(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_room")
	e.grantPro(u, nil)
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")
	for i := 0; i < 9; i++ {
		if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 3); err != nil {
			t.Fatal(err)
		}
	}
	// sisa 3 hari: 3 boleh, lalu penuh
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 2); err != nil {
		t.Fatalf("2 dari sisa 3: %v", err)
	}
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 2); !errors.Is(err, store.ErrExtendLimitReached) {
		t.Fatalf("2 dari sisa 1 harus ditolak, dapat %v", err)
	}
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 1); err != nil {
		t.Fatalf("1 dari sisa 1: %v", err)
	}
}

func TestExtendSubGroup_ExpiredForumCannotBeExtended(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_dead")
	e.grantPro(u, nil)
	g := e.group(u, "Grup")

	byTime := e.mustSub(g, u, "7_days")
	if _, err := e.ms.DB().Exec(`UPDATE conversations SET expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-time.Minute), byTime.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, byTime.ID, u, 1); !errors.Is(err, store.ErrExtendForumExpired) {
		t.Fatalf("lewat waktu harus ErrExtendForumExpired, dapat %v", err)
	}

	byStatus := e.mustSub(g, u, "7_days")
	if _, err := e.ms.DB().Exec(`UPDATE conversations SET status = 'expired' WHERE id = ?`, byStatus.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, byStatus.ID, u, 1); !errors.Is(err, store.ErrExtendForumExpired) {
		t.Fatalf("status expired harus ErrExtendForumExpired, dapat %v", err)
	}
}

func TestExtendSubGroup_WrongParentIsNotFound(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_parent")
	e.grantPro(u, nil)
	g1, g2 := e.group(u, "Satu"), e.group(u, "Dua")
	sub := e.mustSub(g1, u, "7_days")
	if _, err := e.gs.ExtendSubGroup(e.ctx, g2, sub.ID, u, 1); !errors.Is(err, store.ErrGroupNotFound) {
		t.Fatalf("grup induk salah harus ErrGroupNotFound, dapat %v", err)
	}
}

func TestExtendSubGroup_SwitchOffSkipsProGateButKeepsRules(t *testing.T) {
	e := newLimitEnv(t, false)
	u := e.user("ext_off")
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 2); err != nil {
		t.Fatalf("sakelar mati: gerbang Pro tidak berlaku: %v", err)
	}
	if _, err := e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 9); !errors.Is(err, store.ErrExtendDaysInvalid) {
		t.Fatalf("aturan 1..3 hari tetap berlaku, dapat %v", err)
	}
}

func TestExtendSubGroup_ConcurrentNeverExceeds30(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ext_race")
	e.grantPro(u, nil)
	g := e.group(u, "Grup")
	sub := e.mustSub(g, u, "7_days")

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = e.gs.ExtendSubGroup(e.ctx, g, sub.ID, u, 3)
		}()
	}
	wg.Wait()
	var total int
	if err := e.ms.DB().QueryRow(`SELECT extended_days FROM conversations WHERE id = ?`, sub.ID).Scan(&total); err != nil {
		t.Fatal(err)
	}
	if total > 30 || total%3 != 0 {
		t.Fatalf("total perpanjangan %d melewati 30 atau tidak kelipatan 3", total)
	}
}
