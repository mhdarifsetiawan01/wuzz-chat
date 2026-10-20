package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
}

func newEntEnv(t *testing.T, enforce bool) *entEnv {
	t.Helper()
	e := &entEnv{staffEnv: newStaffEnv(t)}
	db, drv := e.sqlStore.DB(), e.sqlStore.DriverName()
	e.groups = store.NewSQLGroupStore(db, drv)
	e.groups.SetForumLimitsEnabled(enforce)
	repo := groupinfra.NewSQLGroupRepository(e.groups, e.users)
	e.gh = api.NewGroupHandlerWithServices(group.NewGroupService(repo, repo, nil, nil), group.NewForumService(repo, repo, nil, nil, nil), e.groups, e.users)
	e.ents = store.NewSQLEntitlementStore(db, drv)
	e.eh = api.NewEntitlementHandler(e.ents, enforce)
	e.handler.SetEntitlements(e.ents, enforce)
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
