package store_test

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/entitlement"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type limitEnv struct {
	t   *testing.T
	ms  *store.SQLMessageStore
	gs  *store.SQLGroupStore
	us  *store.SQLUserStore
	es  *store.SQLEntitlementStore
	ctx context.Context
}

func newLimitEnv(t *testing.T, enforce bool) *limitEnv {
	t.Helper()
	ms := openMessageStore(t, "limit.db")
	gs := store.NewSQLGroupStore(ms.DB(), ms.DriverName())
	gs.SetForumLimitsEnabled(enforce)
	return &limitEnv{
		t: t, ms: ms, gs: gs,
		us:  store.NewSQLUserStore(ms.DB(), ms.DriverName()),
		es:  store.NewSQLEntitlementStore(ms.DB(), ms.DriverName()),
		ctx: tenantshared.WithTenant(context.Background(), "default"),
	}
}

func (e *limitEnv) user(name string) string {
	e.t.Helper()
	u, err := e.us.Register(name, name, "Secret123!")
	if err != nil {
		e.t.Fatalf("register %s: %v", name, err)
	}
	return u.ID
}

func (e *limitEnv) group(adminID, title string) string {
	e.t.Helper()
	g, err := e.gs.CreateGroup(title, "", "", adminID, "", true, nil)
	if err != nil {
		e.t.Fatalf("buat grup %s: %v", title, err)
	}
	return g.ID
}

func (e *limitEnv) sub(parentID, creatorID, duration string) (*store.GroupDetails, error) {
	return e.gs.CreateSubGroupWithContext(e.ctx, parentID, "Topik", "", creatorID, duration, true)
}

func (e *limitEnv) mustSub(parentID, creatorID, duration string) *store.GroupDetails {
	e.t.Helper()
	g, err := e.sub(parentID, creatorID, duration)
	if err != nil {
		e.t.Fatalf("buat forum: %v", err)
	}
	return g
}

func (e *limitEnv) grantPro(userID string, validUntil *time.Time) {
	e.t.Helper()
	if _, err := e.es.SetEntitlement(e.ctx, store.SetEntitlementInput{
		TenantID: "default", ActorID: "admin", UserID: userID, Plan: entitlement.PlanPro, ValidUntil: validUntil,
	}); err != nil {
		e.t.Fatalf("beri Pro: %v", err)
	}
}

func TestForumLimit_FreeAllowsOneActiveForum(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("free_one")
	g := e.group(u, "Grup A")

	e.mustSub(g, u, "7_days")
	_, err := e.sub(g, u, "7_days")
	if !errors.Is(err, store.ErrForumLimitReached) {
		t.Fatalf("forum kedua harus ditolak ErrForumLimitReached, dapat %v", err)
	}
	var le *store.ForumLimitError
	if !errors.As(err, &le) || le.Plan != entitlement.PlanFree || le.Limit != 1 || le.Active != 1 {
		t.Fatalf("detail batas salah: %+v", le)
	}
}

func TestForumLimit_FreeRejects30DayDuration_ProAllows(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("dur_user")
	g := e.group(u, "Grup D")

	if _, err := e.sub(g, u, "30_days"); !errors.Is(err, store.ErrDurationNotInPlan) {
		t.Fatalf("Free 30 hari harus ErrDurationNotInPlan, dapat %v", err)
	}
	e.grantPro(u, nil)
	if _, err := e.sub(g, u, "30_days"); err != nil {
		t.Fatalf("Pro 30 hari harus diterima: %v", err)
	}
}

func TestForumLimit_ExpiredByTimeFreesSlotWithoutWorker(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("expire_user")
	g := e.group(u, "Grup E")

	first := e.mustSub(g, u, "7_days")
	if _, err := e.sub(g, u, "7_days"); !errors.Is(err, store.ErrForumLimitReached) {
		t.Fatalf("seharusnya penuh, dapat %v", err)
	}
	// Akhiri-manual hanya memajukan expires_at; status baru berubah saat worker. Slot harus langsung bebas.
	if err := e.gs.ExpireSubGroupNow(first.ID); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := e.ms.DB().QueryRow(rebindForTest(e.ms, `SELECT status FROM conversations WHERE id = ?`), first.ID).Scan(&status); err != nil || status != "active" {
		t.Fatalf("prasyarat tes: status seharusnya masih active (worker belum jalan), dapat %q err=%v", status, err)
	}
	if _, err := e.sub(g, u, "7_days"); err != nil {
		t.Fatalf("forum yang lewat expires_at tidak boleh dihitung aktif: %v", err)
	}
}

func TestForumLimit_ProFiveActiveSixthRejected(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("pro_user")
	g := e.group(u, "Grup P")
	e.grantPro(u, nil)

	for i := 0; i < 5; i++ {
		e.mustSub(g, u, "7_days")
	}
	_, err := e.sub(g, u, "7_days")
	var le *store.ForumLimitError
	if !errors.As(err, &le) || le.Plan != entitlement.PlanPro || le.Limit != 5 {
		t.Fatalf("forum ke-6 Pro harus ditolak dengan batas 5, dapat %v", err)
	}
}

func TestForumLimit_CountedPerUserAcrossGroups_OthersUnaffected(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("multi_user")
	other := e.user("other_user")
	g1, g2 := e.group(u, "Grup 1"), e.group(u, "Grup 2")
	g3 := e.group(other, "Grup 3")

	e.mustSub(g1, u, "7_days")
	if _, err := e.sub(g2, u, "7_days"); !errors.Is(err, store.ErrForumLimitReached) {
		t.Fatalf("forum di grup lain tetap dihitung per user, dapat %v", err)
	}
	if _, err := e.sub(g3, other, "7_days"); err != nil {
		t.Fatalf("user lain tidak boleh terpengaruh: %v", err)
	}
}

func TestForumLimit_DisabledKeepsOldBehavior(t *testing.T) {
	e := newLimitEnv(t, false)
	u := e.user("nolimit")
	g := e.group(u, "Grup N")
	for i := 0; i < 3; i++ {
		e.mustSub(g, u, "30_days")
	}
}

func TestForumLimit_DowngradeKeepsExistingBlocksNew(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("down_user")
	g := e.group(u, "Grup Down")
	e.grantPro(u, nil)
	for i := 0; i < 3; i++ {
		e.mustSub(g, u, "7_days")
	}

	if err := e.es.RevokeEntitlement(e.ctx, "default", "admin", u, "uji"); err != nil {
		t.Fatal(err)
	}
	n, err := e.es.CountActiveForums(e.ctx, "default", u)
	if err != nil || n != 3 {
		t.Fatalf("forum yang ada harus tetap aktif setelah downgrade: n=%d err=%v", n, err)
	}
	if _, err := e.sub(g, u, "7_days"); !errors.Is(err, store.ErrForumLimitReached) {
		t.Fatalf("pembuatan baru harus diblokir setelah downgrade, dapat %v", err)
	}
}

func TestForumLimit_ExpiredValidUntilFallsBackToFree(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("lapse_user")
	g := e.group(u, "Grup Lapse")
	soon := time.Now().UTC().Add(time.Hour)
	e.grantPro(u, &soon)
	e.mustSub(g, u, "7_days")
	e.mustSub(g, u, "7_days")

	// Masa berlaku lewat -> Free (tanpa worker).
	if _, err := e.ms.DB().Exec(rebindForTest(e.ms, `UPDATE user_entitlements SET valid_until = ? WHERE user_id = ?`),
		time.Now().UTC().Add(-time.Minute), u); err != nil {
		t.Fatal(err)
	}
	if _, err := e.sub(g, u, "7_days"); !errors.Is(err, store.ErrForumLimitReached) {
		t.Fatalf("Pro yang lewat masa berlaku harus diperlakukan Free, dapat %v", err)
	}
	st, err := e.es.GetEntitlement(e.ctx, "default", u)
	if err != nil || st.EffectivePlan(time.Now().UTC()) != entitlement.PlanFree {
		t.Fatalf("EffectivePlan harus free: %+v err=%v", st, err)
	}
}

func TestForumLimit_ConcurrentCreatesRespectLimit(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("race_user")
	g := e.group(u, "Grup Race")
	// Perlebar jendela hitung-lalu-simpan; tanpa penguncian per user tes ini gagal (diverifikasi saat penulisan).
	store.SetForumLimitAfterCountHook(func() { time.Sleep(40 * time.Millisecond) })
	t.Cleanup(func() { store.SetForumLimitAfterCountHook(nil) })

	var ok, limited, other int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := e.sub(g, u, "7_days")
			switch {
			case err == nil:
				atomic.AddInt32(&ok, 1)
			case errors.Is(err, store.ErrForumLimitReached):
				atomic.AddInt32(&limited, 1)
			default:
				atomic.AddInt32(&other, 1)
				t.Logf("galat tak terduga: %v", err)
			}
		}()
	}
	close(start)
	wg.Wait()
	if ok != 1 || limited != 19 || other != 0 {
		t.Fatalf("20 request bersamaan harus menghasilkan tepat 1 forum: ok=%d limited=%d other=%d", ok, limited, other)
	}
	if n, _ := e.es.CountActiveForums(e.ctx, "default", u); n != 1 {
		t.Fatalf("jumlah forum aktif harus 1, dapat %d", n)
	}
}

func TestForumLimit_NonDefaultTenantNotEnforced(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("b2b_user")
	g := e.group(u, "Grup B2B")
	if _, err := e.ms.DB().Exec(rebindForTest(e.ms, `UPDATE conversations SET tenant_id = ? WHERE id = ?`), "acme", g); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		e.mustSub(g, u, "7_days")
	}
}

func TestEntitlementStore_SetRevokeAndAudit(t *testing.T) {
	e := newLimitEnv(t, true)
	u := e.user("ent_user")

	if _, err := e.es.SetEntitlement(e.ctx, store.SetEntitlementInput{TenantID: "default", ActorID: "admin", UserID: "tidak-ada", Plan: "pro"}); !errors.Is(err, store.ErrEntitlementUserNotFound) {
		t.Fatalf("user tidak ada harus ErrEntitlementUserNotFound, dapat %v", err)
	}
	if _, err := e.es.SetEntitlement(e.ctx, store.SetEntitlementInput{TenantID: "default", ActorID: "admin", UserID: u, Plan: "platinum"}); !errors.Is(err, store.ErrEntitlementInvalid) {
		t.Fatalf("paket tak dikenal harus ErrEntitlementInvalid, dapat %v", err)
	}
	past := time.Now().UTC().Add(-time.Hour)
	if _, err := e.es.SetEntitlement(e.ctx, store.SetEntitlementInput{TenantID: "default", ActorID: "admin", UserID: u, Plan: "pro", ValidUntil: &past}); !errors.Is(err, store.ErrEntitlementInvalid) {
		t.Fatalf("masa berlaku lampau harus ErrEntitlementInvalid, dapat %v", err)
	}

	until := time.Now().UTC().Add(60 * 24 * time.Hour)
	got, err := e.es.SetEntitlement(e.ctx, store.SetEntitlementInput{TenantID: "default", ActorID: "admin", UserID: u, Plan: "PRO", ValidUntil: &until, Source: entitlement.SourceGrandfather, Note: "pengguna lama"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Plan != "pro" || got.Source != entitlement.SourceGrandfather || got.ValidUntil == nil || got.GrantedBy != "admin" {
		t.Fatalf("entitlement tersimpan salah: %+v", got)
	}
	if got.EffectivePlan(time.Now().UTC()) != entitlement.PlanPro {
		t.Fatal("paket seharusnya Pro")
	}
	if other, _ := e.es.GetEntitlement(e.ctx, "acme", u); other != nil {
		t.Fatal("entitlement tidak boleh terbaca dari tenant lain")
	}

	if err := e.es.RevokeEntitlement(e.ctx, "default", "admin", u, "selesai"); err != nil {
		t.Fatal(err)
	}
	after, _ := e.es.GetEntitlement(e.ctx, "default", u)
	if after == nil || after.EffectivePlan(time.Now().UTC()) != entitlement.PlanFree {
		t.Fatalf("setelah dicabut harus Free: %+v", after)
	}

	var events int
	if err := e.ms.DB().QueryRow(rebindForTest(e.ms, `SELECT COUNT(*) FROM entitlement_events WHERE user_id = ?`), u).Scan(&events); err != nil || events != 2 {
		t.Fatalf("riwayat harus mencatat set + revoke: events=%d err=%v", events, err)
	}
}

// rebindForTest mengubah ? menjadi $n untuk Postgres.
func rebindForTest(ms *store.SQLMessageStore, q string) string {
	if ms.DriverName() != "postgres" {
		return q
	}
	var b strings.Builder
	n := 0
	for _, r := range q {
		if r == '?' {
			n++
			b.WriteString("$" + strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
