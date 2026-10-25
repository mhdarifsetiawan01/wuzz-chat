package game_test

import (
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/game"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

// exec menjalankan SQL mentah pada database uji (placeholder ? diubah ke $n untuk Postgres).
func (e *env) exec(q string, args ...any) {
	e.t.Helper()
	if e.ms.DriverName() == "postgres" {
		var b strings.Builder
		n := 0
		for _, c := range q {
			if c == '?' {
				n++
				b.WriteString("$" + strconv.Itoa(n))
				continue
			}
			b.WriteRune(c)
		}
		q = b.String()
	}
	if _, err := e.ms.DB().Exec(q, args...); err != nil {
		e.t.Fatalf("exec (%s): %v", q, err)
	}
}

func (e *env) newUser(name string) string {
	e.t.Helper()
	u, err := store.NewSQLUserStore(e.ms.DB(), e.ms.DriverName()).Register(name, "Nama "+name, "Secret123!")
	if err != nil {
		e.t.Fatalf("register %s: %v", name, err)
	}
	return u.ID
}

func (e *env) connect(a, b, status string) {
	e.t.Helper()
	now := time.Now().UTC()
	e.exec(`INSERT INTO user_connections (id, tenant_id, requester_id, receiver_id, status, source_type, created_at, updated_at)
		VALUES (?, 'default', ?, ?, ?, 'in_app_request', ?, ?)`, uuid.New().String(), a, b, status, now, now)
}

func (e *env) newGroup(id string, members ...string) {
	e.t.Helper()
	now := time.Now().UTC()
	e.exec(`INSERT INTO conversations (id, tenant_id, type, title, created_at, updated_at) VALUES (?, 'default', 'group', 'Grup Uji', ?, ?)`, id, now, now)
	for _, m := range members {
		e.exec(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`, id, m, now)
	}
}

func (e *env) board(user, scope, group, period string) *game.LeaderboardResponse {
	e.t.Helper()
	res, err := e.svc.Leaderboard(e.ctx, "default", user, scope, group, period)
	if err != nil {
		e.t.Fatalf("leaderboard %s/%s: %v", scope, period, err)
	}
	return res
}

func ids(r *game.LeaderboardResponse) []string {
	out := make([]string, len(r.Entries))
	for i, en := range r.Entries {
		out[i] = en.UserID
	}
	return out
}

func equalIDs(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestBoard_FriendsOnlyAndOrderedByTime(t *testing.T) {
	e := newEnv(t, true)
	me, fast, slow, stranger := e.newUser("me"), e.newUser("fast"), e.newUser("slow"), e.newUser("stranger")
	e.connect(me, fast, "accepted")
	e.connect(slow, me, "accepted") // arah relasi tidak berpengaruh
	e.connect(me, stranger, "pending")

	e.solve(me, 90*time.Second)
	e.solve(fast, 40*time.Second)
	e.solve(slow, 120*time.Second)
	e.solve(stranger, 10*time.Second) // tercepat, tapi bukan teman

	res := e.board(me, game.ScopeFriends, "", game.PeriodDay)
	if want := []string{fast, me, slow}; !equalIDs(ids(res), want) {
		t.Fatalf("urutan %v, mau %v (stranger/pending tidak boleh tampil)", ids(res), want)
	}
	if res.MyRank == nil || *res.MyRank != 2 || !res.Entries[1].IsMe {
		t.Errorf("peringkat saya: %v / %+v", res.MyRank, res.Entries[1])
	}
	if res.Entries[0].DurationMs != 40_000 || res.Entries[0].DisplayName != "Nama fast" || res.Entries[0].Username != "fast" {
		t.Errorf("baris pertama: %+v", res.Entries[0])
	}
	if res.Scope != game.ScopeFriends || res.Period != game.PeriodDay || res.From != res.To {
		t.Errorf("metadata: %+v", res)
	}
}

func TestBoard_BlockedUsersHiddenBothDirections(t *testing.T) {
	e := newEnv(t, true)
	me, friend, blockedByMe, blocksMe := e.newUser("me"), e.newUser("friend"), e.newUser("bbm"), e.newUser("bm")
	e.connect(me, friend, "accepted")
	e.newGroup("grp_blk", me, friend, blockedByMe, blocksMe)
	e.connect(me, blockedByMe, "blocked") // saya memblokir
	e.connect(blocksMe, me, "blocked")    // saya diblokir

	for _, u := range []string{me, friend, blockedByMe, blocksMe} {
		e.solve(u, 60*time.Second)
	}

	res := e.board(me, game.ScopeGroup, "grp_blk", game.PeriodDay)
	got := map[string]bool{}
	for _, id := range ids(res) {
		got[id] = true
	}
	if !got[me] || !got[friend] || got[blockedByMe] || got[blocksMe] {
		t.Fatalf("papan grup %v: harus memuat saya+teman saja, tanpa yang berhubungan blokir", ids(res))
	}
	// Pemblokir juga tidak melihat saya, karena blokir berlaku dari sudut pandang pemanggil.
	other := e.board(blocksMe, game.ScopeGroup, "grp_blk", game.PeriodDay)
	for _, id := range ids(other) {
		if id == me {
			t.Errorf("pengguna yang memblokir tidak boleh melihat saya: %v", ids(other))
		}
	}
}

func TestBoard_SuspiciousAndUnfinishedExcluded(t *testing.T) {
	e := newEnv(t, true)
	me, cheat, idle, playing := e.newUser("me"), e.newUser("cheat"), e.newUser("idle"), e.newUser("playing")
	for _, f := range []string{cheat, idle, playing} {
		e.connect(me, f, "accepted")
	}
	e.solve(me, 80*time.Second)
	e.solve(cheat, 300*time.Millisecond) // suspicious
	e.puzzle(idle)                       // hanya melihat, tidak memulai
	if _, err := e.svc.Start(e.ctx, "default", playing); err != nil {
		t.Fatal(err)
	}

	res := e.board(me, game.ScopeFriends, "", game.PeriodDay)
	if want := []string{me}; !equalIDs(ids(res), want) {
		t.Fatalf("papan %v, mau hanya %v", ids(res), want)
	}
}

func TestBoard_GroupRequiresMembershipAndParentGroup(t *testing.T) {
	e := newEnv(t, true)
	member, outsider := e.newUser("member"), e.newUser("outsider")
	e.newGroup("grp_priv", member)
	e.solve(member, 60*time.Second)

	if _, err := e.svc.Leaderboard(e.ctx, "default", outsider, game.ScopeGroup, "grp_priv", game.PeriodDay); !errors.Is(err, game.ErrNotGroupMember) {
		t.Errorf("bukan anggota: %v", err)
	}
	for _, id := range []string{"", "sub_x", "dm_a_b", "grp"} {
		if _, err := e.svc.Leaderboard(e.ctx, "default", member, game.ScopeGroup, id, game.PeriodDay); !errors.Is(err, game.ErrInvalidBoard) {
			t.Errorf("group_id %q: %v, mau ErrInvalidBoard", id, err)
		}
	}
	if res := e.board(member, game.ScopeGroup, "grp_priv", game.PeriodDay); len(res.Entries) != 1 || res.Entries[0].UserID != member {
		t.Errorf("anggota melihat dirinya: %+v", res.Entries)
	}
}

func TestBoard_RejectsUnknownScopeAndPeriod(t *testing.T) {
	e := newEnv(t, true)
	u := e.newUser("u")
	for _, c := range [][2]string{{"global", game.PeriodDay}, {"", game.PeriodDay}, {game.ScopeFriends, "month"}, {game.ScopeFriends, ""}} {
		if _, err := e.svc.Leaderboard(e.ctx, "default", u, c[0], "", c[1]); !errors.Is(err, game.ErrInvalidBoard) {
			t.Errorf("scope %q period %q: %v", c[0], c[1], err)
		}
	}
	off := newEnv(t, false)
	if _, err := off.svc.Leaderboard(off.ctx, "default", u, game.ScopeFriends, "", game.PeriodDay); !errors.Is(err, game.ErrDisabled) {
		t.Errorf("fitur mati: %v", err)
	}
}

func TestBoard_WeekAggregatesDaysThenTotalTime(t *testing.T) {
	e := newEnv(t, true)
	me, steady, flash := e.newUser("me"), e.newUser("steady"), e.newUser("flash")
	e.connect(me, steady, "accepted")
	e.connect(me, flash, "accepted")

	// Senin 2026-10-26: semua main. Selasa: hanya me dan steady main.
	e.solve(me, 100*time.Second)
	e.solve(steady, 60*time.Second)
	e.solve(flash, 20*time.Second)
	e.advance(24 * time.Hour)
	e.solve(me, 100*time.Second)
	e.solve(steady, 90*time.Second)

	week := e.board(me, game.ScopeFriends, "", game.PeriodWeek)
	// steady: 2 hari, 150 dtk; me: 2 hari, 200 dtk; flash: 1 hari, 20 dtk (lebih sedikit hari => di bawah).
	if want := []string{steady, me, flash}; !equalIDs(ids(week), want) {
		t.Fatalf("papan minggu %v, mau %v", ids(week), want)
	}
	if week.Entries[0].SolvedDays != 2 || week.Entries[0].DurationMs != 150_000 {
		t.Errorf("agregat steady: %+v", week.Entries[0])
	}
	if week.From != "2026-10-26" || week.To != "2026-10-27" {
		t.Errorf("rentang minggu %s..%s", week.From, week.To)
	}

	day := e.board(me, game.ScopeFriends, "", game.PeriodDay)
	if want := []string{steady, me}; !equalIDs(ids(day), want) { // flash tidak main hari ini
		t.Fatalf("papan hari %v, mau %v", ids(day), want)
	}

	// Minggu baru: papan mingguan dimulai dari nol.
	e.advance(6 * 24 * time.Hour) // Senin 2026-11-02
	next := e.board(me, game.ScopeFriends, "", game.PeriodWeek)
	if len(next.Entries) != 0 || next.MyRank != nil {
		t.Errorf("minggu baru harus kosong: %+v", next)
	}
}

func TestBoard_TiesShareRankAndTenantsAreIsolated(t *testing.T) {
	e := newEnv(t, true)
	a, b := e.newUser("a"), e.newUser("b")
	e.connect(a, b, "accepted")
	e.solve(a, 60*time.Second)
	// b mulai pada detik yang sama a selesai, lalu selesai 60 dtk kemudian => waktu persis sama
	e.solve(b, 60*time.Second)

	res := e.board(a, game.ScopeFriends, "", game.PeriodDay)
	if len(res.Entries) != 2 || res.Entries[0].Rank != 1 || res.Entries[1].Rank != 1 {
		t.Fatalf("waktu sama harus berperingkat sama: %+v", res.Entries)
	}

	// Tenant lain tidak melihat papan tenant default.
	other, err := e.svc.Leaderboard(e.ctx, "tenantB", a, game.ScopeFriends, "", game.PeriodDay)
	if err != nil || len(other.Entries) != 0 {
		t.Fatalf("tenant lain: %+v %v", other, err)
	}
}

// optIn menyalakan leaderboard_public untuk pengguna.
func (e *env) optIn(user string) {
	e.t.Helper()
	yes := true
	if _, err := e.svc.UpdateSettings(e.ctx, "default", user, game.SettingsInput{LeaderboardPublic: &yes}); err != nil {
		e.t.Fatalf("opt-in %s: %v", user, err)
	}
}

func TestBoard_PublicOnlyOptedInAndNeverCarriesNameOrAvatar(t *testing.T) {
	e := newEnv(t, true)
	me, star, shy, friend := e.newUser("me"), e.newUser("star"), e.newUser("shy"), e.newUser("friend")
	e.connect(me, friend, "accepted")
	e.exec(`UPDATE users SET avatar_url = '/uploads/a.png' WHERE id = ?`, star)

	e.solve(star, 30*time.Second)
	e.solve(shy, 20*time.Second)    // tercepat, tapi tidak opt-in
	e.solve(friend, 25*time.Second) // teman, tapi tidak opt-in
	e.solve(me, 50*time.Second)
	e.optIn(star)

	// Pemanggil yang tidak opt-in tetap boleh melihat papan, tetapi dirinya tidak ikut tampil.
	res := e.board(me, game.ScopePublic, "", game.PeriodDay)
	if want := []string{star}; !equalIDs(ids(res), want) {
		t.Fatalf("papan publik %v, mau %v (hanya yang opt-in)", ids(res), want)
	}
	if res.MyRank != nil {
		t.Errorf("pemanggil yang belum opt-in tidak boleh punya peringkat: %v", *res.MyRank)
	}
	got := res.Entries[0]
	if got.Username != "star" || got.DurationMs != 30_000 {
		t.Errorf("baris: %+v", got)
	}
	if got.DisplayName != "" || got.AvatarURL != "" {
		t.Errorf("papan publik tidak boleh membawa nama tampilan/foto: %+v", got)
	}

	// Setelah opt-in, pemanggil tampil dengan peringkat; teman yang tidak opt-in tetap tidak tampil.
	e.optIn(me)
	res = e.board(me, game.ScopePublic, "", game.PeriodDay)
	if want := []string{star, me}; !equalIDs(ids(res), want) {
		t.Fatalf("setelah opt-in %v, mau %v", ids(res), want)
	}
	if res.MyRank == nil || *res.MyRank != 2 || !res.Entries[1].IsMe {
		t.Errorf("peringkat saya: %v", res.MyRank)
	}

	// Papan teman tetap membawa nama (privasi hanya berlaku untuk papan publik).
	if fr := e.board(me, game.ScopeFriends, "", game.PeriodDay); fr.Entries[0].DisplayName == "" {
		t.Errorf("papan teman harus tetap membawa nama: %+v", fr.Entries)
	}

	// Mencabut opt-in langsung menghapus dari papan publik.
	no := false
	if _, err := e.svc.UpdateSettings(e.ctx, "default", star, game.SettingsInput{LeaderboardPublic: &no}); err != nil {
		t.Fatal(err)
	}
	if res = e.board(me, game.ScopePublic, "", game.PeriodDay); !equalIDs(ids(res), []string{me}) {
		t.Errorf("setelah mencabut opt-in: %v", ids(res))
	}
}

func TestBoard_PublicRespectsBlockAndStaffHide(t *testing.T) {
	e := newEnv(t, true)
	me, blocked, troll, ok := e.newUser("me"), e.newUser("blocked"), e.newUser("troll"), e.newUser("ok")
	e.connect(me, blocked, "blocked")
	for _, u := range []string{me, blocked, troll, ok} {
		e.solve(u, 60*time.Second)
		e.optIn(u)
	}

	res := e.board(me, game.ScopePublic, "", game.PeriodDay)
	got := map[string]bool{}
	for _, id := range ids(res) {
		got[id] = true
	}
	if got[blocked] || !got[troll] || !got[ok] || !got[me] {
		t.Fatalf("blokir harus tetap berlaku di papan publik: %v", ids(res))
	}

	// Staf mengeluarkan troll: hilang dari papan semua orang, akun tidak disentuh.
	if err := e.svc.SetBoardHidden(e.ctx, "default", "staff1", troll, true, ""); !errors.Is(err, game.ErrNoteRequired) {
		t.Fatalf("catatan wajib saat mengeluarkan: %v", err)
	}
	if err := e.svc.SetBoardHidden(e.ctx, "default", "staff1", troll, true, "nama menyinggung"); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.SetBoardHidden(e.ctx, "default", "staff1", troll, true, "diulang"); err != nil {
		t.Fatalf("idempoten: %v", err)
	}
	if hidden, _ := e.svc.IsBoardHidden(e.ctx, "default", troll); !hidden {
		t.Error("IsBoardHidden harus true")
	}
	for _, viewer := range []string{me, ok, troll} {
		for _, id := range ids(e.board(viewer, game.ScopePublic, "", game.PeriodDay)) {
			if id == troll {
				t.Fatalf("pengguna yang dikeluarkan staf masih tampil bagi %s", viewer)
			}
		}
	}
	// Tetap tampil di papan teman/grup (moderasi hanya untuk papan publik).
	e.connect(me, troll, "accepted")
	if fr := e.board(me, game.ScopeFriends, "", game.PeriodDay); !contains(ids(fr), troll) {
		t.Errorf("papan teman tidak boleh terpengaruh: %v", ids(fr))
	}

	// Dikembalikan: tampil lagi; jejak audit mencatat hide, hide, show.
	if err := e.svc.SetBoardHidden(e.ctx, "default", "staff1", troll, false, ""); err != nil {
		t.Fatal(err)
	}
	if !contains(ids(e.board(me, game.ScopePublic, "", game.PeriodDay)), troll) {
		t.Error("setelah dikembalikan harus tampil lagi")
	}
	rows, err := e.ms.DB().Query(rebindFor(e, `SELECT action FROM game_board_audit WHERE user_id = ? ORDER BY created_at, action`), troll)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var actions []string
	for rows.Next() {
		var a string
		_ = rows.Scan(&a)
		actions = append(actions, a)
	}
	if len(actions) != 3 {
		t.Errorf("audit %v, mau 3 entri (hide, hide, show)", actions)
	}
}

func TestBoard_PublicIsTenantScoped(t *testing.T) {
	e := newEnv(t, true)
	u := e.newUser("u")
	e.solve(u, 40*time.Second)
	e.optIn(u)
	other, err := e.svc.Leaderboard(e.ctx, "tenantB", u, game.ScopePublic, "", game.PeriodDay)
	if err != nil || len(other.Entries) != 0 {
		t.Fatalf("tenant lain tidak boleh melihat papan publik tenant default: %+v %v", other, err)
	}
}

func contains(list []string, id string) bool {
	for _, v := range list {
		if v == id {
			return true
		}
	}
	return false
}

func rebindFor(e *env, q string) string {
	if e.ms.DriverName() != "postgres" {
		return q
	}
	return strings.Replace(q, "?", "$1", 1)
}
