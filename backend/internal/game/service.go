package game

import (
	"context"
	"strings"
	"time"
	_ "time/tzdata" // zona waktu tertanam agar tidak bergantung pada paket tzdata di server/kontainer
)

// gridEpoch adalah tanggal Wuzz Grid #1 (dipakai untuk nomor puzzle yang dibagikan). Harus tidak lebih
// lambat dari hari pertama fitur dinyalakan: tanggal sebelum epoch bernomor 0 dan nomornya hilang dari JSON.
const gridEpoch = "2026-10-25"

// timezoneChangeCooldown membatasi pergantian zona waktu agar tidak dipakai memperpanjang streak.
const timezoneChangeCooldown = 24 * time.Hour

// MinPlausibleSolve adalah waktu tercepat yang masih masuk akal bagi manusia
// untuk menyelesaikan grid ukuran size (menaruh size bintang saja sudah butuh waktu).
// Penyelesaian yang lebih cepat ditandai suspicious.
func MinPlausibleSolve(size int) time.Duration {
	return time.Duration(size) * 500 * time.Millisecond
}

// Service mengorkestrasi logika bisnis game harian.
type Service struct {
	repo    Repository
	enabled bool
	now     func() time.Time
}

// NewService membuat Service. enabled berasal dari sakelar GAME_ENABLED (default mati).
func NewService(repo Repository, enabled bool) *Service {
	return &Service{repo: repo, enabled: enabled, now: time.Now}
}

// SetClock mengganti jam (untuk pengujian).
func (s *Service) SetClock(now func() time.Time) { s.now = now }

// Enabled melaporkan apakah fitur game menyala.
func (s *Service) Enabled() bool { return s.enabled }

// Today mengembalikan puzzle hari ini (tanggal lokal pengguna) beserta percobaan dan streak.
// Bila fitur mati, mengembalikan Enabled=false tanpa menyentuh database.
func (s *Service) Today(ctx context.Context, tenantID, userID string) (*TodayResponse, error) {
	if !s.enabled {
		return &TodayResponse{Enabled: false}, nil
	}
	tenantID = normalizeTenant(tenantID)
	settings, err := s.loadSettings(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	today, err := localToday(settings.Timezone, s.now())
	if err != nil {
		return nil, err
	}
	puzzle, err := s.ensurePuzzle(ctx, today)
	if err != nil {
		return nil, err
	}
	attempt, err := s.repo.GetAttempt(ctx, tenantID, userID, puzzle.Date)
	if err != nil && err != ErrAttemptNotFound {
		return nil, err
	}
	streak, err := s.effectiveStreak(ctx, tenantID, userID, today)
	if err != nil {
		return nil, err
	}
	return &TodayResponse{
		Enabled: true,
		Puzzle:  puzzle,
		Number:  puzzleNumber(puzzle.Date),
		Attempt: attempt,
		Streak:  streak,
	}, nil
}

// Start memulai percobaan hari ini. Idempoten: memanggil ulang tidak mengubah started_at.
func (s *Service) Start(ctx context.Context, tenantID, userID string) (*TodayResponse, error) {
	if !s.enabled {
		return nil, ErrDisabled
	}
	tenantID = normalizeTenant(tenantID)
	settings, err := s.loadSettings(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	today, err := localToday(settings.Timezone, s.now())
	if err != nil {
		return nil, err
	}
	puzzle, err := s.ensurePuzzle(ctx, today)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.CreateAttempt(ctx, &Attempt{
		TenantID:   tenantID,
		UserID:     userID,
		PuzzleDate: puzzle.Date,
		StartedAt:  s.now().UTC(),
		Status:     StatusPlaying,
	}); err != nil {
		return nil, err
	}
	return s.Today(ctx, tenantID, userID)
}

// Submit memeriksa jawaban untuk puzzle hari ini. Waktu penyelesaian dihitung
// server dari started_at. Memanggil ulang setelah selesai tidak mengubah hasil.
func (s *Service) Submit(ctx context.Context, tenantID, userID string, placement Placement) (*SubmitResult, error) {
	if !s.enabled {
		return nil, ErrDisabled
	}
	tenantID = normalizeTenant(tenantID)
	settings, err := s.loadSettings(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	today, err := localToday(settings.Timezone, s.now())
	if err != nil {
		return nil, err
	}
	puzzle, err := s.ensurePuzzle(ctx, today)
	if err != nil {
		return nil, err
	}
	attempt, err := s.repo.GetAttempt(ctx, tenantID, userID, puzzle.Date)
	if err != nil {
		return nil, err // ErrAttemptNotFound bila belum Start
	}
	if attempt.Status != StatusPlaying {
		return s.result(ctx, tenantID, userID, today, attempt, true)
	}

	solved, err := CheckPlacement(puzzle.Size, puzzle.Regions, placement)
	if err != nil {
		return nil, err
	}
	if !solved {
		if placementComplete(placement) {
			if err := s.repo.AddMistake(ctx, tenantID, userID, puzzle.Date); err != nil {
				return nil, err
			}
		}
		fresh, err := s.repo.GetAttempt(ctx, tenantID, userID, puzzle.Date)
		if err != nil {
			return nil, err
		}
		return s.result(ctx, tenantID, userID, today, fresh, false)
	}

	now := s.now().UTC()
	elapsed := now.Sub(attempt.StartedAt)
	if elapsed < 0 {
		elapsed = 0
	}
	status := StatusSolved
	if elapsed < MinPlausibleSolve(puzzle.Size) {
		status = StatusSuspicious
	}
	won, err := s.repo.CompleteAttempt(ctx, tenantID, userID, puzzle.Date, now, elapsed.Milliseconds(), status)
	if err != nil {
		return nil, err
	}
	// Hanya pemanggil yang menang yang menaikkan streak; permintaan ganda tidak menghitung dua kali.
	if won && status == StatusSolved {
		cur, err := s.repo.GetStreak(ctx, tenantID, userID)
		if err != nil {
			return nil, err
		}
		cur.TenantID, cur.UserID = tenantID, userID
		next := ApplySolve(*cur, today)
		if err := s.repo.SaveStreak(ctx, &next); err != nil {
			return nil, err
		}
	}
	fresh, err := s.repo.GetAttempt(ctx, tenantID, userID, puzzle.Date)
	if err != nil {
		return nil, err
	}
	return s.result(ctx, tenantID, userID, today, fresh, true)
}

func (s *Service) result(ctx context.Context, tenantID, userID string, today time.Time, a *Attempt, solved bool) (*SubmitResult, error) {
	streak, err := s.effectiveStreak(ctx, tenantID, userID, today)
	if err != nil {
		return nil, err
	}
	return &SubmitResult{Solved: solved && a.Status != StatusPlaying, Attempt: a, Streak: streak}, nil
}

// GetSettings mengembalikan pengaturan (bawaan bila belum pernah disimpan).
func (s *Service) GetSettings(ctx context.Context, tenantID, userID string) (*Settings, error) {
	if !s.enabled {
		return nil, ErrDisabled
	}
	return s.loadSettings(ctx, normalizeTenant(tenantID), userID)
}

// SettingsInput berisi perubahan pengaturan; field nil tidak diubah.
type SettingsInput struct {
	LeaderboardPublic *bool   `json:"leaderboard_public"`
	ReminderEnabled   *bool   `json:"reminder_enabled"`
	Timezone          *string `json:"timezone"`
}

// UpdateSettings menyimpan perubahan pengaturan. Zona waktu divalidasi sebagai
// nama IANA dan, setelah pernah diganti, hanya dapat diubah sekali per 24 jam.
func (s *Service) UpdateSettings(ctx context.Context, tenantID, userID string, in SettingsInput) (*Settings, error) {
	if !s.enabled {
		return nil, ErrDisabled
	}
	tenantID = normalizeTenant(tenantID)
	cur, err := s.loadSettings(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	if in.LeaderboardPublic != nil {
		cur.LeaderboardPublic = *in.LeaderboardPublic
	}
	if in.ReminderEnabled != nil {
		cur.ReminderEnabled = *in.ReminderEnabled
	}
	if in.Timezone != nil {
		tz := strings.TrimSpace(*in.Timezone)
		if _, err := loadLocation(tz); err != nil {
			return nil, ErrInvalidTimezone
		}
		if tz != cur.Timezone {
			now := s.now().UTC()
			if !cur.TimezoneChangedAt.IsZero() && now.Sub(cur.TimezoneChangedAt) < timezoneChangeCooldown {
				return nil, ErrTimezoneLocked
			}
			// Penyimpanan pertama (belum ada zona tersimpan) tidak memulai masa tunggu.
			stored, err := s.repo.GetSettings(ctx, tenantID, userID)
			if err != nil {
				return nil, err
			}
			if stored != nil {
				cur.TimezoneChangedAt = now
			}
			cur.Timezone = tz
		}
	}
	cur.TenantID, cur.UserID = tenantID, userID
	if err := s.repo.SaveSettings(ctx, cur); err != nil {
		return nil, err
	}
	return cur, nil
}

// ─── helper internal ─────────────────────────────────────────────────────────

func (s *Service) loadSettings(ctx context.Context, tenantID, userID string) (*Settings, error) {
	st, err := s.repo.GetSettings(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	if st == nil {
		return &Settings{TenantID: tenantID, UserID: userID, Timezone: DefaultTimezone}, nil
	}
	if st.Timezone == "" {
		st.Timezone = DefaultTimezone
	}
	return st, nil
}

func (s *Service) effectiveStreak(ctx context.Context, tenantID, userID string, today time.Time) (*Streak, error) {
	st, err := s.repo.GetStreak(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	eff := EffectiveStreak(*st, today)
	return &eff, nil
}

// ensurePuzzle mengambil puzzle tanggal today, membuatnya bila belum ada.
func (s *Service) ensurePuzzle(ctx context.Context, today time.Time) (*Puzzle, error) {
	date := today.Format(dateLayout)
	p, err := s.repo.GetPuzzle(ctx, date)
	if err == nil {
		return p, nil
	}
	if err != ErrPuzzleNotFound {
		return nil, err
	}
	gen, err := GenerateForDate(today)
	if err != nil {
		return nil, err
	}
	gen.Date = date
	if err := s.repo.SavePuzzle(ctx, gen); err != nil {
		return nil, err
	}
	// Baca ulang: bila dua permintaan membuat bersamaan, keduanya memakai versi yang tersimpan.
	return s.repo.GetPuzzle(ctx, date)
}

func normalizeTenant(tenantID string) string {
	if tenantID == "" {
		return "default"
	}
	return tenantID
}

func loadLocation(name string) (*time.Location, error) {
	if name == "" || strings.EqualFold(name, "local") {
		return nil, ErrInvalidTimezone
	}
	return time.LoadLocation(name)
}

// localToday mengembalikan tanggal kalender lokal (pukul 00.00, berlabel UTC)
// untuk waktu now di zona tz.
func localToday(tz string, now time.Time) (time.Time, error) {
	loc, err := loadLocation(tz)
	if err != nil {
		return time.Time{}, ErrInvalidTimezone
	}
	y, m, d := now.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC), nil
}

func puzzleNumber(date string) int {
	n, ok := daysBetween(gridEpoch, date)
	if !ok {
		return 0
	}
	return n + 1
}

func placementComplete(p Placement) bool {
	for _, c := range p {
		if c == NoStar {
			return false
		}
	}
	return len(p) > 0
}

// Leaderboard mengembalikan papan skor teman atau grup untuk hari ini atau minggu ini (Senin-hari ini, lokal pengguna).
// Hanya penyelesaian sah (solved) yang dihitung; pengguna yang berhubungan blokir dengan pemanggil tidak tampil.
func (s *Service) Leaderboard(ctx context.Context, tenantID, userID, scope, groupID, period string) (*LeaderboardResponse, error) {
	if !s.enabled {
		return nil, ErrDisabled
	}
	if (scope != ScopeFriends && scope != ScopeGroup && scope != ScopePublic) || (period != PeriodDay && period != PeriodWeek) {
		return nil, ErrInvalidBoard
	}
	tenantID = normalizeTenant(tenantID)
	if scope == ScopeGroup {
		// Hanya grup induk (grp_); forum (sub_) dan percakapan langsung bukan papan skor.
		if !strings.HasPrefix(groupID, "grp_") {
			return nil, ErrInvalidBoard
		}
		member, err := s.repo.IsGroupMember(ctx, tenantID, groupID, userID)
		if err != nil {
			return nil, err
		}
		if !member {
			return nil, ErrNotGroupMember
		}
	}

	settings, err := s.loadSettings(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	today, err := localToday(settings.Timezone, s.now())
	if err != nil {
		return nil, err
	}
	to := today.Format(dateLayout)
	from := to
	if period == PeriodWeek {
		from = weekStart(today)
	}

	rows, err := s.repo.ListBoard(ctx, BoardQuery{
		TenantID: tenantID, UserID: userID, Scope: scope, GroupID: groupID,
		From: from, To: to, Period: period, Limit: BoardLimit,
	})
	if err != nil {
		return nil, err
	}

	resp := &LeaderboardResponse{Scope: scope, Period: period, From: from, To: to, Entries: make([]BoardEntry, 0, len(rows))}
	for i, e := range rows {
		// Peringkat sama untuk hasil yang persis sama (hari: waktu sama; minggu: hari dan total waktu sama).
		rank := i + 1
		if i > 0 {
			prev := resp.Entries[i-1]
			if prev.DurationMs == e.DurationMs && prev.SolvedDays == e.SolvedDays {
				rank = prev.Rank
			}
		}
		if scope == ScopePublic {
			// Privasi ditegakkan di server: papan publik tidak pernah membawa nama tampilan atau foto.
			e.DisplayName, e.AvatarURL = "", ""
		}
		e.Rank = rank
		e.IsMe = e.UserID == userID
		if e.IsMe {
			r := rank
			resp.MyRank = &r
		}
		resp.Entries = append(resp.Entries, e)
	}
	return resp, nil
}

// SetBoardHidden dipakai alat moderasi: mengeluarkan atau mengembalikan pengguna pada papan publik tanpa
// menyentuh akunnya. Catatan wajib dan tercatat di audit. Berlaku walau fitur game sedang dimatikan, agar
// keputusan moderasi tidak hilang saat fitur dinyalakan kembali.
func (s *Service) SetBoardHidden(ctx context.Context, tenantID, actorID, userID string, hidden bool, note string) error {
	note = strings.TrimSpace(note)
	if hidden && note == "" {
		return ErrNoteRequired
	}
	return s.repo.SetBoardHidden(ctx, normalizeTenant(tenantID), userID, actorID, hidden, note)
}

// IsBoardHidden melaporkan apakah pengguna sedang dikeluarkan staf dari papan publik.
func (s *Service) IsBoardHidden(ctx context.Context, tenantID, userID string) (bool, error) {
	return s.repo.IsBoardHidden(ctx, normalizeTenant(tenantID), userID)
}
