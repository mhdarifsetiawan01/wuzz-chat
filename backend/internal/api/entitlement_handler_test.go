package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/group"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type entEnv struct {
	*staffEnv
	groups *store.SQLGroupStore
	gh     *api.GroupHandler
	eh     *api.EntitlementHandler
	ents   *store.SQLEntitlementStore
	jobs   *store.GatedMemoryStore
}

func newEntEnv(t *testing.T, enforce bool) *entEnv {
	t.Helper()
	e := &entEnv{staffEnv: newStaffEnv(t)}
	db, drv := e.sqlStore.DB(), e.sqlStore.DriverName()
	e.groups = store.NewSQLGroupStore(db, drv)
	e.groups.SetForumLimitsEnabled(enforce)
	repo := groupinfra.NewSQLGroupRepository(e.groups, e.users)
	e.ents = store.NewSQLEntitlementStore(db, drv)
	// Jalur job AI seperti produksi: gerbang grup terbuka + kuota paket (MEMORY_QUOTA_ENABLED).
	e.jobs = store.NewGatedMemoryStore(store.NewSQLMemoryStore(db, drv), store.AllowAllMemoryGate())
	e.jobs.SetQuota(e.ents)
	e.gh = api.NewGroupHandlerWithServices(group.NewGroupService(repo, repo, nil, nil), group.NewForumService(repo, repo, e.jobs, nil, nil), e.groups, e.users)
	e.eh = api.NewEntitlementHandler(e.ents, enforce, enforce)
	e.handler.SetEntitlements(e.ents, enforce, enforce)
	return e
}

func (e *entEnv) createForum(tok, parentID, duration string) *httptest.ResponseRecorder {
	body := `{"title":"Topik uji","duration":"` + duration + `"}`
	return e.call(http.MethodPost, "/api/groups/"+parentID+"/subgroups", body, tok, e.gh.RouteGroupRequest)
}

func (e *entEnv) mine(tok string) map[string]any {
	e.t.Helper()
	w := e.call(http.MethodGet, "/api/me/entitlement", "", tok, e.eh.HandleMine)
	if w.Code != http.StatusOK {
		e.t.Fatalf("GET /api/me/entitlement: %d %s", w.Code, w.Body.String())
	}
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		e.t.Fatal(err)
	}
	return m
}

func (e *entEnv) adminCall(method, path, body, tok string) *httptest.ResponseRecorder {
	return e.call(method, path, body, tok, e.handler.HandleEntitlements)
}

func TestEntitlementAPI_CreateForumLimitReturnsStructured403(t *testing.T) {
	e := newEntEnv(t, true)
	owner := e.user("forum_owner")
	tok := e.token(owner, "default", "user")
	g, err := e.groups.CreateGroup("Grup API", "", "", owner.ID, "", true, nil)
	if err != nil {
		t.Fatal(err)
	}

	if w := e.createForum(tok, g.ID, "7_days"); w.Code != http.StatusCreated {
		t.Fatalf("forum pertama: want 201, got %d %s", w.Code, w.Body.String())
	}
	w := e.createForum(tok, g.ID, "7_days")
	if w.Code != http.StatusForbidden {
		t.Fatalf("forum kedua: want 403, got %d %s", w.Code, w.Body.String())
	}
	var body struct {
		Code   string `json:"code"`
		Plan   string `json:"plan"`
		Limit  int    `json:"limit"`
		Active int    `json:"active"`
		Error  string `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "forum_limit_reached" || body.Plan != "free" || body.Limit != 1 || body.Active != 1 || body.Error == "" {
		t.Fatalf("respons batas salah: %s", w.Body.String())
	}
	// Teks UI tidak boleh mengajak membayar di luar Play.
	for _, banned := range []string{"bayar", "transfer", "http", "rp"} {
		if strings.Contains(strings.ToLower(body.Error), banned) {
			t.Errorf("pesan batas memuat kata terlarang %q: %s", banned, body.Error)
		}
	}
}

func TestEntitlementAPI_Free30DaysRejectedWithCode(t *testing.T) {
	e := newEntEnv(t, true)
	owner := e.user("dur_owner")
	tok := e.token(owner, "default", "user")
	g, _ := e.groups.CreateGroup("Grup Durasi", "", "", owner.ID, "", true, nil)

	w := e.createForum(tok, g.ID, "30_days")
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if w.Code != http.StatusForbidden || body.Code != "duration_not_in_plan" {
		t.Fatalf("want 403 duration_not_in_plan, got %d %s", w.Code, w.Body.String())
	}
}

func TestEntitlementAPI_MineReflectsPlanAndOnlyOwnData(t *testing.T) {
	e := newEntEnv(t, true)
	a, b := e.user("alpha"), e.user("beta")
	aTok, bTok := e.token(a, "default", "user"), e.token(b, "default", "user")

	if w := e.call(http.MethodGet, "/api/me/entitlement", "", "", e.eh.HandleMine); w.Code != http.StatusUnauthorized {
		t.Fatalf("tanpa token: want 401, got %d", w.Code)
	}
	if w := e.call(http.MethodPost, "/api/me/entitlement", `{}`, aTok, e.eh.HandleMine); w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST: want 405, got %d", w.Code)
	}

	free := e.mine(aTok)
	forums := free["forums"].(map[string]any)
	if free["plan"] != "free" || free["limits_enforced"] != true || forums["limit"].(float64) != 1 {
		t.Fatalf("status Free salah: %v", free)
	}

	// Admin memberi Pro ke alpha; beta tetap Free.
	w := e.adminCall(http.MethodPost, "/api/admin/entitlements", `{"user_id":"`+a.ID+`","plan":"pro","days":60,"note":"uji"}`, e.adminT)
	if w.Code != http.StatusOK {
		t.Fatalf("beri Pro: %d %s", w.Code, w.Body.String())
	}
	pro := e.mine(aTok)
	if pro["plan"] != "pro" || pro["forums"].(map[string]any)["limit"].(float64) != 5 || pro["valid_until"] == nil {
		t.Fatalf("status Pro salah: %v", pro)
	}
	if got := e.mine(bTok)["plan"]; got != "free" {
		t.Fatalf("beta tidak boleh ikut Pro, dapat %v", got)
	}
}

func TestEntitlementAPI_DisabledReportsNotEnforced(t *testing.T) {
	e := newEntEnv(t, false)
	u := e.user("noenf")
	if got := e.mine(e.token(u, "default", "user"))["limits_enforced"]; got != false {
		t.Fatalf("limits_enforced harus false saat dimatikan, dapat %v", got)
	}
}

func TestEntitlementAdmin_OnlyAdminAndValidation(t *testing.T) {
	e := newEntEnv(t, true)
	target := e.user("target")
	plainT := e.token(target, "default", "user")

	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/api/admin/entitlements?username=target", ""},
		{http.MethodPost, "/api/admin/entitlements", `{"user_id":"` + target.ID + `","plan":"pro"}`},
	} {
		if c := e.adminCall(tc.method, tc.path, tc.body, "").Code; c != http.StatusUnauthorized {
			t.Errorf("%s tanpa token: want 401, got %d", tc.method, c)
		}
		if c := e.adminCall(tc.method, tc.path, tc.body, plainT).Code; c != http.StatusForbidden {
			t.Errorf("%s user biasa: want 403, got %d", tc.method, c)
		}
		if c := e.adminCall(tc.method, tc.path, tc.body, e.modT).Code; c != http.StatusForbidden {
			t.Errorf("%s moderator: want 403, got %d", tc.method, c)
		}
	}

	for name, tc := range map[string]struct {
		method, path, body string
		want               int
	}{
		"paket tak dikenal":    {http.MethodPost, "/api/admin/entitlements", `{"user_id":"` + target.ID + `","plan":"platinum"}`, http.StatusBadRequest},
		"hari negatif":         {http.MethodPost, "/api/admin/entitlements", `{"user_id":"` + target.ID + `","plan":"pro","days":-1}`, http.StatusBadRequest},
		"hari terlalu besar":   {http.MethodPost, "/api/admin/entitlements", `{"user_id":"` + target.ID + `","plan":"pro","days":99999}`, http.StatusBadRequest},
		"tanpa user_id":        {http.MethodPost, "/api/admin/entitlements", `{"plan":"pro"}`, http.StatusBadRequest},
		"user tidak ada":       {http.MethodPost, "/api/admin/entitlements", `{"user_id":"nope","plan":"pro"}`, http.StatusNotFound},
		"lookup tak ditemukan": {http.MethodGet, "/api/admin/entitlements?username=hantu", ``, http.StatusNotFound},
		"lookup tanpa nama":    {http.MethodGet, "/api/admin/entitlements", ``, http.StatusBadRequest},
		"method salah":         {http.MethodDelete, "/api/admin/entitlements", ``, http.StatusMethodNotAllowed},
		"subpath":              {http.MethodGet, "/api/admin/entitlements/x", ``, http.StatusNotFound},
	} {
		if c := e.adminCall(tc.method, tc.path, tc.body, e.adminT).Code; c != tc.want {
			t.Errorf("%s: want %d, got %d", name, tc.want, c)
		}
	}
}

func TestEntitlementAdmin_GrantLookupRevokeAudit(t *testing.T) {
	e := newEntEnv(t, true)
	target := e.user("grantee")

	if w := e.adminCall(http.MethodPost, "/api/admin/entitlements", `{"user_id":"`+target.ID+`","plan":"pro","days":30,"note":"komunitas uji"}`, e.adminT); w.Code != http.StatusOK {
		t.Fatalf("grant: %d %s", w.Code, w.Body.String())
	}
	w := e.adminCall(http.MethodGet, "/api/admin/entitlements?username=grantee", "", e.adminT)
	var got struct {
		Status struct {
			Plan string `json:"plan"`
		} `json:"status"`
		Entitlement struct {
			GrantedBy string `json:"granted_by"`
			Source    string `json:"source"`
		} `json:"entitlement"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if w.Code != http.StatusOK || got.Status.Plan != "pro" || got.Entitlement.GrantedBy != e.admin.ID || got.Entitlement.Source != "manual" {
		t.Fatalf("lookup setelah grant salah: %d %s", w.Code, w.Body.String())
	}

	if w := e.adminCall(http.MethodPost, "/api/admin/entitlements", `{"user_id":"`+target.ID+`","revoke":true}`, e.adminT); w.Code != http.StatusOK {
		t.Fatalf("revoke: %d %s", w.Code, w.Body.String())
	}
	w = e.adminCall(http.MethodGet, "/api/admin/entitlements?username=grantee", "", e.adminT)
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if got.Status.Plan != "free" {
		t.Fatalf("setelah revoke harus free: %s", w.Body.String())
	}

	var events int
	if err := e.sqlStore.DB().QueryRow(e.rb(`SELECT COUNT(*) FROM entitlement_events WHERE user_id = ? AND actor_id = ?`), target.ID, e.admin.ID).Scan(&events); err != nil || events != 2 {
		t.Fatalf("riwayat harus mencatat aktor admin: events=%d err=%v", events, err)
	}
}

func TestEntitlementAdmin_DisabledStoreReturns503(t *testing.T) {
	e := newStaffEnv(t) // handler moderasi tanpa SetEntitlements
	w := e.call(http.MethodGet, "/api/admin/entitlements?username=boss", "", e.adminT, e.handler.HandleEntitlements)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", w.Code)
	}
}

func (e *entEnv) expire(tok, parentID, subID string) (int, map[string]any) {
	e.t.Helper()
	w := e.call(http.MethodPost, "/api/groups/"+parentID+"/subgroups/"+subID+"/expire", "", tok, e.gh.RouteGroupRequest)
	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	return w.Code, m
}

func TestEntitlementAPI_ManualExpireMessageMatchesQuotaOutcome(t *testing.T) {
	e := newEntEnv(t, false) // batas forum mati agar 3 forum bisa dibuat cepat; kuota AI tetap aktif
	owner := e.user("expire_owner")
	tok := e.token(owner, "default", "user")
	g, _ := e.groups.CreateGroup("Grup Expire", "", "", owner.ID, "", true, nil)

	var subs []string
	for i := 0; i < 3; i++ {
		w := e.createForum(tok, g.ID, "7_days")
		var created struct {
			Subgroup struct {
				ID string `json:"id"`
			} `json:"subgroup"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &created)
		if w.Code != http.StatusCreated || created.Subgroup.ID == "" {
			t.Fatalf("buat forum %d: %d %s", i, w.Code, w.Body.String())
		}
		subs = append(subs, created.Subgroup.ID)
	}

	for i := 0; i < 2; i++ {
		code, body := e.expire(tok, g.ID, subs[i])
		if code != http.StatusOK || body["memory"] != "queued" || !strings.Contains(body["message"].(string), "antrean memori telah dibuat") {
			t.Fatalf("forum %d harus queued: %d %v", i, code, body)
		}
	}
	code, body := e.expire(tok, g.ID, subs[2])
	msg, _ := body["message"].(string)
	if code != http.StatusOK || body["memory"] != "quota_exceeded" || !strings.Contains(msg, "kuota") || strings.Contains(msg, "antrean memori telah dibuat") {
		t.Fatalf("forum ke-3 harus quota_exceeded dan tidak menjanjikan antrean: %d %v", code, body)
	}
	var jobs int
	if err := e.sqlStore.DB().QueryRow(e.rb(`SELECT COUNT(*) FROM forum_memory_jobs WHERE forum_id = ?`), subs[2]).Scan(&jobs); err != nil || jobs != 0 {
		t.Fatalf("tidak boleh ada job untuk forum yang kuotanya habis: jobs=%d err=%v", jobs, err)
	}
	// Forum tetap berakhir normal.
	var exp bool
	if err := e.sqlStore.DB().QueryRow(e.rb(`SELECT expires_at <= ? FROM conversations WHERE id = ?`), time.Now().UTC(), subs[2]).Scan(&exp); err != nil || !exp {
		t.Fatalf("forum harus tetap berakhir walau kuota AI habis: exp=%v err=%v", exp, err)
	}

	// Status paket mencerminkan pemakaian: 2 dari 2, dengan tanggal reset.
	ai := e.mine(tok)["ai"].(map[string]any)
	if ai["used"].(float64) != 2 || ai["limit"].(float64) != 2 || ai["enforced"] != false || ai["reset_at"] == nil {
		t.Fatalf("status ai salah: %v", ai)
	}
}

func (e *entEnv) grandfather(tok, body string) (int, map[string]any) {
	e.t.Helper()
	w := e.adminCall(http.MethodPost, "/api/admin/entitlements/grandfather", body, tok)
	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	return w.Code, m
}

func (e *entEnv) grandfatherRows() int {
	e.t.Helper()
	var n int
	if err := e.sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM user_entitlements WHERE source = 'grandfather'`).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func TestGrandfatherAPI_DryRunByDefaultThenConfirmWithExpectedCount(t *testing.T) {
	e := newEntEnv(t, true)
	owner := e.user("old_admin")
	if _, err := e.groups.CreateGroup("Grup Lama", "", "", owner.ID, "", true, nil); err != nil {
		t.Fatal(err)
	}
	// e.admin / e.modUsr adalah akun staf tanpa grup; hanya old_admin yang memenuhi syarat.

	code, body := e.grandfather(e.adminT, `{}`)
	if code != http.StatusOK || body["dry_run"] != true || body["eligible"].(float64) != 1 || body["days"].(float64) != 60 {
		t.Fatalf("pratinjau default salah: %d %v", code, body)
	}
	if sample := body["sample"].([]any); len(sample) != 1 || sample[0] != "old_admin" {
		t.Fatalf("contoh username salah: %v", body["sample"])
	}
	if e.grandfatherRows() != 0 {
		t.Fatal("pratinjau tidak boleh menulis")
	}

	// confirm tanpa expected_eligible yang benar -> 409 dan tidak menulis.
	code, body = e.grandfather(e.adminT, `{"confirm":true,"expected_eligible":5}`)
	if code != http.StatusConflict || body["eligible"].(float64) != 1 || e.grandfatherRows() != 0 {
		t.Fatalf("expected salah harus 409 tanpa tulis: %d %v rows=%d", code, body, e.grandfatherRows())
	}
	code, _ = e.grandfather(e.adminT, `{"confirm":true}`)
	if code != http.StatusConflict {
		t.Fatalf("confirm tanpa expected_eligible harus 409, dapat %d", code)
	}

	code, body = e.grandfather(e.adminT, `{"confirm":true,"expected_eligible":1,"days":30,"note":"rilis batas paket"}`)
	if code != http.StatusOK || body["dry_run"] != false || body["applied"].(float64) != 1 || body["days"].(float64) != 30 {
		t.Fatalf("penerapan salah: %d %v", code, body)
	}
	if e.grandfatherRows() != 1 {
		t.Fatal("harus ada 1 baris grandfather")
	}
	// Status paket pengguna kini Pro.
	if got := e.mine(e.token(owner, "default", "user"))["plan"]; got != "pro" {
		t.Fatalf("old_admin harus Pro, dapat %v", got)
	}
	// Jalan ulang: tidak ada kandidat lagi.
	if _, body = e.grandfather(e.adminT, `{}`); body["eligible"].(float64) != 0 {
		t.Fatalf("jalan ulang harus 0 kandidat: %v", body)
	}
}

func TestGrandfatherAPI_AdminOnlyAndValidation(t *testing.T) {
	e := newEntEnv(t, true)
	plainT := e.token(e.user("plain_gf"), "default", "user")
	for name, tok := range map[string]string{"tanpa token": "", "user biasa": plainT, "moderator": e.modT} {
		w := e.adminCall(http.MethodPost, "/api/admin/entitlements/grandfather", `{"confirm":true,"expected_eligible":0}`, tok)
		want := http.StatusForbidden
		if tok == "" {
			want = http.StatusUnauthorized
		}
		if w.Code != want {
			t.Errorf("%s: want %d, got %d", name, want, w.Code)
		}
	}
	if e.grandfatherRows() != 0 {
		t.Fatal("akses tanpa hak tidak boleh menulis")
	}
	for name, tc := range map[string]struct {
		method, body string
		want         int
	}{
		"hari negatif":       {http.MethodPost, `{"days":-1}`, http.StatusBadRequest},
		"hari terlalu besar": {http.MethodPost, `{"days":366}`, http.StatusBadRequest},
		"json rusak":         {http.MethodPost, `{`, http.StatusBadRequest},
		"method GET":         {http.MethodGet, ``, http.StatusMethodNotAllowed},
	} {
		if c := e.adminCall(tc.method, "/api/admin/entitlements/grandfather", tc.body, e.adminT).Code; c != tc.want {
			t.Errorf("%s: want %d, got %d", name, tc.want, c)
		}
	}
	// Tenant selain default ditolak (batas paket hanya ditegakkan di tenant default).
	acmeT := e.token(e.admin, "acme", "wuzz_admin")
	if c := e.adminCall(http.MethodPost, "/api/admin/entitlements/grandfather", `{}`, acmeT).Code; c != http.StatusBadRequest {
		t.Errorf("tenant acme: want 400, got %d", c)
	}
}
