package api_test

import (
	"net/http"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Peran di token hanya klaim saat login. Setelah dicabut di database, akses staf harus hilang tanpa menunggu token habis.
func TestRoleVerification_DemotionTakesEffectWithoutTokenExpiry(t *testing.T) {
	e := newModEnv(t)
	policy := authz.NewRolePolicy(e.mod)
	auth.SetRoleResolver(policy)
	t.Cleanup(func() { auth.SetRoleResolver(nil) })
	rep := api.NewReportHandler(e.reports)

	mod := e.user("mod")
	e.exec(`UPDATE users SET system_role = 'wuzz_moderator' WHERE id = ?`, mod.ID)
	tok := e.token(mod, "default", "wuzz_moderator") // token diterbitkan SAAT masih moderator

	list := func() int {
		return e.call(http.MethodGet, "/api/admin/reports", "", tok, e.handler.HandleReports).Code
	}
	oldList := func() int { // jalur laporan lama memakai pemeriksaan staf yang sama
		return e.call(http.MethodGet, "/api/reports", "", tok, rep.Handle).Code
	}
	if list() != http.StatusOK || oldList() != http.StatusOK {
		t.Fatal("moderator sah harus diterima di kedua jalur")
	}

	// Dicabut di database: token yang sama harus ditolak (setelah cache dibuang / TTL).
	e.exec(`UPDATE users SET system_role = 'user' WHERE id = ?`, mod.ID)
	policy.Invalidate(mod.ID)
	if c := list(); c != http.StatusForbidden {
		t.Fatalf("setelah dicabut, token lama harus 403 (alat moderasi), got %d", c)
	}
	if c := oldList(); c != http.StatusForbidden {
		t.Fatalf("setelah dicabut, token lama harus 403 (laporan lama), got %d", c)
	}
	if c := e.action(tok, "rpt_x", "dismiss", ""); c.Code != http.StatusForbidden {
		t.Fatalf("aksi moderasi setelah dicabut: want 403, got %d", c.Code)
	}

	// Diangkat lagi di database: token lama berfungsi lagi (database sumber kebenaran), tanpa login ulang.
	e.exec(`UPDATE users SET system_role = 'wuzz_admin' WHERE id = ?`, mod.ID)
	policy.Invalidate(mod.ID)
	if c := list(); c != http.StatusOK {
		t.Fatalf("diangkat lagi: want 200, got %d", c)
	}
}

func TestRoleVerification_TokenCannotSelfPromote(t *testing.T) {
	e := newModEnv(t)
	auth.SetRoleResolver(authz.NewRolePolicy(e.mod))
	t.Cleanup(func() { auth.SetRoleResolver(nil) })

	// Pengguna biasa di database yang memegang token ber-klaim moderator (mis. token dipalsukan/kunci bocor tidak
	// relevan di sini; yang diuji: klaim tanpa dukungan database tidak cukup).
	plain := e.user("plain")
	forged := e.token(plain, "default", "wuzz_moderator")
	if c := e.call(http.MethodGet, "/api/admin/reports", "", forged, e.handler.HandleReports).Code; c != http.StatusForbidden {
		t.Fatalf("klaim moderator tanpa dukungan database: want 403, got %d", c)
	}
	// Sebaliknya: database sudah staf tetapi token lama berperan user -> tetap ditolak sampai login ulang.
	e.exec(`UPDATE users SET system_role = 'wuzz_moderator' WHERE id = ?`, plain.ID)
	old := e.token(plain, "default", "user")
	if c := e.call(http.MethodGet, "/api/admin/reports", "", old, e.handler.HandleReports).Code; c != http.StatusForbidden {
		t.Fatalf("token berperan user tidak boleh naik tanpa login ulang: got %d", c)
	}
}

func TestSQLModerationStore_SystemRoleOf(t *testing.T) {
	e := newModEnv(t)
	u := e.user("x")
	if r, err := e.mod.SystemRoleOf(t.Context(), u.ID); err != nil || r != "user" {
		t.Fatalf("default: %q %v", r, err)
	}
	e.exec(`UPDATE users SET system_role = 'wuzz_admin' WHERE id = ?`, u.ID)
	if r, _ := e.mod.SystemRoleOf(t.Context(), u.ID); r != store.SystemRoleWuzzAdmin {
		t.Fatalf("admin: %q", r)
	}
	if r, err := e.mod.SystemRoleOf(t.Context(), "tidak-ada"); err != nil || r != "user" {
		t.Fatalf("akun tidak ada harus user tanpa galat: %q %v", r, err)
	}
}
