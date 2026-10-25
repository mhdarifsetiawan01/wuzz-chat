package game

import "time"

const dateLayout = "2006-01-02"

// weekStart mengembalikan tanggal Senin (YYYY-MM-DD) minggu yang memuat date.
func weekStart(date time.Time) string {
	offset := (int(date.Weekday()) + 6) % 7 // Senin = 0
	return date.AddDate(0, 0, -offset).Format(dateLayout)
}

// daysBetween menghitung selisih hari kalender dari a ke b (b - a).
func daysBetween(a, b string) (int, bool) {
	ta, err := time.Parse(dateLayout, a)
	if err != nil {
		return 0, false
	}
	tb, err := time.Parse(dateLayout, b)
	if err != nil {
		return 0, false
	}
	return int(tb.Sub(ta).Hours() / 24), true
}

// refillFreeze mengisi pembeku (1 per minggu lokal) bila minggu sudah berganti.
func refillFreeze(s *Streak, today time.Time) {
	if week := weekStart(today); s.FreezeWeek != week {
		s.FreezeWeek = week
		s.FreezesAvailable = 1
	}
}

// ApplySolve memperbarui streak ketika pengguna menyelesaikan puzzle pada
// tanggal lokal today. Aturan:
//   - hari yang sama: tidak berubah;
//   - kemarin: streak bertambah;
//   - terlewat tepat satu hari dan ada pembeku: pembeku terpakai, streak bertambah;
//   - selain itu: mulai lagi dari 1.
//
// Pembeku diisi ulang 1 per minggu (Senin lokal).
func ApplySolve(s Streak, today time.Time) Streak {
	refillFreeze(&s, today)
	todayStr := today.Format(dateLayout)

	gap, ok := daysBetween(s.LastSolvedDate, todayStr)
	switch {
	case s.LastSolvedDate == "" || !ok:
		s.Current = 1
	case gap <= 0:
		// Sudah dihitung hari ini (atau tanggal mundur): tidak ada perubahan.
		return s
	case gap == 1:
		s.Current++
	case gap == 2 && s.FreezesAvailable > 0:
		s.FreezesAvailable--
		s.Current++
	default:
		s.Current = 1
	}
	if s.Current > s.Best {
		s.Best = s.Current
	}
	s.LastSolvedDate = todayStr
	return s
}

// EffectiveStreak mengembalikan tampilan streak pada tanggal lokal today tanpa
// mengubah data: streak yang sudah pasti putus ditampilkan 0. Streak masih
// "hidup" bila kemarin diselesaikan, atau terlewat satu hari yang masih
// dapat ditutup pembeku.
func EffectiveStreak(s Streak, today time.Time) Streak {
	refillFreeze(&s, today)
	gap, ok := daysBetween(s.LastSolvedDate, today.Format(dateLayout))
	if s.LastSolvedDate == "" || !ok {
		s.Current = 0
		return s
	}
	if gap <= 1 || (gap == 2 && s.FreezesAvailable > 0) {
		return s
	}
	s.Current = 0
	return s
}
