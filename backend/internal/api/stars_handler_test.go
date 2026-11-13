package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/group"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type starsHTTP struct {
	t     *testing.T
	group *GroupHandler
	stars *StarsHandler
}

func (x starsHTTP) do(method, path string, claims *auth.UserClaims, body any, headers map[string]string) *httptest.ResponseRecorder {
	x.t.Helper()
	raw := []byte{}
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(raw))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req = req.WithContext(auth.SetUserContext(req.Context(), claims))
	rr := httptest.NewRecorder()
	switch {
	case strings.HasPrefix(path, "/api/invites/"):
		x.group.RouteInviteRequest(rr, req)
	case strings.HasPrefix(path, "/api/groups/"):
		x.group.RouteGroupRequest(rr, req)
	case strings.HasPrefix(path, "/api/admin/stars"):
		x.stars.HandleAdmin(rr, req)
	default:
		x.stars.HandleMe(rr, req)
	}
	return rr
}

func setupStarsHTTP(t *testing.T, starsOn, paidOn, grantsOn bool) (starsHTTP, *store.SQLGroupStore, map[string]*auth.UserClaims, string) {
	t.Helper()
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "stars_http.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlStore.Close() })
	us := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	gs := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	users := map[string]*auth.UserClaims{}
	for _, n := range []string{"kreator_sh", "tamu_sh", "staf_sh"} {
		u, err := us.Register(n, n, "pass12345")
		if err != nil {
			t.Fatal(err)
		}
		users[n] = &auth.UserClaims{UserID: u.ID, TenantID: "default"}
	}
	users["staf_sh"].SystemRole = store.SystemRoleWuzzAdmin
	grp, err := gs.CreateGroup("Grup Berbayar", "", "", users["kreator_sh"].UserID, "", false, nil)
	if err != nil {
		t.Fatal(err)
	}

	repo := groupinfra.NewSQLGroupRepository(gs, us)
	groupSvc := group.NewGroupService(repo, repo, nil, nil)
	h := NewGroupHandlerWithServices(groupSvc, nil, gs, us)
	inviteStore := store.NewInviteLinkStore(sqlStore.DB(), sqlStore.DriverName())
	h.SetInviteService(group.NewInviteService(inviteStore, repo))
	starStore := store.NewStarStore(sqlStore.DB(), sqlStore.DriverName(), inviteStore)
	if paidOn && starsOn {
		inviteStore.SetStarStore(starStore)
		groupSvc.SetPaidGroupChecker(starStore)
	}
	sh := NewStarsHandler(starStore, starsOn, paidOn, grantsOn)
	h.SetStarsHandler(sh)
	return starsHTTP{t: t, group: h, stars: sh}, gs, users, grp.ID
}

func TestStarsHTTP_SwitchesOffHideEverything(t *testing.T) {
	x, _, u, gid := setupStarsHTTP(t, false, false, false)
	for _, rr := range []*httptest.ResponseRecorder{
		x.do(http.MethodGet, "/api/me/stars", u["tamu_sh"], nil, nil),
		x.do(http.MethodGet, "/api/admin/stars/settings", u["staf_sh"], nil, nil),
		x.do(http.MethodGet, "/api/groups/"+gid+"/paid", u["kreator_sh"], nil, nil),
		x.do(http.MethodPost, "/api/invites/ABCDEFGHJKLMNPQR/purchase", u["tamu_sh"], map[string]int{"expected_price": 100}, nil),
	} {
		if rr.Code != http.StatusNotFound {
			t.Fatalf("sakelar mati: want 404, got %d %s", rr.Code, rr.Body.String())
		}
	}
}

func TestStarsHTTP_PaidGroupFlow(t *testing.T) {
	x, gs, u, gid := setupStarsHTTP(t, true, true, true)
	staf, kreator, tamu := u["staf_sh"], u["kreator_sh"], u["tamu_sh"]

	// Bukan admin tidak boleh memakai alat Star.
	if rr := x.do(http.MethodGet, "/api/admin/stars/creators", tamu, nil, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("non-admin: %d", rr.Code)
	}
	// Belum mitra: tidak bisa mengaktifkan grup berbayar.
	if rr := x.do(http.MethodPut, "/api/groups/"+gid+"/paid", kreator, map[string]any{"price_stars": 100, "enabled": true}, nil); rr.Code != http.StatusForbidden || !strings.Contains(rr.Body.String(), "not_paid_creator") {
		t.Fatalf("bukan mitra: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, "/api/admin/stars/creators", staf, map[string]any{"user": "@kreator_sh", "active": true, "note": "uji"}, nil); rr.Code != http.StatusOK {
		t.Fatalf("beri mitra: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPut, "/api/groups/"+gid+"/paid", kreator, map[string]any{"price_stars": 100, "enabled": true}, nil); rr.Code != http.StatusOK {
		t.Fatalf("aktifkan berbayar: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodGet, "/api/groups/"+gid+"/paid", kreator, nil, nil); !strings.Contains(rr.Body.String(), `"price_stars":100`) || !strings.Contains(rr.Body.String(), `"is_creator":true`) {
		t.Fatalf("GET paid: %s", rr.Body.String())
	}
	// K3: grup berbayar tidak boleh dijadikan publik.
	if rr := x.do(http.MethodPatch, "/api/groups/"+gid, kreator, map[string]any{"title": "Grup Berbayar", "is_public": true}, nil); rr.Code != http.StatusConflict || !strings.Contains(rr.Body.String(), "paid_group_public") {
		t.Fatalf("jadikan publik: %d %s", rr.Code, rr.Body.String())
	}

	var link struct{ Link store.InviteLink }
	_ = json.Unmarshal(x.do(http.MethodPost, "/api/groups/"+gid+"/invite-link", kreator, nil, nil).Body.Bytes(), &link)
	if link.Link.Mode != store.InviteModePaid {
		t.Fatalf("mode tautan: %+v", link.Link)
	}
	tok := link.Link.Token
	if rr := x.do(http.MethodGet, "/api/invites/"+tok, tamu, nil, nil); !strings.Contains(rr.Body.String(), `"mode":"paid"`) || !strings.Contains(rr.Body.String(), `"my_balance":0`) {
		t.Fatalf("pratinjau: %s", rr.Body.String())
	}
	if rr := x.do(http.MethodPost, "/api/invites/"+tok+"/join", tamu, nil, nil); rr.Code != http.StatusPaymentRequired || !strings.Contains(rr.Body.String(), "payment_required") {
		t.Fatalf("ajukan approval: %d %s", rr.Code, rr.Body.String())
	}
	buy := func(key string) *httptest.ResponseRecorder {
		return x.do(http.MethodPost, "/api/invites/"+tok+"/purchase", tamu, map[string]int{"expected_price": 100}, map[string]string{"Idempotency-Key": key})
	}
	if rr := buy(""); rr.Code != http.StatusBadRequest {
		t.Fatalf("tanpa kunci: %d", rr.Code)
	}
	if rr := buy("k1"); rr.Code != http.StatusPaymentRequired || !strings.Contains(rr.Body.String(), "insufficient_stars") {
		t.Fatalf("saldo kurang: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, "/api/admin/stars/users/tamu_sh/test-grant", staf, map[string]any{"stars": 150, "reason": "uji"}, map[string]string{"Idempotency-Key": "g1"}); rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"balance":150`) {
		t.Fatalf("kredit uji: %d %s", rr.Code, rr.Body.String())
	}
	if rr := buy("k2"); rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"balance":50`) {
		t.Fatalf("bayar: %d %s", rr.Code, rr.Body.String())
	}
	if role, _ := gs.GetUserRoleInGroup(gid, tamu.UserID); role != "member" {
		t.Fatalf("harus anggota: %q", role)
	}
	var wallet store.StarWallet
	_ = json.Unmarshal(x.do(http.MethodGet, "/api/me/stars", tamu, nil, nil).Body.Bytes(), &wallet)
	if wallet.Balance != 50 || len(wallet.History) != 2 || wallet.History[0].Kind != store.StarKindSpend || wallet.History[0].GroupTitle != "Grup Berbayar" {
		t.Fatalf("dompet: %+v", wallet)
	}
	if rr := x.do(http.MethodGet, "/api/me/stars/received", kreator, nil, nil); !strings.Contains(rr.Body.String(), `"pending_stars":100`) {
		t.Fatalf("diterima kreator: %s", rr.Body.String())
	}
	// Refund oleh admin.
	if rr := x.do(http.MethodPost, "/api/admin/stars/refund", staf, map[string]string{"spend_id": wallet.History[0].ID, "reason": "uji refund"}, nil); rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"balance":150`) {
		t.Fatalf("refund: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, "/api/admin/stars/refund", staf, map[string]string{"spend_id": wallet.History[0].ID, "reason": "lagi"}, nil); rr.Code != http.StatusConflict {
		t.Fatalf("refund ganda: %d", rr.Code)
	}
}

func TestStarsHTTP_TestGrantsSwitch(t *testing.T) {
	x, _, u, _ := setupStarsHTTP(t, true, true, false)
	rr := x.do(http.MethodPost, "/api/admin/stars/users/tamu_sh/test-grant", u["staf_sh"], map[string]any{"stars": 10, "reason": "x"}, map[string]string{"Idempotency-Key": "g"})
	if rr.Code != http.StatusForbidden || !strings.Contains(rr.Body.String(), "test_grants_disabled") {
		t.Fatalf("kredit uji saat sakelar mati: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodGet, "/api/admin/stars/settings", u["staf_sh"], nil, nil); !strings.Contains(rr.Body.String(), `"test_grants":false`) {
		t.Fatalf("flags: %s", rr.Body.String())
	}
}
