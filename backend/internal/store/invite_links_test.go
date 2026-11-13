package store_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

type inviteFixture struct {
	ms                            *store.SQLMessageStore
	inv                           *store.InviteLinkStore
	gs                            *store.SQLGroupStore
	groupID                       string
	creator, admin, member, guest string
	clock                         *time.Time
}

func setupInvite(t *testing.T, name string) *inviteFixture {
	t.Helper()
	ms := openMessageStore(t, name)
	us := store.NewSQLUserStore(ms.DB(), ms.DriverName())
	gs := store.NewSQLGroupStore(ms.DB(), ms.DriverName())
	mk := func(u string) string {
		usr, err := us.Register(u, u, "password123")
		if err != nil {
			t.Fatal(err)
		}
		return usr.ID
	}
	f := &inviteFixture{ms: ms, gs: gs, creator: mk("inv_creator"), admin: mk("inv_admin"), member: mk("inv_member"), guest: mk("inv_guest")}
	g, err := gs.CreateGroup("Grup Rahasia", "", "", f.creator, "", false, []string{f.admin, f.member})
	if err != nil {
		t.Fatal(err)
	}
	f.groupID = g.ID
	if err := gs.UpdateMemberRole(g.ID, f.creator, f.admin, "admin"); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	f.clock = &now
	f.inv = store.NewInviteLinkStore(ms.DB(), ms.DriverName())
	f.inv.SetClock(func() time.Time { return *f.clock })
	return f
}

func (f *inviteFixture) link(t *testing.T) string {
	t.Helper()
	l, err := f.inv.CreateOrReset(t.Context(), f.groupID, f.creator, false)
	if err != nil {
		t.Fatal(err)
	}
	return l.Token
}

func TestInviteLink_AdminOnlyAndSingleActive(t *testing.T) {
	f := setupInvite(t, "inv_admin.db")
	ctx := t.Context()

	if _, err := f.inv.CreateOrReset(ctx, f.groupID, f.member, false); !errors.Is(err, store.ErrUnauthorizedGroup) {
		t.Fatalf("anggota biasa: want ErrUnauthorizedGroup, got %v", err)
	}
	if _, err := f.inv.GetActive(ctx, f.groupID, f.guest); !errors.Is(err, store.ErrUnauthorizedGroup) {
		t.Fatalf("bukan anggota: want ErrUnauthorizedGroup, got %v", err)
	}
	if l, err := f.inv.GetActive(ctx, f.groupID, f.admin); err != nil || l != nil {
		t.Fatalf("belum ada tautan: want nil, got %v %v", l, err)
	}

	a, err := f.inv.CreateOrReset(ctx, f.groupID, f.admin, false)
	if err != nil || !store.IsInviteToken(a.Token) || a.Path != "/join/"+a.Token || a.Mode != store.InviteModeApproval {
		t.Fatalf("buat: %+v %v", a, err)
	}
	b, err := f.inv.CreateOrReset(ctx, f.groupID, f.creator, false)
	if err != nil || b.Token != a.Token {
		t.Fatalf("buat ulang tanpa reset harus mengembalikan tautan yang sama: %v %v", b, err)
	}
	c, err := f.inv.CreateOrReset(ctx, f.groupID, f.creator, true)
	if err != nil || c.Token == a.Token {
		t.Fatalf("reset harus mengganti token: %v %v", c, err)
	}
	if _, err := f.inv.Preview(ctx, a.Token, f.guest); !errors.Is(err, store.ErrInviteNotFound) {
		t.Fatalf("token lama setelah reset: want ErrInviteNotFound, got %v", err)
	}
	var active int
	if err := f.ms.DB().QueryRow(rebindPG(f.ms, `SELECT COUNT(*) FROM group_invite_links WHERE conversation_id = ? AND revoked_at IS NULL`), f.groupID).Scan(&active); err != nil || active != 1 {
		t.Fatalf("tautan aktif: want 1, got %d %v", active, err)
	}

	if err := f.inv.Revoke(ctx, f.groupID, f.member); !errors.Is(err, store.ErrUnauthorizedGroup) {
		t.Fatalf("anggota biasa mematikan: want ErrUnauthorizedGroup, got %v", err)
	}
	if err := f.inv.Revoke(ctx, f.groupID, f.admin); err != nil {
		t.Fatal(err)
	}
	if l, _ := f.inv.GetActive(ctx, f.groupID, f.admin); l != nil {
		t.Fatalf("setelah dimatikan: want nil, got %+v", l)
	}
	if _, err := f.inv.Preview(ctx, c.Token, f.guest); !errors.Is(err, store.ErrInviteNotFound) {
		t.Fatalf("token dimatikan: want ErrInviteNotFound, got %v", err)
	}
}

func TestInviteLink_ConcurrentCreateKeepsOneActive(t *testing.T) {
	f := setupInvite(t, "inv_conc.db")
	var wg sync.WaitGroup
	tokens := make([]string, 8)
	for i := range tokens {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if l, err := f.inv.CreateOrReset(t.Context(), f.groupID, f.creator, false); err == nil {
				tokens[i] = l.Token
			}
		}(i)
	}
	wg.Wait()
	var active int
	if err := f.ms.DB().QueryRow(rebindPG(f.ms, `SELECT COUNT(*) FROM group_invite_links WHERE conversation_id = ? AND revoked_at IS NULL`), f.groupID).Scan(&active); err != nil || active != 1 {
		t.Fatalf("tautan aktif: want 1, got %d %v", active, err)
	}
	for _, tok := range tokens {
		if tok != "" && tok != tokens[0] && tokens[0] != "" {
			t.Fatalf("permintaan bersamaan menerima token berbeda: %v", tokens)
		}
	}
}

func TestInviteLink_PublicGroupRejected(t *testing.T) {
	f := setupInvite(t, "inv_public.db")
	ctx := t.Context()
	tok := f.link(t)
	pub := true
	if err := f.gs.UpdateGroupInfo(f.groupID, f.creator, "Grup Rahasia", "", "", &pub, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := f.inv.Preview(ctx, tok, f.guest); !errors.Is(err, store.ErrInviteNotFound) {
		t.Fatalf("grup publik: want ErrInviteNotFound, got %v", err)
	}
	if _, err := f.inv.CreateOrReset(ctx, f.groupID, f.creator, false); !errors.Is(err, store.ErrInviteNotPrivate) {
		t.Fatalf("buat untuk grup publik: want ErrInviteNotPrivate, got %v", err)
	}
	if l, err := f.inv.GetActive(ctx, f.groupID, f.creator); err != nil || l != nil {
		t.Fatalf("GetActive grup publik: want nil, got %v %v", l, err)
	}
}

func TestInviteLink_PreviewAndRequestFlow(t *testing.T) {
	f := setupInvite(t, "inv_flow.db")
	ctx := t.Context()
	tok := f.link(t)

	if _, err := f.inv.Preview(ctx, "XXXXXXXXXXXXXXXX", f.guest); !errors.Is(err, store.ErrInviteNotFound) {
		t.Fatalf("token tak dikenal: %v", err)
	}
	if _, err := f.inv.Preview(ctx, "bukan-token", f.guest); !errors.Is(err, store.ErrInviteNotFound) {
		t.Fatalf("bentuk salah: %v", err)
	}
	p, err := f.inv.Preview(ctx, tok, f.guest)
	if err != nil || p.GroupID != f.groupID || p.Title != "Grup Rahasia" || p.MemberCount != 3 || p.MyStatus != store.InviteStatusNone {
		t.Fatalf("pratinjau tamu: %+v %v", p, err)
	}
	if p, _ := f.inv.Preview(ctx, tok, f.member); p.MyStatus != store.InviteStatusMember {
		t.Fatalf("pratinjau anggota: %+v", p)
	}
	if r, err := f.inv.RequestJoin(ctx, tok, f.member); err != nil || r.Status != store.InviteStatusMember || r.Created {
		t.Fatalf("anggota mengajukan: %+v %v", r, err)
	}

	r, err := f.inv.RequestJoin(ctx, tok, f.guest)
	if err != nil || r.Status != store.InviteStatusPending || !r.Created {
		t.Fatalf("ajukan pertama: %+v %v", r, err)
	}
	r, err = f.inv.RequestJoin(ctx, tok, f.guest)
	if err != nil || r.Status != store.InviteStatusPending || r.Created {
		t.Fatalf("ajukan ulang (idempoten) tidak boleh memicu notifikasi: %+v %v", r, err)
	}
	if p, _ := f.inv.Preview(ctx, tok, f.guest); p.MyStatus != store.InviteStatusPending {
		t.Fatalf("pratinjau setelah ajukan: %+v", p)
	}

	if _, err := f.inv.ListPending(ctx, f.groupID, f.member); !errors.Is(err, store.ErrUnauthorizedGroup) {
		t.Fatalf("anggota biasa melihat daftar: %v", err)
	}
	items, err := f.inv.ListPending(ctx, f.groupID, f.admin)
	if err != nil || len(items) != 1 || items[0].UserID != f.guest || items[0].Username != "inv_guest" {
		t.Fatalf("daftar pending: %+v %v", items, err)
	}
	var linkID string
	if err := f.ms.DB().QueryRow(rebindPG(f.ms, `SELECT COALESCE(invite_link_id, '') FROM conversation_join_requests WHERE id = ?`), items[0].ID).Scan(&linkID); err != nil || linkID == "" {
		t.Fatalf("invite_link_id harus tercatat: %q %v", linkID, err)
	}

	if _, err := f.inv.Respond(ctx, f.groupID, items[0].ID, f.member, true); !errors.Is(err, store.ErrUnauthorizedGroup) {
		t.Fatalf("anggota biasa menyetujui: %v", err)
	}
	target, err := f.inv.Respond(ctx, f.groupID, items[0].ID, f.admin, true)
	if err != nil || target != f.guest {
		t.Fatalf("setujui: %q %v", target, err)
	}
	if role, _ := f.gs.GetUserRoleInGroup(f.groupID, f.guest); role != "member" {
		t.Fatalf("pemohon harus jadi member, got %q", role)
	}
	if _, err := f.inv.Respond(ctx, f.groupID, items[0].ID, f.creator, false); !errors.Is(err, store.ErrJoinRequestProcessed) {
		t.Fatalf("proses ganda: want ErrJoinRequestProcessed, got %v", err)
	}
	if _, err := f.inv.Respond(ctx, f.groupID, "req_tidak_ada", f.creator, true); !errors.Is(err, store.ErrJoinRequestNotFound) {
		t.Fatalf("request tak ada: %v", err)
	}

	// Dikeluarkan admin, lalu mengajukan lagi lewat tautan: baris lama (approved) diaktifkan kembali.
	if err := f.gs.RemoveGroupMember(f.groupID, f.creator, f.guest); err != nil {
		t.Fatal(err)
	}
	if r, err := f.inv.RequestJoin(ctx, tok, f.guest); err != nil || !r.Created || r.Status != store.InviteStatusPending {
		t.Fatalf("ajukan lagi setelah dikeluarkan: %+v %v", r, err)
	}
}

func TestInviteLink_RejectCooldownAndCancel(t *testing.T) {
	f := setupInvite(t, "inv_cool.db")
	ctx := t.Context()
	tok := f.link(t)

	if _, err := f.inv.RequestJoin(ctx, tok, f.guest); err != nil {
		t.Fatal(err)
	}
	items, _ := f.inv.ListPending(ctx, f.groupID, f.creator)
	if _, err := f.inv.Respond(ctx, f.groupID, items[0].ID, f.creator, false); err != nil {
		t.Fatal(err)
	}
	if role, _ := f.gs.GetUserRoleInGroup(f.groupID, f.guest); role != "" {
		t.Fatalf("ditolak tidak boleh jadi anggota, got %q", role)
	}

	*f.clock = f.clock.Add(23 * time.Hour)
	_, err := f.inv.RequestJoin(ctx, tok, f.guest)
	var cd *store.RejoinCooldownError
	if !errors.Is(err, store.ErrRejoinCooldown) || !errors.As(err, &cd) || cd.RetryAfter <= 0 || cd.RetryAfter > time.Hour+time.Second {
		t.Fatalf("dalam jeda: want RejoinCooldownError ±1 jam, got %v", err)
	}
	if p, _ := f.inv.Preview(ctx, tok, f.guest); p.MyStatus != store.InviteStatusRejected || p.RetryAfterSeconds <= 0 {
		t.Fatalf("pratinjau dalam jeda: %+v", p)
	}

	*f.clock = f.clock.Add(2 * time.Hour)
	if r, err := f.inv.RequestJoin(ctx, tok, f.guest); err != nil || !r.Created {
		t.Fatalf("setelah jeda: %+v %v", r, err)
	}

	// Batal lewat tautan yang sudah direset tetap boleh; pengajuan menunggu tetap ada setelah reset.
	if _, err := f.inv.CreateOrReset(ctx, f.groupID, f.creator, true); err != nil {
		t.Fatal(err)
	}
	if items, _ := f.inv.ListPending(ctx, f.groupID, f.creator); len(items) != 1 {
		t.Fatalf("pending harus bertahan setelah reset: %d", len(items))
	}
	if _, err := f.inv.CancelRequest(ctx, tok, f.guest); err != nil {
		t.Fatalf("batal: %v", err)
	}
	if _, err := f.inv.CancelRequest(ctx, tok, f.guest); !errors.Is(err, store.ErrJoinRequestNotFound) {
		t.Fatalf("batal ganda: %v", err)
	}
	if items, _ := f.inv.ListPending(ctx, f.groupID, f.creator); len(items) != 0 {
		t.Fatalf("setelah batal: %d", len(items))
	}
}

func TestInviteLink_PendingCapAndTenant(t *testing.T) {
	f := setupInvite(t, "inv_cap.db")
	ctx := t.Context()
	tok := f.link(t)
	db := f.ms.DB()
	now := time.Now().UTC()
	for i := range store.InviteMaxPendingPerGroup {
		if _, err := db.Exec(rebindPG(f.ms, `INSERT INTO conversation_join_requests (id, conversation_id, user_id, status, reviewed_by, created_at, updated_at)
			VALUES (?, ?, ?, 'pending', '', ?, ?)`), "req_cap_"+itoa(i), f.groupID, "u_cap_"+itoa(i), now, now); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.inv.RequestJoin(ctx, tok, f.guest); !errors.Is(err, store.ErrTooManyPending) {
		t.Fatalf("batas pending: want ErrTooManyPending, got %v", err)
	}

	if _, err := db.Exec(rebindPG(f.ms, `UPDATE users SET tenant_id = 'tenant_lain' WHERE id = ?`), f.guest); err != nil {
		t.Fatal(err)
	}
	if _, err := f.inv.Preview(ctx, tok, f.guest); !errors.Is(err, store.ErrInviteNotFound) {
		t.Fatalf("beda tenant: want ErrInviteNotFound, got %v", err)
	}
}

func itoa(i int) string {
	const digits = "0123456789"
	if i == 0 {
		return "0"
	}
	var b []byte
	for ; i > 0; i /= 10 {
		b = append([]byte{digits[i%10]}, b...)
	}
	return string(b)
}
