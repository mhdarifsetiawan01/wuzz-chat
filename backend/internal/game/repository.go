package game

import (
	"context"
	"time"
)

// Repository mendefinisikan kontrak persistensi domain game. Semua method
// mengutamakan isolasi multi-tenant (tenantID).
type Repository interface {
	// GetPuzzle mengambil puzzle satu tanggal; ErrPuzzleNotFound bila belum dibuat.
	GetPuzzle(ctx context.Context, date string) (*Puzzle, error)
	// SavePuzzle menyimpan puzzle; bila tanggalnya sudah ada, tidak mengubah apa pun (pemenang balapan tetap).
	SavePuzzle(ctx context.Context, p *Puzzle) error

	// GetAttempt mengambil percobaan; ErrAttemptNotFound bila belum dimulai.
	GetAttempt(ctx context.Context, tenantID, userID, date string) (*Attempt, error)
	// CreateAttempt membuat percobaan bila belum ada (idempoten). created=false bila sudah ada.
	CreateAttempt(ctx context.Context, a *Attempt) (created bool, err error)
	// CompleteAttempt menandai selesai hanya bila masih berstatus playing. won=false bila sudah selesai lebih dulu.
	CompleteAttempt(ctx context.Context, tenantID, userID, date string, solvedAt time.Time, durationMs int64, status string) (won bool, err error)
	// AddMistake menaikkan hitungan jawaban lengkap yang salah.
	AddMistake(ctx context.Context, tenantID, userID, date string) error

	// GetStreak mengambil streak; nilai nol bila belum ada.
	GetStreak(ctx context.Context, tenantID, userID string) (*Streak, error)
	SaveStreak(ctx context.Context, s *Streak) error

	// GetSettings mengambil pengaturan; nil, nil bila belum pernah disimpan.
	GetSettings(ctx context.Context, tenantID, userID string) (*Settings, error)
	SaveSettings(ctx context.Context, s *Settings) error
}
