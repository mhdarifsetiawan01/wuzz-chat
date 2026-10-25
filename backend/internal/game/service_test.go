package game_test

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/game"
	gameinfra "github.com/bms-del112/wuzz-chat/internal/game/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/testutil/pgtest"
)

type env struct {
	t   *testing.T
	svc *game.Service
	ms  *store.SQLMessageStore
	ctx context.Context
	now time.Time
	mu  sync.Mutex
}

// newEnv membuka database uji (SQLite, atau Postgres bila PG_TEST_ADMIN_DSN diisi) dengan jam yang bisa digeser.
func newEnv(t *testing.T, enabled bool) *env {
	t.Helper()
	driver, target := "sqlite", filepath.Join(t.TempDir(), "game.db")
	if dsn, ok := pgtest.NewDSN(t); ok {
		driver, target = "postgres", dsn
	}
	ms, err := store.NewSQLMessageStore(driver, target)
	if err != nil {
		t.Fatalf("init store (%s): %v", driver, err)
	}
	t.Cleanup(func() { ms.Close() })

	e := &env{
		t:   t,
		ms:  ms,
		ctx: context.Background(),
		now: time.Date(2026, 10, 26, 8, 0, 0, 0, time.UTC), // Senin 15.00 WIB
	}
	e.svc = game.NewService(gameinfra.NewSQLRepository(ms.DB(), ms.DriverName()), enabled)
	e.svc.SetClock(func() time.Time {
		e.mu.Lock()
		defer e.mu.Unlock()
		return e.now
	})
	return e
}

func (e *env) advance(d time.Duration) {
	e.mu.Lock()
	e.now = e.now.Add(d)
	e.mu.Unlock()
}

func (e *env) puzzle(user string) *game.Puzzle {
	e.t.Helper()
	res, err := e.svc.Today(e.ctx, "default", user)
	if err != nil || res.Puzzle == nil {
		e.t.Fatalf("today: %v %+v", err, res)
	}
	return res.Puzzle
}

// solve memulai lalu menyelesaikan puzzle hari ini setelah jeda wajar.
func (e *env) solve(user string, after time.Duration) *game.SubmitResult {
	e.t.Helper()
	p := e.puzzle(user)
	if _, err := e.svc.Start(e.ctx, "default", user); err != nil {
		e.t.Fatalf("start: %v", err)
	}
	e.advance(after)
	res, err := e.svc.Submit(e.ctx, "default", user, game.Placement(p.Solution))
	if err != nil {
		e.t.Fatalf("submit: %v", err)
	}
	return res
}

func TestService_DisabledByDefault(t *testing.T) {
	e := newEnv(t, false)
	res, err := e.svc.Today(e.ctx, "default", "u1")
	if err != nil || res.Enabled || res.Puzzle != nil {
		t.Fatalf("today saat mati: %+v %v", res, err)
	}
	if _, err := e.svc.Start(e.ctx, "default", "u1"); !errors.Is(err, game.ErrDisabled) {
		t.Errorf("start: %v", err)
	}
	if _, err := e.svc.Submit(e.ctx, "default", "u1", nil); !errors.Is(err, game.ErrDisabled) {
		t.Errorf("submit: %v", err)
	}
	if _, err := e.svc.GetSettings(e.ctx, "default", "u1"); !errors.Is(err, game.ErrDisabled) {
		t.Errorf("settings: %v", err)
	}
	var n int
	if err := e.ms.DB().QueryRow(`SELECT COUNT(*) FROM game_puzzles`).Scan(&n); err != nil || n != 0 {
		t.Errorf("fitur mati tidak boleh membuat puzzle: n=%d err=%v", n, err)
	}
}

func TestService_TodayCreatesStablePuzzle(t *testing.T) {
	e := newEnv(t, true)
	a := e.puzzle("u1")
	b := e.puzzle("u2")
	if a.Date != "2026-10-26" || a.Size != 6 {
		t.Fatalf("Senin harus 6x6 tanggal 2026-10-26: %+v", a)
	}
	if a.Seed != b.Seed || len(a.Solution) != a.Size {
		t.Fatalf("semua pengguna harus mendapat puzzle yang sama")
	}
	res, _ := e.svc.Today(e.ctx, "default", "u1")
	if res.Number != 2 { // epoch 2026-10-25 = #1, jadi Senin 2026-10-26 = #2
		t.Errorf("nomor puzzle %d, mau 2", res.Number)
	}
	if res.Attempt != nil || res.Streak == nil || res.Streak.Current != 0 {
		t.Errorf("belum mulai: attempt=%v streak=%+v", res.Attempt, res.Streak)
	}
}

func TestService_StartIsIdempotent(t *testing.T) {
	e := newEnv(t, true)
	first, err := e.svc.Start(e.ctx, "default", "u1")
	if err != nil {
		t.Fatal(err)
	}
	e.advance(30 * time.Second)
	second, err := e.svc.Start(e.ctx, "default", "u1")
	if err != nil {
		t.Fatal(err)
	}
	if !first.Attempt.StartedAt.Equal(second.Attempt.StartedAt) {
		t.Fatalf("started_at berubah: %v -> %v", first.Attempt.StartedAt, second.Attempt.StartedAt)
	}
}

func TestService_SubmitRequiresStart(t *testing.T) {
	e := newEnv(t, true)
	p := e.puzzle("u1")
	if _, err := e.svc.Submit(e.ctx, "default", "u1", game.Placement(p.Solution)); !errors.Is(err, game.ErrAttemptNotFound) {
		t.Fatalf("err %v, mau ErrAttemptNotFound", err)
	}
}

func TestService_SolveComputesServerSideDurationAndStreak(t *testing.T) {
	e := newEnv(t, true)
	res := e.solve("u1", 95*time.Second)
	if !res.Solved || res.Attempt.Status != game.StatusSolved {
		t.Fatalf("hasil: %+v", res)
	}
	if res.Attempt.DurationMs != 95_000 {
		t.Errorf("durasi %dms, mau 95000", res.Attempt.DurationMs)
	}
	if res.Streak.Current != 1 || res.Streak.Best != 1 {
		t.Errorf("streak: %+v", res.Streak)
	}

	// Kirim ulang: hasil tidak berubah dan streak tidak naik dua kali.
	p := e.puzzle("u1")
	e.advance(time.Minute)
	again, err := e.svc.Submit(e.ctx, "default", "u1", game.Placement(p.Solution))
	if err != nil || !again.Solved || again.Attempt.DurationMs != 95_000 || again.Streak.Current != 1 {
		t.Fatalf("kirim ulang: %+v %v", again, err)
	}
}

func TestService_WrongAnswersCountOnlyWhenComplete(t *testing.T) {
	e := newEnv(t, true)
	p := e.puzzle("u1")
	if _, err := e.svc.Start(e.ctx, "default", "u1"); err != nil {
		t.Fatal(err)
	}
	e.advance(20 * time.Second)

	partial := make(game.Placement, p.Size)
	for i := range partial {
		partial[i] = game.NoStar
	}
	partial[0] = p.Solution[0]
	res, err := e.svc.Submit(e.ctx, "default", "u1", partial)
	if err != nil || res.Solved || res.Attempt.Mistakes != 0 {
		t.Fatalf("belum lengkap: %+v %v", res, err)
	}

	wrong := append(game.Placement(nil), p.Solution...)
	wrong[1] = wrong[0] // satu kolom sama: lengkap tapi salah
	res, err = e.svc.Submit(e.ctx, "default", "u1", wrong)
	if err != nil || res.Solved || res.Attempt.Mistakes != 1 || res.Attempt.Status != game.StatusPlaying {
		t.Fatalf("lengkap salah: %+v %v", res, err)
	}

	// Waktu tetap berjalan dari percobaan pertama; benar setelah salah tetap sah.
	e.advance(10 * time.Second)
	res, err = e.svc.Submit(e.ctx, "default", "u1", game.Placement(p.Solution))
	if err != nil || !res.Solved || res.Attempt.DurationMs != 30_000 || res.Attempt.Mistakes != 1 {
		t.Fatalf("benar setelah salah: %+v %v", res, err)
	}
}

func TestService_InvalidPlacementRejected(t *testing.T) {
	e := newEnv(t, true)
	if _, err := e.svc.Start(e.ctx, "default", "u1"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Submit(e.ctx, "default", "u1", game.Placement{1, 2}); !errors.Is(err, game.ErrInvalidPlacement) {
		t.Fatalf("panjang salah: %v", err)
	}
}

func TestService_ImpossiblyFastSolveIsSuspiciousAndSkipsStreak(t *testing.T) {
	e := newEnv(t, true)
	res := e.solve("u1", 500*time.Millisecond)
	if res.Attempt.Status != game.StatusSuspicious {
		t.Fatalf("status %q, mau suspicious", res.Attempt.Status)
	}
	if res.Streak.Current != 0 {
		t.Errorf("streak tidak boleh naik: %+v", res.Streak)
	}
}

func TestService_ConcurrentSubmitCountsStreakOnce(t *testing.T) {
	e := newEnv(t, true)
	p := e.puzzle("u1")
	if _, err := e.svc.Start(e.ctx, "default", "u1"); err != nil {
		t.Fatal(err)
	}
	e.advance(60 * time.Second)

	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = e.svc.Submit(e.ctx, "default", "u1", game.Placement(p.Solution))
		}()
	}
	wg.Wait()

	res, _ := e.svc.Today(e.ctx, "default", "u1")
	if res.Streak.Current != 1 || res.Attempt.Status != game.StatusSolved {
		t.Fatalf("streak %+v attempt %+v", res.Streak, res.Attempt)
	}
}

func TestService_StreakAcrossDays(t *testing.T) {
	e := newEnv(t, true)
	e.solve("u1", time.Minute) // Senin
	e.advance(24 * time.Hour)
	if res := e.solve("u1", time.Minute); res.Streak.Current != 2 { // Selasa
		t.Fatalf("hari ke-2: %+v", res.Streak)
	}
	e.advance(48 * time.Hour) // Kamis, Rabu terlewat: pembeku minggu ini terpakai
	if res := e.solve("u1", time.Minute); res.Streak.Current != 3 {
		t.Fatalf("pembeku harus menutup Rabu: %+v", res.Streak)
	}
	e.advance(72 * time.Hour) // Minggu: Jumat dan Sabtu terlewat -> putus
	today, _ := e.svc.Today(e.ctx, "default", "u1")
	if today.Streak.Current != 0 {
		t.Fatalf("tampilan streak harus 0 saat sudah pasti putus: %+v", today.Streak)
	}
	if res := e.solve("u1", time.Minute); res.Streak.Current != 1 || res.Streak.Best != 3 {
		t.Fatalf("mulai lagi: %+v", res.Streak)
	}
}

func TestService_PuzzleDateFollowsUserTimezone(t *testing.T) {
	e := newEnv(t, true)
	// 2026-10-26 20:00 UTC = Selasa 03.00 WIB, tetapi masih Senin 13.00 di Los Angeles.
	e.now = time.Date(2026, 10, 26, 20, 0, 0, 0, time.UTC)
	wib := e.puzzle("jakarta")
	la := "america/la"
	tz := "America/Los_Angeles"
	if _, err := e.svc.UpdateSettings(e.ctx, "default", la, game.SettingsInput{Timezone: &tz}); err != nil {
		t.Fatal(err)
	}
	pst := e.puzzle(la)
	if wib.Date != "2026-10-27" || pst.Date != "2026-10-26" {
		t.Fatalf("tanggal WIB %s, LA %s", wib.Date, pst.Date)
	}
	if wib.Size != 6 || pst.Size != 6 { // Selasa dan Senin sama-sama 6
		t.Errorf("ukuran %d/%d", wib.Size, pst.Size)
	}
}

func TestService_SettingsValidationAndCooldown(t *testing.T) {
	e := newEnv(t, true)
	st, err := e.svc.GetSettings(e.ctx, "default", "u1")
	if err != nil || st.Timezone != game.DefaultTimezone || st.LeaderboardPublic || st.ReminderEnabled {
		t.Fatalf("bawaan: %+v %v", st, err)
	}

	bad := "Mars/Olympus"
	if _, err := e.svc.UpdateSettings(e.ctx, "default", "u1", game.SettingsInput{Timezone: &bad}); !errors.Is(err, game.ErrInvalidTimezone) {
		t.Errorf("zona tidak sah: %v", err)
	}
	for _, v := range []string{"", "Local"} {
		v := v
		if _, err := e.svc.UpdateSettings(e.ctx, "default", "u1", game.SettingsInput{Timezone: &v}); !errors.Is(err, game.ErrInvalidTimezone) {
			t.Errorf("%q harus ditolak: %v", v, err)
		}
	}

	yes := true
	tz1, tz2 := "Asia/Makassar", "Asia/Jayapura"
	if _, err := e.svc.UpdateSettings(e.ctx, "default", "u1", game.SettingsInput{LeaderboardPublic: &yes, ReminderEnabled: &yes, Timezone: &tz1}); err != nil {
		t.Fatalf("simpan pertama: %v", err)
	}
	// Penyimpanan pertama tidak memulai masa tunggu: satu koreksi langsung boleh.
	if _, err := e.svc.UpdateSettings(e.ctx, "default", "u1", game.SettingsInput{Timezone: &tz2}); err != nil {
		t.Fatalf("koreksi pertama: %v", err)
	}
	if _, err := e.svc.UpdateSettings(e.ctx, "default", "u1", game.SettingsInput{Timezone: &tz1}); !errors.Is(err, game.ErrTimezoneLocked) {
		t.Fatalf("harus terkunci 24 jam: %v", err)
	}
	e.advance(25 * time.Hour)
	if _, err := e.svc.UpdateSettings(e.ctx, "default", "u1", game.SettingsInput{Timezone: &tz1}); err != nil {
		t.Fatalf("setelah 24 jam: %v", err)
	}
	got, _ := e.svc.GetSettings(e.ctx, "default", "u1")
	if got.Timezone != tz1 || !got.LeaderboardPublic || !got.ReminderEnabled {
		t.Fatalf("tersimpan: %+v", got)
	}
}

func TestService_TenantIsolation(t *testing.T) {
	e := newEnv(t, true)
	p := e.puzzle("u1")
	if _, err := e.svc.Start(e.ctx, "tenantA", "u1"); err != nil {
		t.Fatal(err)
	}
	e.advance(time.Minute)
	if _, err := e.svc.Submit(e.ctx, "tenantA", "u1", game.Placement(p.Solution)); err != nil {
		t.Fatal(err)
	}
	other, _ := e.svc.Today(e.ctx, "tenantB", "u1")
	if other.Attempt != nil || other.Streak.Current != 0 {
		t.Fatalf("tenant lain tidak boleh melihat percobaan/streak: %+v %+v", other.Attempt, other.Streak)
	}
}

func TestAccountErasure_RemovesGameData(t *testing.T) {
	e := newEnv(t, true)
	us := store.NewSQLUserStore(e.ms.DB(), e.ms.DriverName())
	alice, err := us.Register("game_alice", "Alice", "Secret123!")
	if err != nil {
		t.Fatal(err)
	}
	bob, err := us.Register("game_bob", "Bob", "Secret123!")
	if err != nil {
		t.Fatal(err)
	}
	yes := true
	for _, u := range []string{alice.ID, bob.ID} {
		e.solve(u, time.Minute)
		if _, err := e.svc.UpdateSettings(e.ctx, "default", u, game.SettingsInput{LeaderboardPublic: &yes}); err != nil {
			t.Fatal(err)
		}
	}

	if err := store.NewSQLAccountEraser(e.ms.DB(), e.ms.DriverName()).EraseUser(e.ctx, alice.ID); err != nil {
		t.Fatalf("EraseUser: %v", err)
	}

	count := func(table, user string) int {
		var n int
		q := `SELECT COUNT(*) FROM ` + table + ` WHERE user_id = `
		if e.ms.DriverName() == "postgres" {
			q += `$1`
		} else {
			q += `?`
		}
		if err := e.ms.DB().QueryRow(q, user).Scan(&n); err != nil {
			t.Fatalf("hitung %s: %v", table, err)
		}
		return n
	}
	for _, table := range []string{"game_attempts", "game_streaks", "game_settings"} {
		if n := count(table, alice.ID); n != 0 {
			t.Errorf("%s: data Alice masih %d baris", table, n)
		}
		if n := count(table, bob.ID); n != 1 {
			t.Errorf("%s: data Bob harus tetap 1 baris, dapat %d", table, n)
		}
	}
}

func TestService_PuzzleNumberStartsAtOneOnEpochDay(t *testing.T) {
	e := newEnv(t, true)
	e.now = time.Date(2026, 10, 25, 8, 0, 0, 0, time.UTC) // hari pertama fitur dinyalakan (Minggu 9x9)
	res, err := e.svc.Today(e.ctx, "default", "u1")
	if err != nil || res.Number != 1 {
		t.Fatalf("nomor %d (err %v), mau 1: nomor 0 hilang dari JSON dan tampil sebagai #undefined di klien", res.Number, err)
	}
	if res.Puzzle.Size != 9 {
		t.Errorf("Minggu harus 9x9, dapat %d", res.Puzzle.Size)
	}
}
