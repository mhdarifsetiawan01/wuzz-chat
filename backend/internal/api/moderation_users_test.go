package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func (e *modEnv) usersCall(method, path, body, tok string) (int, string) {
	w := e.call(method, path, body, tok, e.handler.HandleUser)
	return w.Code, w.Body.String()
}

func TestModerationUsers_ListDetailAndAccess(t *testing.T) {
	e := newModEnv(t)
	admin, mod, target := e.user("adm"), e.user("modr"), e.user("budi_x")
	plain := e.user("plain")
	e.exec(`UPDATE users SET system_role = 'wuzz_admin' WHERE id = ?`, admin.ID)
	e.exec(`UPDATE users SET system_role = 'wuzz_moderator' WHERE id = ?`, mod.ID)
	adminTok, modTok := e.token(admin, "default", "wuzz_admin"), e.token(mod, "default", "wuzz_moderator")
	e.report(plain, "user", target.ID, target.ID, "spam", "")

	if c, _ := e.usersCall(http.MethodGet, "/api/admin/users", "", ""); c != http.StatusUnauthorized {
		t.Fatalf("tanpa token: %d", c)
	}
	if c, _ := e.usersCall(http.MethodGet, "/api/admin/users", "", e.token(plain, "default", "user")); c != http.StatusForbidden {
		t.Fatalf("user biasa: %d", c)
	}

	c, body := e.usersCall(http.MethodGet, "/api/admin/users?q=BUDI_", "", modTok)
	if c != http.StatusOK {
		t.Fatalf("list: %d %s", c, body)
	}
	var list struct {
		Users []store.UserSummary `json:"users"`
	}
	_ = json.Unmarshal([]byte(body), &list)
	if len(list.Users) != 1 || list.Users[0].ID != target.ID {
		t.Fatalf("pencarian harus menemukan satu akun: %s", body)
	}
	// "_" harus dibaca harfiah, bukan wildcard.
	if _, body = e.usersCall(http.MethodGet, "/api/admin/users?q=budi%5F", "", modTok); !strings.Contains(body, target.ID) {
		t.Fatalf("underscore harfiah: %s", body)
	}
	if _, body = e.usersCall(http.MethodGet, "/api/admin/users?q=b_d", "", modTok); strings.Contains(body, target.ID) {
		t.Fatalf("_ tidak boleh jadi wildcard: %s", body)
	}
	if c, _ = e.usersCall(http.MethodGet, "/api/admin/users?status=ngawur", "", modTok); c != http.StatusBadRequest {
		t.Fatalf("status tidak valid: %d", c)
	}

	c, body = e.usersCall(http.MethodGet, "/api/admin/users/"+target.ID, "", modTok)
	var d store.UserDetail
	_ = json.Unmarshal([]byte(body), &d)
	if c != http.StatusOK || d.ReportsAgainst != 1 || d.OpenReports != 1 || d.User.Username != "budi_x" {
		t.Fatalf("detail: %d %s", c, body)
	}
	if strings.Contains(body, "password") && strings.Contains(body, "$2a$") {
		t.Fatalf("hash tidak boleh bocor: %s", body)
	}
	if c, _ = e.usersCall(http.MethodGet, "/api/admin/users/tidak-ada", "", modTok); c != http.StatusNotFound {
		t.Fatalf("tidak ada: %d", c)
	}
	_ = adminTok
}

func TestModerationUsers_SuspendRevokeDelete(t *testing.T) {
	e := newModEnv(t)
	admin, mod, target, other := e.user("adm"), e.user("modr"), e.user("korban"), e.user("lain")
	e.exec(`UPDATE users SET system_role = 'wuzz_admin' WHERE id = ?`, admin.ID)
	e.exec(`UPDATE users SET system_role = 'wuzz_moderator' WHERE id = ?`, mod.ID)
	adminTok, modTok := e.token(admin, "default", "wuzz_admin"), e.token(mod, "default", "wuzz_moderator")
	base := "/api/admin/users/" + target.ID

	// Suspend: catatan wajib, staf dan diri sendiri dilindungi, koneksi diputus.
	if c, _ := e.usersCall(http.MethodPost, base+"/suspend", `{}`, modTok); c != http.StatusBadRequest {
		t.Fatalf("suspend tanpa catatan: %d", c)
	}
	if c, _ := e.usersCall(http.MethodPost, "/api/admin/users/"+admin.ID+"/suspend", `{"note":"x"}`, modTok); c != http.StatusForbidden {
		t.Fatalf("suspend admin: %d", c)
	}
	if c, _ := e.usersCall(http.MethodPost, "/api/admin/users/"+mod.ID+"/suspend", `{"note":"x"}`, modTok); c != http.StatusForbidden {
		t.Fatalf("suspend diri sendiri: %d", c)
	}
	if c, b := e.usersCall(http.MethodPost, base+"/suspend", `{"note":"spam berulang"}`, modTok); c != http.StatusOK {
		t.Fatalf("suspend: %d %s", c, b)
	}
	if len(e.kicked) != 1 || !strings.HasPrefix(e.kicked[0], target.ID+"|ACCOUNT_SUSPENDED") {
		t.Fatalf("koneksi harus diputus: %v", e.kicked)
	}
	if s, _ := e.mod.IsSuspended(t.Context(), target.ID); !s {
		t.Fatal("akun harus ditangguhkan")
	}
	if _, b := e.usersCall(http.MethodGet, "/api/admin/users?status=suspended", "", modTok); !strings.Contains(b, target.ID) {
		t.Fatalf("filter suspended: %s", b)
	}
	if c, _ := e.usersCall(http.MethodPost, base+"/unsuspend", `{"note":"banding diterima"}`, modTok); c != http.StatusOK {
		t.Fatalf("unsuspend: %d", c)
	}

	// Cabut sesi dan hapus akun: khusus admin.
	if c, _ := e.usersCall(http.MethodPost, base+"/revoke-sessions", `{"note":"x"}`, modTok); c != http.StatusForbidden {
		t.Fatalf("moderator cabut sesi: %d", c)
	}
	if c, _ := e.usersCall(http.MethodDelete, base, `{"note":"x","confirm_username":"korban"}`, modTok); c != http.StatusForbidden {
		t.Fatalf("moderator hapus: %d", c)
	}
	if c, b := e.usersCall(http.MethodPost, base+"/revoke-sessions", `{"note":"akun diretas"}`, adminTok); c != http.StatusOK {
		t.Fatalf("cabut sesi: %d %s", c, b)
	}

	// Hapus: tanpa eraser = 501; konfirmasi salah ditolak; staf dan diri sendiri dilindungi.
	if c, _ := e.usersCall(http.MethodDelete, base, `{"note":"x","confirm_username":"korban"}`, adminTok); c != http.StatusNotImplemented {
		t.Fatalf("tanpa eraser: %d", c)
	}
	e.handler.SetAccountEraser(store.NewSQLAccountEraser(e.sqlStore.DB(), e.driver))
	if c, _ := e.usersCall(http.MethodDelete, base, `{"confirm_username":"korban"}`, adminTok); c != http.StatusBadRequest {
		t.Fatalf("tanpa catatan: %d", c)
	}
	if c, _ := e.usersCall(http.MethodDelete, base, `{"note":"x","confirm_username":"salah"}`, adminTok); c != http.StatusBadRequest {
		t.Fatalf("konfirmasi salah: %d", c)
	}
	if c, _ := e.usersCall(http.MethodDelete, "/api/admin/users/"+mod.ID, `{"note":"x","confirm_username":"modr"}`, adminTok); c != http.StatusForbidden {
		t.Fatalf("hapus staf: %d", c)
	}
	if c, _ := e.usersCall(http.MethodDelete, "/api/admin/users/"+admin.ID, `{"note":"x","confirm_username":"adm"}`, adminTok); c != http.StatusForbidden {
		t.Fatalf("hapus diri sendiri: %d", c)
	}
	// Tenant lain tidak boleh menyentuh akun ini.
	otherTenant := e.token(admin, "tenant-lain", "wuzz_admin")
	if c, _ := e.usersCall(http.MethodDelete, base, `{"note":"x","confirm_username":"korban"}`, otherTenant); c != http.StatusNotFound {
		t.Fatalf("lintas tenant: %d", c)
	}
	e.kicked = nil
	if c, b := e.usersCall(http.MethodDelete, base, `{"note":"akun uji","confirm_username":"KORBAN"}`, adminTok); c != http.StatusOK {
		t.Fatalf("hapus: %d %s", c, b)
	}
	if len(e.kicked) != 1 || !strings.Contains(e.kicked[0], "ACCOUNT_DELETED") {
		t.Fatalf("koneksi harus diputus: %v", e.kicked)
	}
	if c, _ := e.usersCall(http.MethodDelete, base, `{"note":"x","confirm_username":"korban"}`, adminTok); c != http.StatusConflict {
		t.Fatalf("hapus ulang: %d", c)
	}
	_, b := e.usersCall(http.MethodGet, "/api/admin/users?status=deleted", "", adminTok)
	if !strings.Contains(b, target.ID) || strings.Contains(b, other.ID) {
		t.Fatalf("filter deleted: %s", b)
	}
	// Audit menyimpan username asli.
	var note string
	if err := e.sqlStore.DB().QueryRow(e.rb(`SELECT note FROM moderation_actions WHERE action = 'delete_account' AND target_user_id = ?`), target.ID).Scan(&note); err != nil || !strings.Contains(note, "[korban]") {
		t.Fatalf("audit hapus: %q %v", note, err)
	}
}
