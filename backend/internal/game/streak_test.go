package game

import (
	"testing"
	"time"
)

func day(s string) time.Time {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestWeekStart(t *testing.T) {
	cases := map[string]string{
		"2026-10-26": "2026-10-26", // Senin
		"2026-10-28": "2026-10-26", // Rabu
		"2026-11-01": "2026-10-26", // Minggu
		"2026-11-02": "2026-11-02", // Senin berikutnya
	}
	for in, want := range cases {
		if got := weekStart(day(in)); got != want {
			t.Errorf("%s: %s, mau %s", in, got, want)
		}
	}
}

func TestApplySolve_FirstSolve(t *testing.T) {
	s := ApplySolve(Streak{}, day("2026-10-26"))
	if s.Current != 1 || s.Best != 1 || s.LastSolvedDate != "2026-10-26" || s.FreezesAvailable != 1 {
		t.Fatalf("hasil: %+v", s)
	}
}

func TestApplySolve_ConsecutiveAndSameDay(t *testing.T) {
	s := ApplySolve(Streak{}, day("2026-10-26"))
	s = ApplySolve(s, day("2026-10-27"))
	s = ApplySolve(s, day("2026-10-28"))
	if s.Current != 3 || s.Best != 3 {
		t.Fatalf("3 hari berturut: %+v", s)
	}
	again := ApplySolve(s, day("2026-10-28"))
	if again != s {
		t.Fatalf("hari sama harus tidak berubah: %+v vs %+v", again, s)
	}
}

func TestApplySolve_FreezeCoversOneMissedDay(t *testing.T) {
	s := ApplySolve(Streak{}, day("2026-10-26")) // Senin
	s = ApplySolve(s, day("2026-10-27"))         // Selasa -> 2
	s = ApplySolve(s, day("2026-10-29"))         // Kamis (Rabu terlewat)
	if s.Current != 3 || s.FreezesAvailable != 0 {
		t.Fatalf("pembeku harus menutup satu hari: %+v", s)
	}
}

func TestApplySolve_FreezeUsedOncePerWeek(t *testing.T) {
	s := Streak{Current: 5, Best: 5, LastSolvedDate: "2026-10-26"}
	s = ApplySolve(s, day("2026-10-28")) // Selasa terlewat, pembeku minggu ini terpakai
	if s.Current != 6 || s.FreezesAvailable != 0 {
		t.Fatalf("setelah pembeku pertama: %+v", s)
	}
	s = ApplySolve(s, day("2026-10-30")) // Kamis terlewat lagi, pembeku habis
	if s.Current != 1 {
		t.Fatalf("pembeku kedua di minggu sama tidak ada, streak harus mulai lagi: %+v", s)
	}
	if s.Best != 6 {
		t.Fatalf("best harus tetap 6: %+v", s)
	}
}

func TestApplySolve_FreezeRefillsNextWeek(t *testing.T) {
	s := Streak{Current: 4, Best: 4, LastSolvedDate: "2026-10-31", FreezesAvailable: 0, FreezeWeek: "2026-10-26"}
	// Senin 2 Nov: minggu baru, pembeku terisi lagi, lalu Selasa 3 Nov setelah terlewat Minggu 1 Nov.
	s = ApplySolve(s, day("2026-11-02")) // gap 2 (Minggu terlewat), pembeku baru terisi lalu terpakai
	if s.Current != 5 || s.FreezesAvailable != 0 || s.FreezeWeek != "2026-11-02" {
		t.Fatalf("hasil: %+v", s)
	}
}

func TestApplySolve_LongGapResets(t *testing.T) {
	s := Streak{Current: 9, Best: 9, LastSolvedDate: "2026-10-20", FreezesAvailable: 1, FreezeWeek: "2026-10-19"}
	s = ApplySolve(s, day("2026-10-26"))
	if s.Current != 1 || s.Best != 9 {
		t.Fatalf("hasil: %+v", s)
	}
}

func TestEffectiveStreak(t *testing.T) {
	base := Streak{Current: 7, Best: 9, LastSolvedDate: "2026-10-26", FreezesAvailable: 1, FreezeWeek: "2026-10-26"}
	cases := []struct {
		name  string
		today string
		s     Streak
		want  int
	}{
		{"hari yang sama", "2026-10-26", base, 7},
		{"kemarin", "2026-10-27", base, 7},
		{"terlewat satu hari, ada pembeku", "2026-10-28", base, 7},
		{"terlewat satu hari, pembeku habis", "2026-10-28", func() Streak { s := base; s.FreezesAvailable = 0; return s }(), 0},
		{"terlewat dua hari", "2026-10-29", base, 0},
		{"belum pernah", "2026-10-26", Streak{}, 0},
		{"pembeku terisi minggu baru", "2026-11-03", Streak{Current: 3, LastSolvedDate: "2026-11-01", FreezeWeek: "2026-10-26"}, 3},
	}
	for _, c := range cases {
		if got := EffectiveStreak(c.s, day(c.today)).Current; got != c.want {
			t.Errorf("%s: %d, mau %d", c.name, got, c.want)
		}
	}
}
