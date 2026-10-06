package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type staffEnv struct {
	*modEnv
	policy *authz.RolePolicy
	admin  *store.User
	adminT string
	modT   string
	modUsr *store.User
}

// newStaffEnv menyiapkan satu admin dan satu moderator di DATABASE, dengan resolver peran terpasang (seperti produksi).
func newStaffEnv(t *testing.T) *staffEnv {
	t.Helper()
	e := &staffEnv{modEnv: newModEnv(t)}
	e.policy = authz.NewRolePolicy(e.mod)
	auth.SetRoleResolver(e.policy)
	t.Cleanup(func() { auth.SetRoleResolver(nil) })
	e.handler.SetRolePolicy(e.policy)
	e.admin, e.modUsr = e.user("boss"), e.user("modok")
	e.exec(`UPDATE users SET system_role = 'wuzz_admin' WHERE id = ?`, e.admin.ID)
	e.exec(`UPDATE users SET system_role = 'wuzz_moderator' WHERE id = ?`, e.modUsr.ID)
	e.adminT = e.token(e.admin, "default", "wuzz_admin")
	e.modT = e.token(e.modUsr, "default", "wuzz_moderator")
	return e
}

func (e *staffEnv) staffCall(method, path, body, tok string) *responseSnap {
	w := e.call(method, path, body, tok, e.handler.HandleStaff)
	return &responseSnap{Code: w.Code, Body: w.Body.String()}
}

type responseSnap struct {
	Code int
	Body string
}

func (e *staffEnv) role(userID string) string {
	var r string
	_ = e.sqlStore.DB().QueryRow(e.rb(`SELECT system_role FROM users WHERE id = ?`), userID).Scan(&r)
	return r
}

func (e *staffEnv) auditCount(action, userID string) int {
	var n int
	_ = e.sqlStore.DB().QueryRow(e.rb(`SELECT COUNT(*) FROM moderation_actions WHERE action = ? AND target_user_id = ?`), action, userID).Scan(&n)
	return n
}

func TestStaff_OnlyAdminsMayManageStaff(t *testing.T) {
	e := newStaffEnv(t)
	plain := e.user("plain")
	plainT := e.token(plain, "default", "user")
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/admin/staff"},
		{http.MethodGet, "/api/admin/staff/lookup?username=plain"},
		{http.MethodPost, "/api/admin/staff/" + plain.ID + "/grant"},
		{http.MethodPost, "/api/admin/staff/" + e.modUsr.ID + "/revoke"},
	} {
		if c := e.staffCall(tc.method, tc.path, `{}`, "").Code; c != http.StatusUnauthorized {
			t.Errorf("%s %s tanpa token: want 401, got %d", tc.method, tc.path, c)
		}
		if c := e.staffCall(tc.method, tc.path, `{}`, plainT).Code; c != http.StatusForbidden {
			t.Errorf("%s %s user biasa: want 403, got %d", tc.method, tc.path, c)
		}
		// Moderator biasa TIDAK boleh mengelola staf.
		if c := e.staffCall(tc.method, tc.path, `{}`, e.modT).Code; c != http.StatusForbidden {
			t.Errorf("%s %s moderator: want 403, got %d", tc.method, tc.path, c)
		}
	}
	if e.role(plain.ID) != "user" || e.role(e.modUsr.ID) != "wuzz_moderator" {
		t.Fatal("percobaan yang ditolak tidak boleh mengubah peran")
	}
	if e.auditCount("grant_moderator", plain.ID) != 0 {
		t.Fatal("percobaan ditolak tidak boleh tercatat")
	}
}

func TestStaff_ListAndLookup(t *testing.T) {
	e := newStaffEnv(t)
	e.user("Plain_User")
	// Akun Google-only (tanpa password) dan akun ditangguhkan.
	go1 := e.user("googler")
	e.exec(`UPDATE users SET password_hash = '' WHERE id = ?`, go1.ID)

	w := e.staffCall(http.MethodGet, "/api/admin/staff", "", e.adminT)
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d %s", w.Code, w.Body)
	}
	var list struct {
		Staff []store.StaffMember `json:"staff"`
	}
	_ = json.Unmarshal([]byte(w.Body), &list)
	if len(list.Staff) != 2 || list.Staff[0].SystemRole != "wuzz_admin" || list.Staff[1].SystemRole != "wuzz_moderator" {
		t.Fatalf("daftar harus admin lalu moderator saja: %+v", list.Staff)
	}
	if strings.Contains(w.Body, "password") && strings.Contains(w.Body, "hash") {
		t.Fatalf("hash password tidak boleh bocor: %s", w.Body)
	}

	// Lookup tidak membedakan huruf besar/kecil dan menampilkan has_password.
	w = e.staffCall(http.MethodGet, "/api/admin/staff/lookup?username=plain_user", "", e.adminT)
	if w.Code != http.StatusOK || !strings.Contains(w.Body, `"username":"Plain_User"`) {
		t.Fatalf("lookup: %d %s", w.Code, w.Body)
	}
	w = e.staffCall(http.MethodGet, "/api/admin/staff/lookup?username=googler", "", e.adminT)
	if !strings.Contains(w.Body, `"has_password":false`) {
		t.Fatalf("akun Google-only harus has_password=false: %s", w.Body)
	}
	if c := e.staffCall(http.MethodGet, "/api/admin/staff/lookup?username=tidak_ada", "", e.adminT).Code; c != http.StatusNotFound {
		t.Fatalf("tak ada: want 404, got %d", c)
	}
	if c := e.staffCall(http.MethodGet, "/api/admin/staff/lookup", "", e.adminT).Code; c != http.StatusBadRequest {
		t.Fatalf("tanpa username: want 400, got %d", c)
	}
}

func TestStaff_GrantAndRevokeTakeEffectImmediately(t *testing.T) {
	e := newStaffEnv(t)
	cand := e.user("kandidat")
	candOld := e.token(cand, "default", "user") // token lama berperan user

	w := e.staffCall(http.MethodPost, "/api/admin/staff/"+cand.ID+"/grant", `{"note":"dipercaya"}`, e.adminT)
	if w.Code != http.StatusOK || !strings.Contains(w.Body, `"system_role":"wuzz_moderator"`) {
		t.Fatalf("grant: %d %s", w.Code, w.Body)
	}
	if e.role(cand.ID) != "wuzz_moderator" || e.auditCount("grant_moderator", cand.ID) != 1 {
		t.Fatal("peran dan audit harus tercatat")
	}
	// Token lama (berperan user) tidak naik sendiri: harus login ulang.
	if c := e.call(http.MethodGet, "/api/admin/reports", "", candOld, e.handler.HandleReports).Code; c != http.StatusForbidden {
		t.Fatalf("token lama tidak boleh naik tanpa login ulang: got %d", c)
	}
	// Setelah login ulang (token baru berperan moderator) -> bisa memakai alat moderasi, tetapi tidak mengelola staf.
	candNew := e.token(cand, "default", "wuzz_moderator")
	if c := e.call(http.MethodGet, "/api/admin/reports", "", candNew, e.handler.HandleReports).Code; c != http.StatusOK {
		t.Fatalf("moderator baru: want 200, got %d", c)
	}
	if c := e.staffCall(http.MethodGet, "/api/admin/staff", "", candNew).Code; c != http.StatusForbidden {
		t.Fatalf("moderator tidak boleh mengelola staf: got %d", c)
	}
	// Mengangkat ulang ditolak (409).
	if c := e.staffCall(http.MethodPost, "/api/admin/staff/"+cand.ID+"/grant", `{}`, e.adminT).Code; c != http.StatusConflict {
		t.Fatalf("angkat ulang: want 409, got %d", c)
	}

	// Cabut: berlaku seketika untuk token yang sama (cache dibuang), tanpa mencabut token.
	if w := e.staffCall(http.MethodPost, "/api/admin/staff/"+cand.ID+"/revoke", `{"note":"selesai tugas"}`, e.adminT); w.Code != http.StatusOK {
		t.Fatalf("revoke: %d %s", w.Code, w.Body)
	}
	if e.role(cand.ID) != "user" || e.auditCount("revoke_moderator", cand.ID) != 1 {
		t.Fatal("peran dan audit pencabutan harus tercatat")
	}
	if c := e.call(http.MethodGet, "/api/admin/reports", "", candNew, e.handler.HandleReports).Code; c != http.StatusForbidden {
		t.Fatalf("setelah dicabut token yang sama harus 403 seketika, got %d", c)
	}
	// Mencabut yang bukan moderator ditolak.
	if c := e.staffCall(http.MethodPost, "/api/admin/staff/"+cand.ID+"/revoke", `{}`, e.adminT).Code; c != http.StatusConflict {
		t.Fatalf("cabut ulang: want 409, got %d", c)
	}
}

func TestStaff_Protections(t *testing.T) {
	e := newStaffEnv(t)
	admin2 := e.user("boss2")
	e.exec(`UPDATE users SET system_role = 'wuzz_admin' WHERE id = ?`, admin2.ID)
	susp := e.user("disuspend")
	e.exec(`UPDATE users SET suspended_at = CURRENT_TIMESTAMP WHERE id = ?`, susp.ID)

	// Diri sendiri.
	for _, op := range []string{"grant", "revoke"} {
		if c := e.staffCall(http.MethodPost, "/api/admin/staff/"+e.admin.ID+"/"+op, `{}`, e.adminT).Code; c != http.StatusForbidden {
			t.Errorf("%s diri sendiri: want 403, got %d", op, c)
		}
	}
	// Admin lain tidak bisa dicabut lewat alat ini dan tidak bisa "diangkat" ulang.
	if c := e.staffCall(http.MethodPost, "/api/admin/staff/"+admin2.ID+"/revoke", `{}`, e.adminT).Code; c != http.StatusConflict {
		t.Fatalf("cabut admin lain: want 409, got %d", c)
	}
	if e.role(admin2.ID) != "wuzz_admin" {
		t.Fatal("peran admin lain tidak boleh berubah")
	}
	// Akun ditangguhkan tidak boleh diangkat.
	if c := e.staffCall(http.MethodPost, "/api/admin/staff/"+susp.ID+"/grant", `{}`, e.adminT).Code; c != http.StatusConflict {
		t.Fatalf("angkat akun ditangguhkan: want 409, got %d", c)
	}
	// Akun tidak ada, dan catatan terlalu panjang.
	if c := e.staffCall(http.MethodPost, "/api/admin/staff/tidak-ada/grant", `{}`, e.adminT).Code; c != http.StatusNotFound {
		t.Fatalf("akun tak ada: want 404, got %d", c)
	}
	long := `{"note":"` + strings.Repeat("x", 600) + `"}`
	plain := e.user("p2")
	if c := e.staffCall(http.MethodPost, "/api/admin/staff/"+plain.ID+"/grant", long, e.adminT).Code; c != http.StatusBadRequest {
		t.Fatalf("catatan panjang: want 400, got %d", c)
	}
	if e.role(plain.ID) != "user" {
		t.Fatal("gagal validasi tidak boleh mengubah peran")
	}
	// Metode salah.
	if c := e.staffCall(http.MethodGet, "/api/admin/staff/"+plain.ID+"/grant", "", e.adminT).Code; c != http.StatusNotFound {
		t.Fatalf("GET grant: want 404, got %d", c)
	}
}

func TestStaff_CrossTenantGrantIsNotFound(t *testing.T) {
	e := newStaffEnv(t)
	other := e.user("tenantlain")
	e.exec(`UPDATE users SET tenant_id = 'tenant_x' WHERE id = ?`, other.ID)
	if c := e.staffCall(http.MethodPost, "/api/admin/staff/"+other.ID+"/grant", `{}`, e.adminT).Code; c != http.StatusNotFound {
		t.Fatalf("akun tenant lain: want 404, got %d", c)
	}
	if e.role(other.ID) != "user" {
		t.Fatal("akun tenant lain tidak boleh berubah")
	}
	if c := e.staffCall(http.MethodGet, "/api/admin/staff/lookup?username=tenantlain", "", e.adminT).Code; c != http.StatusNotFound {
		t.Fatalf("lookup lintas tenant: want 404, got %d", c)
	}
}
