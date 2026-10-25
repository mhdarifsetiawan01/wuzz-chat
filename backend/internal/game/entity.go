// Package game berisi domain game harian Wuzz Grid (puzzle grid logika).
// Berkas pada tahap 1 murni logika: tanpa DB, tanpa jaringan, deterministik.
package game

import (
	"errors"
	"time"
)

// ─── Domain Sentinel Errors ──────────────────────────────────────────────────

var (
	ErrInvalidSize      = errors.New("ukuran grid harus antara 6 dan 9")
	ErrInvalidRegions   = errors.New("peta wilayah tidak valid")
	ErrInvalidPlacement = errors.New("penempatan bintang tidak valid")
	ErrGenerationFailed = errors.New("gagal membuat puzzle dengan solusi unik")

	ErrDisabled        = errors.New("fitur game belum aktif")
	ErrPuzzleNotFound  = errors.New("puzzle tidak ditemukan")
	ErrAttemptNotFound = errors.New("percobaan belum dimulai")
	ErrInvalidTimezone = errors.New("zona waktu tidak valid")
	ErrTimezoneLocked  = errors.New("zona waktu hanya dapat diubah sekali dalam 24 jam")
	ErrInvalidBoard    = errors.New("papan skor tidak valid: scope atau periode tidak dikenal")
	ErrNotGroupMember  = errors.New("Anda bukan anggota grup ini")
	ErrNoteRequired    = errors.New("catatan wajib diisi")
)

// ─── Konstanta ───────────────────────────────────────────────────────────────

const (
	MinGridSize = 6
	MaxGridSize = 9

	// NoStar menandai baris yang belum berisi bintang pada Placement.
	NoStar = -1
)

// ─── Domain Models ───────────────────────────────────────────────────────────

// Puzzle adalah satu teka-teki harian. Regions[r][c] berisi nomor wilayah
// (0..Size-1) untuk sel pada baris r, kolom c. Solution[r] adalah kolom bintang
// pada baris r dan TIDAK boleh dikirim ke klien.
type Puzzle struct {
	Date     string  `json:"date"` // tanggal kalender lokal pengguna (YYYY-MM-DD) yang memiliki puzzle ini
	Size     int     `json:"size"`
	Regions  [][]int `json:"regions"`
	Solution []int   `json:"-"`
	Seed     int64   `json:"seed"`
}

// Placement adalah jawaban pemain: Placement[r] = kolom bintang pada baris r,
// atau NoStar bila baris itu kosong.
type Placement []int

// ─── Percobaan, Streak, Pengaturan ───────────────────────────────────────────

// Status percobaan.
const (
	StatusPlaying    = "playing"
	StatusSolved     = "solved"
	StatusSuspicious = "suspicious" // selesai terlalu cepat untuk manusia; tidak masuk papan skor maupun streak
)

// DefaultTimezone dipakai sampai pengguna menyimpan zona waktunya sendiri.
const DefaultTimezone = "Asia/Jakarta"

// Attempt adalah satu percobaan pengguna pada puzzle satu tanggal.
type Attempt struct {
	TenantID   string     `json:"-"`
	UserID     string     `json:"-"`
	PuzzleDate string     `json:"puzzle_date"`
	StartedAt  time.Time  `json:"started_at"`
	SolvedAt   *time.Time `json:"solved_at,omitempty"`
	DurationMs int64      `json:"duration_ms"`
	Mistakes   int        `json:"mistakes"`
	Status     string     `json:"status"`
}

// Streak adalah status hari berturut-turut seorang pengguna. Tanggal bertipe
// string YYYY-MM-DD menurut zona waktu lokal pengguna.
type Streak struct {
	TenantID         string `json:"-"`
	UserID           string `json:"-"`
	Current          int    `json:"current"`
	Best             int    `json:"best"`
	LastSolvedDate   string `json:"last_solved_date,omitempty"`
	FreezesAvailable int    `json:"freezes_available"`
	FreezeWeek       string `json:"-"` // Senin (lokal) minggu terakhir pembeku diisi ulang
}

// Settings adalah preferensi game seorang pengguna.
type Settings struct {
	TenantID          string    `json:"-"`
	UserID            string    `json:"-"`
	LeaderboardPublic bool      `json:"leaderboard_public"`
	ReminderEnabled   bool      `json:"reminder_enabled"`
	Timezone          string    `json:"timezone"`
	TimezoneChangedAt time.Time `json:"-"`
}

// TodayResponse adalah isi GET /api/game/today.
type TodayResponse struct {
	Enabled bool     `json:"enabled"`
	Puzzle  *Puzzle  `json:"puzzle,omitempty"`
	Number  int      `json:"number,omitempty"`
	Attempt *Attempt `json:"attempt,omitempty"`
	Streak  *Streak  `json:"streak,omitempty"`
}

// SubmitResult adalah isi POST /api/game/today/submit.
type SubmitResult struct {
	Solved  bool     `json:"solved"`
	Attempt *Attempt `json:"attempt"`
	Streak  *Streak  `json:"streak,omitempty"`
}

// ─── Papan skor ──────────────────────────────────────────────────────────────

// Scope dan periode papan skor. Papan publik (opt-in) menyusul di tahap berikutnya.
const (
	ScopeFriends = "friends"
	ScopeGroup   = "group"
	// ScopePublic hanya memuat pengguna yang menyalakan leaderboard_public dan belum dikeluarkan staf. Yang tampil
	// hanya @username dan hasil: nama tampilan dan foto TIDAK dikirim (diputuskan 26 Okt 2026).
	ScopePublic = "public"

	PeriodDay  = "day"
	PeriodWeek = "week"

	// BoardLimit membatasi jumlah baris yang dikirim per papan.
	BoardLimit = 50
)

// BoardQuery adalah parameter kueri papan skor ke repository. Tanggal berformat YYYY-MM-DD (lokal pengguna), inklusif.
type BoardQuery struct {
	TenantID string
	UserID   string // pemanggil: selalu ikut tampil, dan blokir dihitung dari sudut pandangnya
	Scope    string
	GroupID  string // wajib untuk ScopeGroup
	From     string
	To       string
	Period   string
	Limit    int
}

// BoardEntry adalah satu baris papan skor. Pada periode hari, DurationMs = waktu penyelesaian; pada periode
// minggu, SolvedDays = jumlah hari selesai dan DurationMs = total waktu hari-hari itu.
type BoardEntry struct {
	Rank        int    `json:"rank"`
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	SolvedDays  int    `json:"solved_days"`
	DurationMs  int64  `json:"duration_ms"`
	IsMe        bool   `json:"is_me"`
}

// LeaderboardResponse adalah isi GET /api/game/leaderboard.
type LeaderboardResponse struct {
	Scope   string       `json:"scope"`
	Period  string       `json:"period"`
	From    string       `json:"from"`
	To      string       `json:"to"`
	Entries []BoardEntry `json:"entries"`
	// MyRank adalah peringkat pemanggil; nil bila belum menyelesaikan puzzle pada periode ini.
	MyRank *int `json:"my_rank,omitempty"`
}
