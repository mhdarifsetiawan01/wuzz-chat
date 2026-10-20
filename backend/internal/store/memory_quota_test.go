package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

type quotaEnv struct {
	*limitEnv
	jobs  *store.GatedMemoryStore
	inner *store.SQLMemoryStore
}

func newQuotaEnv(t *testing.T, withQuota bool) *quotaEnv {
	t.Helper()
	e := &quotaEnv{limitEnv: newLimitEnv(t, false)}
	e.inner = store.NewSQLMemoryStore(e.ms.DB(), e.ms.DriverName())
	e.jobs = store.NewGatedMemoryStore(e.inner, store.AllowAllMemoryGate())
	if withQuota {
		e.jobs.SetQuota(e.es)
	}
	return e
}

// endForum membuat forum milik creator lalu mencoba membuat job AI-nya (seperti saat forum berakhir).
func (e *quotaEnv) endForum(parentID, creatorID string) (*store.GroupDetails, error) {
	f := e.mustSub(parentID, creatorID, "7_days")
	_, err := e.jobs.CreateJob(e.ctx, f.ID, parentID)
	return f, err
}

func TestMemoryQuota_FreeTwoPerMonthThirdRejected(t *testing.T) {
	e := newQuotaEnv(t, true)
	u := e.user("quota_free")
	g := e.group(u, "Grup Kuota")

	for i := 0; i < 2; i++ {
		if _, err := e.endForum(g, u); err != nil {
			t.Fatalf("job ke-%d harus dibuat: %v", i+1, err)
		}
	}
	_, err := e.endForum(g, u)
	var qe *store.MemoryQuotaError
	if !errors.Is(err, store.ErrMemoryQuotaExceeded) || !errors.As(err, &qe) {
		t.Fatalf("job ke-3 harus ErrMemoryQuotaExceeded, dapat %v", err)
	}
	if qe.Plan != "free" || qe.Limit != 2 || qe.Used != 2 || !qe.ResetAt.After(time.Now()) {
		t.Fatalf("detail kuota salah: %+v", qe)
	}
}

func TestMemoryQuota_ProTwentyPerMonth(t *testing.T) {
	e := newQuotaEnv(t, true)
	u := e.user("quota_pro")
	g := e.group(u, "Grup Pro")
	e.grantPro(u, nil)

	for i := 0; i < 20; i++ {
		if _, err := e.endForum(g, u); err != nil {
			t.Fatalf("job ke-%d Pro harus dibuat: %v", i+1, err)
		}
	}
	if _, err := e.endForum(g, u); !errors.Is(err, store.ErrMemoryQuotaExceeded) {
		t.Fatalf("job ke-21 harus ditolak, dapat %v", err)
	}
}

func TestMemoryQuota_PerCreatorAndNoQuotaWhenDisabled(t *testing.T) {
	e := newQuotaEnv(t, true)
	a, b := e.user("qa"), e.user("qb")
	g := e.group(a, "Grup Bersama")
	for i := 0; i < 2; i++ {
		if _, err := e.endForum(g, a); err != nil {
			t.Fatal(err)
		}
	}
	// Kuota a habis, tetapi forum milik b (pembuat berbeda) tidak terpengaruh.
	gb := e.group(b, "Grup B")
	if _, err := e.endForum(gb, b); err != nil {
		t.Fatalf("kuota b tidak boleh ikut habis: %v", err)
	}

	off := newQuotaEnv(t, false)
	u := off.user("noquota")
	go1 := off.group(u, "Grup Tanpa Kuota")
	for i := 0; i < 5; i++ {
		if _, err := off.endForum(go1, u); err != nil {
			t.Fatalf("tanpa kuota, job harus selalu dibuat: %v", err)
		}
	}
}

func TestMemoryQuota_ExistingJobIsNotReportedAsQuota(t *testing.T) {
	e := newQuotaEnv(t, true)
	u := e.user("idem")
	g := e.group(u, "Grup Idem")
	f, err := e.endForum(g, u)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.endForum(g, u); err != nil {
		t.Fatal(err)
	}
	// Kuota sudah habis, tetapi membuat ulang job untuk forum yang sama bukan kegagalan kuota (ditolak UNIQUE).
	_, err = e.jobs.CreateJob(e.ctx, f.ID, g)
	if err == nil || errors.Is(err, store.ErrMemoryQuotaExceeded) {
		t.Fatalf("job duplikat harus ditolak oleh UNIQUE, bukan kuota: %v", err)
	}
}

func TestMemoryQuota_TerminalFailAndOldMonthNotCounted(t *testing.T) {
	e := newQuotaEnv(t, true)
	u := e.user("uncounted")
	g := e.group(u, "Grup Hitung")
	f1, err := e.endForum(g, u)
	if err != nil {
		t.Fatal(err)
	}
	f2, err := e.endForum(g, u)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.endForum(g, u); !errors.Is(err, store.ErrMemoryQuotaExceeded) {
		t.Fatalf("prasyarat: kuota harus habis, dapat %v", err)
	}

	// Job gagal permanen tidak menghasilkan ringkasan, jadi tidak memakai kuota.
	if _, err := e.ms.DB().Exec(rebindForTest(e.ms, `UPDATE forum_memory_jobs SET is_terminal_fail = ? WHERE forum_id = ?`), true, f1.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.endForum(g, u); err != nil {
		t.Fatalf("job gagal permanen tidak boleh dihitung: %v", err)
	}
	// Job bulan lalu tidak dihitung.
	lastMonth := time.Now().UTC().AddDate(0, -1, -1)
	if _, err := e.ms.DB().Exec(rebindForTest(e.ms, `UPDATE forum_memory_jobs SET created_at = ? WHERE forum_id = ?`), lastMonth, f2.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.endForum(g, u); err != nil {
		t.Fatalf("job bulan lalu tidak boleh dihitung: %v", err)
	}
	if n, _ := e.es.CountMemoryJobs(e.ctx, "default", u, time.Now().UTC()); n != 2 {
		t.Fatalf("hitungan bulan ini harus 2, dapat %d", n)
	}
}

func TestMemoryQuota_NonDefaultTenantAndWhitelistPrecedence(t *testing.T) {
	e := newQuotaEnv(t, true)
	u := e.user("b2b_quota")
	g := e.group(u, "Grup B2B Kuota")
	if _, err := e.ms.DB().Exec(rebindForTest(e.ms, `UPDATE conversations SET tenant_id = ? WHERE id = ?`), "acme", g); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		if _, err := e.endForum(g, u); err != nil {
			t.Fatalf("tenant non-default tidak dikenai kuota: %v", err)
		}
	}

	// Whitelist grup tetap lebih dulu: grup di luar daftar ditolak ErrMemoryNotEnabled, bukan kuota.
	closed := store.NewGatedMemoryStore(e.inner, store.ParseMemoryGate("grp_lain"))
	closed.SetQuota(e.es)
	u2 := e.user("closed_gate")
	g2 := e.group(u2, "Grup Tertutup")
	f := e.mustSub(g2, u2, "7_days")
	if _, err := closed.CreateJob(e.ctx, f.ID, g2); !errors.Is(err, store.ErrMemoryNotEnabled) {
		t.Fatalf("whitelist harus lebih dulu: %v", err)
	}
}

type failingQuota struct{}

func (failingQuota) CheckMemoryJobQuota(context.Context, string) error { return errors.New("db down") }

func TestMemoryQuota_InfrastructureErrorFailsOpen(t *testing.T) {
	e := newQuotaEnv(t, false)
	e.jobs.SetQuota(failingQuota{})
	u := e.user("failopen")
	g := e.group(u, "Grup FailOpen")
	if _, err := e.endForum(g, u); err != nil {
		t.Fatalf("galat infrastruktur pada cek kuota tidak boleh membatalkan job: %v", err)
	}
}
