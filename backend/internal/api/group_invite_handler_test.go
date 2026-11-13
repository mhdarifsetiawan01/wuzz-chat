package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/group"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

// inviteSpy mencatat notifikasi WS/push yang dikirim InviteService.
type inviteSpy struct {
	mu     sync.Mutex
	ws     map[string][]string // userID -> isi pesan
	push   map[string][]string // userID -> judul push
	events []string
}

func newInviteSpy() *inviteSpy {
	return &inviteSpy{ws: map[string][]string{}, push: map[string][]string{}}
}
func (s *inviteSpy) BroadcastRoomUsers(string)         {}
func (s *inviteSpy) InvalidateRoomMembersCache(string) {}
func (s *inviteSpy) BroadcastGroupSystemEvent(_, eventType, content string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, eventType+": "+content)
}
func (s *inviteSpy) NotifyUsers(ids []string, msg ws.Message) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range ids {
		s.ws[id] = append(s.ws[id], msg.Content)
	}
}

type pushSpy struct{ s *inviteSpy }

func (p pushSpy) NotifyUsers(ids []string, title, _, _, _ string) {
	p.s.mu.Lock()
	defer p.s.mu.Unlock()
	for _, id := range ids {
		p.s.push[id] = append(p.s.push[id], title)
	}
}

type inviteHTTP struct {
	t *testing.T
	h *GroupHandler
}

func (x inviteHTTP) do(method, path, userID string, body any) *httptest.ResponseRecorder {
	x.t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		rdr = bytes.NewReader(raw)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rdr)
	req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userID}))
	rr := httptest.NewRecorder()
	if strings.HasPrefix(path, "/api/invites/") {
		x.h.RouteInviteRequest(rr, req)
	} else {
		x.h.RouteGroupRequest(rr, req)
	}
	return rr
}

func TestGroupInviteHTTP_EndToEnd(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "invite_http.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlStore.Close() })
	us := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	gs := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	owner, _ := us.Register("owner_ih", "Owner", "pass12345")
	member, _ := us.Register("member_ih", "Member", "pass12345")
	guest, _ := us.Register("guest_ih", "Tamu Baru", "pass12345")
	grp, err := gs.CreateGroup("Grup Undangan", "", "", owner.ID, "", false, []string{member.ID})
	if err != nil {
		t.Fatal(err)
	}

	h := NewGroupHandler(gs, us)
	repo := groupinfra.NewSQLGroupRepository(gs, us)
	svc := group.NewInviteService(store.NewInviteLinkStore(sqlStore.DB(), sqlStore.DriverName()), repo)
	h.SetInviteService(svc)
	spy := newInviteSpy()
	svc.SetBroadcaster(spy)
	svc.SetNotifier(pushSpy{spy})
	x := inviteHTTP{t: t, h: h}
	base := "/api/groups/" + grp.ID

	// Anggota biasa tidak bisa melihat/membuat tautan.
	if rr := x.do(http.MethodPost, base+"/invite-link", member.ID, nil); rr.Code != http.StatusForbidden || !strings.Contains(rr.Body.String(), "admin_only") {
		t.Fatalf("anggota membuat tautan: %d %s", rr.Code, rr.Body.String())
	}
	rr := x.do(http.MethodGet, base+"/invite-link", owner.ID, nil)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"link":null`) {
		t.Fatalf("GET awal: %d %s", rr.Code, rr.Body.String())
	}
	var created struct{ Link store.InviteLink }
	rr = x.do(http.MethodPost, base+"/invite-link", owner.ID, nil)
	_ = json.Unmarshal(rr.Body.Bytes(), &created)
	if rr.Code != http.StatusOK || !store.IsInviteToken(created.Link.Token) || created.Link.Path != "/join/"+created.Link.Token {
		t.Fatalf("POST buat: %d %s", rr.Code, rr.Body.String())
	}
	tok := created.Link.Token

	// Pratinjau tamu: nama, jumlah anggota, status none; tanpa deskripsi/daftar anggota.
	rr = x.do(http.MethodGet, "/api/invites/"+tok, guest.ID, nil)
	var prev store.InvitePreview
	_ = json.Unmarshal(rr.Body.Bytes(), &prev)
	if rr.Code != http.StatusOK || prev.Title != "Grup Undangan" || prev.MemberCount != 2 || prev.MyStatus != "none" || rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("pratinjau: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodGet, "/api/invites/ZZZZZZZZZZZZZZZZ", guest.ID, nil); rr.Code != http.StatusNotFound || !strings.Contains(rr.Body.String(), "invite_not_found") {
		t.Fatalf("token tak dikenal: %d %s", rr.Code, rr.Body.String())
	}

	// Ajukan: 202 + notifikasi ke owner (bukan ke anggota biasa); ajukan ulang tidak memicu notifikasi lagi.
	rr = x.do(http.MethodPost, "/api/invites/"+tok+"/join", guest.ID, nil)
	if rr.Code != http.StatusAccepted || !strings.Contains(rr.Body.String(), `"status":"pending"`) {
		t.Fatalf("ajukan: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, "/api/invites/"+tok+"/join", guest.ID, nil); rr.Code != http.StatusAccepted {
		t.Fatalf("ajukan ulang: %d", rr.Code)
	}
	if len(spy.ws[owner.ID]) != 1 || len(spy.push[owner.ID]) != 1 || !strings.Contains(spy.ws[owner.ID][0], "Tamu Baru meminta bergabung ke grup 'Grup Undangan'") {
		t.Fatalf("notifikasi admin: ws=%v push=%v", spy.ws[owner.ID], spy.push[owner.ID])
	}
	if len(spy.ws[member.ID]) != 0 {
		t.Fatalf("anggota biasa tidak boleh diberi tahu: %v", spy.ws[member.ID])
	}
	if rr := x.do(http.MethodPost, "/api/invites/"+tok+"/join", member.ID, nil); rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"status":"member"`) {
		t.Fatalf("anggota mengajukan: %d %s", rr.Code, rr.Body.String())
	}

	// Daftar & persetujuan lewat endpoint join-requests yang sama dengan forum.
	if rr := x.do(http.MethodGet, base+"/join-requests", member.ID, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("anggota melihat daftar: %d", rr.Code)
	}
	var list struct {
		Requests []store.JoinRequestItem `json:"requests"`
	}
	rr = x.do(http.MethodGet, base+"/join-requests", owner.ID, nil)
	_ = json.Unmarshal(rr.Body.Bytes(), &list)
	if rr.Code != http.StatusOK || len(list.Requests) != 1 || list.Requests[0].UserID != guest.ID {
		t.Fatalf("daftar: %d %s", rr.Code, rr.Body.String())
	}
	action := base + "/join-requests/" + list.Requests[0].ID + "/action"
	if rr := x.do(http.MethodPost, action, owner.ID, map[string]bool{"approve": true}); rr.Code != http.StatusOK {
		t.Fatalf("setujui: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, action, owner.ID, map[string]bool{"approve": false}); rr.Code != http.StatusConflict {
		t.Fatalf("proses ganda: want 409, got %d", rr.Code)
	}
	if role, _ := gs.GetUserRoleInGroup(grp.ID, guest.ID); role != "member" {
		t.Fatalf("tamu harus jadi anggota, got %q", role)
	}
	if len(spy.ws[guest.ID]) != 1 || !strings.Contains(spy.ws[guest.ID][0], "disetujui") || len(spy.events) != 1 || !strings.Contains(spy.events[0], "group_member_joined") {
		t.Fatalf("notifikasi persetujuan: ws=%v events=%v", spy.ws[guest.ID], spy.events)
	}

	// Reset mengganti token; token lama 404.
	var reset struct{ Link store.InviteLink }
	rr = x.do(http.MethodPost, base+"/invite-link", owner.ID, map[string]bool{"reset": true})
	_ = json.Unmarshal(rr.Body.Bytes(), &reset)
	if rr.Code != http.StatusOK || reset.Link.Token == tok {
		t.Fatalf("reset: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodGet, "/api/invites/"+tok, guest.ID, nil); rr.Code != http.StatusNotFound {
		t.Fatalf("token lama: want 404, got %d", rr.Code)
	}

	// Grup dijadikan publik: tautan dicabut otomatis lewat GroupService.
	if rr := x.do(http.MethodPatch, base, owner.ID, map[string]any{"title": "Grup Undangan", "is_public": true}); rr.Code != http.StatusOK {
		t.Fatalf("jadikan publik: %d %s", rr.Code, rr.Body.String())
	}
	var active int
	if err := sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM group_invite_links WHERE conversation_id = ? AND revoked_at IS NULL`, grp.ID).Scan(&active); err != nil || active != 0 {
		t.Fatalf("tautan aktif setelah publik: %d %v", active, err)
	}
	if rr := x.do(http.MethodPost, base+"/invite-link", owner.ID, nil); rr.Code != http.StatusConflict {
		t.Fatalf("buat tautan grup publik: want 409, got %d", rr.Code)
	}

	// Forum sub_ tetap memakai jalur lama.
	if rr := x.do(http.MethodGet, "/api/groups/sub_x/invite-link", owner.ID, nil); rr.Code != http.StatusNotFound {
		t.Fatalf("invite-link untuk sub_: want 404, got %d", rr.Code)
	}
}

func TestGroupInviteHTTP_RejectCooldownAndCancel(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "invite_http_cd.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlStore.Close() })
	us := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	gs := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	owner, _ := us.Register("owner_cd", "Owner", "pass12345")
	guest, _ := us.Register("guest_cd", "Guest", "pass12345")
	grp, _ := gs.CreateGroup("Grup CD", "", "", owner.ID, "", false, nil)
	h := NewGroupHandler(gs, us)
	h.SetInviteService(group.NewInviteService(store.NewInviteLinkStore(sqlStore.DB(), sqlStore.DriverName()), groupinfra.NewSQLGroupRepository(gs, us)))
	x := inviteHTTP{t: t, h: h}
	base := "/api/groups/" + grp.ID

	var created struct{ Link store.InviteLink }
	_ = json.Unmarshal(x.do(http.MethodPost, base+"/invite-link", owner.ID, nil).Body.Bytes(), &created)
	tok := created.Link.Token

	// Batal pengajuan sendiri.
	x.do(http.MethodPost, "/api/invites/"+tok+"/join", guest.ID, nil)
	if rr := x.do(http.MethodDelete, "/api/invites/"+tok+"/request", guest.ID, nil); rr.Code != http.StatusOK {
		t.Fatalf("batal: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodDelete, "/api/invites/"+tok+"/request", guest.ID, nil); rr.Code != http.StatusNotFound {
		t.Fatalf("batal ganda: want 404, got %d", rr.Code)
	}

	// Ditolak lalu langsung mengajukan lagi: 429 rejoin_cooldown + Retry-After.
	x.do(http.MethodPost, "/api/invites/"+tok+"/join", guest.ID, nil)
	var list struct {
		Requests []store.JoinRequestItem `json:"requests"`
	}
	_ = json.Unmarshal(x.do(http.MethodGet, base+"/join-requests", owner.ID, nil).Body.Bytes(), &list)
	if len(list.Requests) != 1 {
		t.Fatalf("daftar: %+v", list)
	}
	x.do(http.MethodPost, base+"/join-requests/"+list.Requests[0].ID+"/action", owner.ID, map[string]bool{"approve": false})
	rr := x.do(http.MethodPost, "/api/invites/"+tok+"/join", guest.ID, nil)
	if rr.Code != http.StatusTooManyRequests || !strings.Contains(rr.Body.String(), "rejoin_cooldown") || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("jeda: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodGet, "/api/invites/"+tok, guest.ID, nil); !strings.Contains(rr.Body.String(), `"my_status":"rejected"`) {
		t.Fatalf("pratinjau ditolak: %s", rr.Body.String())
	}
}

func TestShortLinkHandler_PrivateGroupAdminOnly(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "short_link_admin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlStore.Close() })
	us := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	gs := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	owner, _ := us.Register("owner_sla", "Owner", "pass12345")
	member, _ := us.Register("member_sla", "Member", "pass12345")
	priv, _ := gs.CreateGroup("Privat", "", "", owner.ID, "", false, []string{member.ID})
	pub, _ := gs.CreateGroup("Publik", "", "", owner.ID, "", true, []string{member.ID})
	h := NewShortLinkHandler(store.NewShortLinkStore(sqlStore.DB(), sqlStore.DriverName()), true)
	create := func(userID, roomID string) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(map[string]string{"room_id": roomID})
		req := httptest.NewRequest(http.MethodPost, "/api/links", bytes.NewReader(raw))
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userID}))
		rr := httptest.NewRecorder()
		h.Create(rr, req)
		return rr
	}
	if rr := create(member.ID, priv.ID); rr.Code != http.StatusForbidden || !strings.Contains(rr.Body.String(), "admin_only") {
		t.Fatalf("anggota biasa, grup privat: want 403 admin_only, got %d %s", rr.Code, rr.Body.String())
	}
	if rr := create(owner.ID, priv.ID); rr.Code != http.StatusOK {
		t.Fatalf("creator, grup privat: want 200, got %d", rr.Code)
	}
	if rr := create(member.ID, pub.ID); rr.Code != http.StatusOK {
		t.Fatalf("anggota biasa, grup publik: want 200, got %d", rr.Code)
	}
}
