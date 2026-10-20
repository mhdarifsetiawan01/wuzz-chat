package store_test

import (
	"errors"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/entitlement"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func usernames(cs []store.GrandfatherCandidate) map[string]bool {
	m := map[string]bool{}
	for _, c := range cs {
		m[c.Username] = true
	}
	return m
}

// gfWorld: creator (pembuat grup), adm (admin grup), member (anggota biasa), loner (tanpa grup),
// manual (pembuat grup yang sudah diberi paket manual), revoked (pembuat grup yang paketnya dicabut).
func newGrandfatherWorld(t *testing.T) (*limitEnv, map[string]string) {
	t.Helper()
	e := newLimitEnv(t, false)
	ids := map[string]string{}
	for _, n := range []string{"gf_creator", "gf_admin", "gf_member", "gf_loner", "gf_manual", "gf_revoked"} {
		ids[n] = e.user(n)
	}
	g := e.group(ids["gf_creator"], "Grup GF")
	if err := e.gs.AddGroupMembers(g, ids["gf_creator"], []string{ids["gf_admin"], ids["gf_member"]}); err != nil {
		t.Fatal(err)
	}
	if err := e.gs.UpdateMemberRole(g, ids["gf_creator"], ids["gf_admin"], "admin"); err != nil {
		t.Fatal(err)
	}
	e.group(ids["gf_manual"], "Grup Manual")
	e.group(ids["gf_revoked"], "Grup Dicabut")
	e.grantPro(ids["gf_manual"], nil)
	e.grantPro(ids["gf_revoked"], nil)
	if err := e.es.RevokeEntitlement(e.ctx, "default", "admin", ids["gf_revoked"], "sengaja"); err != nil {
		t.Fatal(err)
	}
	return e, ids
}

func TestGrandfather_PreviewSelectsOnlyGroupCreatorsAndAdminsWithoutEntitlement(t *testing.T) {
	e, _ := newGrandfatherWorld(t)
	cs, err := e.es.PreviewGrandfather(e.ctx, "default")
	if err != nil {
		t.Fatal(err)
	}
	got := usernames(cs)
	if len(cs) != 2 || !got["gf_creator"] || !got["gf_admin"] {
		t.Fatalf("hanya pembuat dan admin grup tanpa baris entitlement yang memenuhi syarat, dapat %v", got)
	}
	// Pratinjau tidak menulis apa pun.
	var n int
	if err := e.ms.DB().QueryRow(`SELECT COUNT(*) FROM user_entitlements WHERE source = 'grandfather'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("pratinjau tidak boleh menulis: n=%d err=%v", n, err)
	}
}

func TestGrandfather_ApplyIsIdempotentAndRespectsExistingRows(t *testing.T) {
	e, ids := newGrandfatherWorld(t)
	until := time.Now().UTC().Add(60 * 24 * time.Hour)

	applied, err := e.es.ApplyGrandfather(e.ctx, "default", "admin-1", until, "pengguna lama", 2)
	if err != nil || applied != 2 {
		t.Fatalf("harus menerapkan 2: applied=%d err=%v", applied, err)
	}
	for _, name := range []string{"gf_creator", "gf_admin"} {
		ent, err := e.es.GetEntitlement(e.ctx, "default", ids[name])
		if err != nil || ent == nil {
			t.Fatalf("%s harus punya entitlement: %v", name, err)
		}
		if ent.Plan != entitlement.PlanPro || ent.Source != entitlement.SourceGrandfather || ent.GrantedBy != "admin-1" ||
			ent.ValidUntil == nil || ent.ValidUntil.Sub(until).Abs() > time.Second {
			t.Fatalf("%s: entitlement salah: %+v", name, ent)
		}
		if ent.EffectivePlan(time.Now().UTC()) != entitlement.PlanPro {
			t.Fatalf("%s harus Pro", name)
		}
	}
	// Anggota biasa dan akun tanpa grup tetap Free; paket manual/dicabut tidak disentuh.
	for _, name := range []string{"gf_member", "gf_loner"} {
		if ent, _ := e.es.GetEntitlement(e.ctx, "default", ids[name]); ent != nil {
			t.Fatalf("%s tidak boleh dapat entitlement: %+v", name, ent)
		}
	}
	if ent, _ := e.es.GetEntitlement(e.ctx, "default", ids["gf_manual"]); ent.Source != entitlement.SourceManual {
		t.Fatalf("paket manual tidak boleh ditimpa: %+v", ent)
	}
	if ent, _ := e.es.GetEntitlement(e.ctx, "default", ids["gf_revoked"]); ent.Status != entitlement.StatusRevoked {
		t.Fatalf("paket yang dicabut sengaja tidak boleh dihidupkan lagi: %+v", ent)
	}

	// Riwayat mencatat aktor dan sumber.
	var events int
	if err := e.ms.DB().QueryRow(rebindForTest(e.ms, `SELECT COUNT(*) FROM entitlement_events WHERE source = ? AND actor_id = ?`), entitlement.SourceGrandfather, "admin-1").Scan(&events); err != nil || events != 2 {
		t.Fatalf("riwayat harus mencatat 2 event grandfather: %d %v", events, err)
	}

	// Menjalankan ulang: tidak ada lagi yang memenuhi syarat.
	if cs, _ := e.es.PreviewGrandfather(e.ctx, "default"); len(cs) != 0 {
		t.Fatalf("setelah diterapkan tidak ada kandidat: %v", cs)
	}
	if n, err := e.es.ApplyGrandfather(e.ctx, "default", "admin-1", until, "", 0); err != nil || n != 0 {
		t.Fatalf("jalan ulang harus 0: n=%d err=%v", n, err)
	}
}

func TestGrandfather_ExpectedCountMismatchWritesNothing(t *testing.T) {
	e, _ := newGrandfatherWorld(t)
	until := time.Now().UTC().Add(24 * time.Hour)
	for _, wrong := range []int{0, 1, 3, 100} {
		if _, err := e.es.ApplyGrandfather(e.ctx, "default", "admin-1", until, "", wrong); !errors.Is(err, store.ErrGrandfatherCountChanged) {
			t.Fatalf("expected=%d harus ErrGrandfatherCountChanged, dapat %v", wrong, err)
		}
	}
	var n int
	if err := e.ms.DB().QueryRow(`SELECT COUNT(*) FROM user_entitlements WHERE source = 'grandfather'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("tidak boleh ada yang tertulis: n=%d err=%v", n, err)
	}
	if _, err := e.es.ApplyGrandfather(e.ctx, "default", "admin-1", time.Now().UTC().Add(-time.Hour), "", 2); !errors.Is(err, store.ErrEntitlementInvalid) {
		t.Fatalf("masa berlaku lampau harus ditolak: %v", err)
	}
}

func TestGrandfather_OtherTenantExcludedAndSubgroupCreatorsIncluded(t *testing.T) {
	e := newLimitEnv(t, false)
	a, b := e.user("gf_tenant_a"), e.user("gf_tenant_b")
	e.group(a, "Grup A")
	gb := e.group(b, "Grup B")
	if _, err := e.ms.DB().Exec(rebindForTest(e.ms, `UPDATE users SET tenant_id = ? WHERE id = ?`), "acme", b); err != nil {
		t.Fatal(err)
	}
	if _, err := e.ms.DB().Exec(rebindForTest(e.ms, `UPDATE conversations SET tenant_id = ? WHERE id = ?`), "acme", gb); err != nil {
		t.Fatal(err)
	}
	cs, _ := e.es.PreviewGrandfather(e.ctx, "default")
	if got := usernames(cs); len(cs) != 1 || !got["gf_tenant_a"] {
		t.Fatalf("hanya akun tenant default: %v", got)
	}

	// Pembuat forum yang bukan admin grup lagi (peran diturunkan) tetap memenuhi syarat karena sudah pernah membuat forum.
	c := e.user("gf_sub_only")
	gc := e.group(a, "Grup C")
	if err := e.gs.AddGroupMembers(gc, a, []string{c}); err != nil {
		t.Fatal(err)
	}
	if err := e.gs.UpdateMemberRole(gc, a, c, "admin"); err != nil {
		t.Fatal(err)
	}
	e.mustSub(gc, c, "7_days")
	if err := e.gs.UpdateMemberRole(gc, a, c, "member"); err != nil {
		t.Fatal(err)
	}
	cs, _ = e.es.PreviewGrandfather(e.ctx, "default")
	if got := usernames(cs); !got["gf_sub_only"] {
		t.Fatalf("pembuat forum harus memenuhi syarat walau peran sudah turun: %v", got)
	}
}
