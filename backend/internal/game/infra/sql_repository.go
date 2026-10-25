package infra

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/game"
)

// SQLRepository mengimplementasikan game.Repository dengan database SQL (PostgreSQL & SQLite).
type SQLRepository struct {
	db         *sql.DB
	driverName string
}

// NewSQLRepository membuat instance baru SQLRepository.
func NewSQLRepository(db *sql.DB, driverName string) *SQLRepository {
	return &SQLRepository{db: db, driverName: driverName}
}

var _ game.Repository = (*SQLRepository)(nil)

// q mengubah placeholder ? menjadi $n untuk PostgreSQL.
func (r *SQLRepository) q(query string) string {
	if r.driverName != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, c := range query {
		if c == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(c)
	}
	return b.String()
}

// ─── Puzzle ──────────────────────────────────────────────────────────────────

func (r *SQLRepository) GetPuzzle(ctx context.Context, date string) (*game.Puzzle, error) {
	var (
		p                 game.Puzzle
		regionsJS, solnJS string
	)
	err := r.db.QueryRowContext(ctx, r.q(
		`SELECT puzzle_date, size, regions, solution, seed FROM game_puzzles WHERE puzzle_date = ?`), date,
	).Scan(&p.Date, &p.Size, &regionsJS, &solnJS, &p.Seed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, game.ErrPuzzleNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(regionsJS), &p.Regions); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(solnJS), &p.Solution); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *SQLRepository) SavePuzzle(ctx context.Context, p *game.Puzzle) error {
	regions, err := json.Marshal(p.Regions)
	if err != nil {
		return err
	}
	soln, err := json.Marshal(p.Solution)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, r.q(`INSERT INTO game_puzzles
		(puzzle_date, size, regions, solution, seed, created_at) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (puzzle_date) DO NOTHING`),
		p.Date, p.Size, string(regions), string(soln), p.Seed, time.Now().UTC())
	return err
}

// ─── Percobaan ───────────────────────────────────────────────────────────────

func (r *SQLRepository) GetAttempt(ctx context.Context, tenantID, userID, date string) (*game.Attempt, error) {
	var (
		a        game.Attempt
		solvedAt sql.NullTime
	)
	err := r.db.QueryRowContext(ctx, r.q(`SELECT puzzle_date, started_at, solved_at, duration_ms, mistakes, status
		FROM game_attempts WHERE tenant_id = ? AND user_id = ? AND puzzle_date = ?`), tenantID, userID, date,
	).Scan(&a.PuzzleDate, &a.StartedAt, &solvedAt, &a.DurationMs, &a.Mistakes, &a.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, game.ErrAttemptNotFound
	}
	if err != nil {
		return nil, err
	}
	a.TenantID, a.UserID = tenantID, userID
	a.StartedAt = a.StartedAt.UTC()
	if solvedAt.Valid {
		t := solvedAt.Time.UTC()
		a.SolvedAt = &t
	}
	return &a, nil
}

func (r *SQLRepository) CreateAttempt(ctx context.Context, a *game.Attempt) (bool, error) {
	res, err := r.db.ExecContext(ctx, r.q(`INSERT INTO game_attempts
		(tenant_id, user_id, puzzle_date, started_at, duration_ms, mistakes, status) VALUES (?, ?, ?, ?, 0, 0, ?)
		ON CONFLICT (tenant_id, user_id, puzzle_date) DO NOTHING`),
		a.TenantID, a.UserID, a.PuzzleDate, a.StartedAt.UTC(), game.StatusPlaying)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

func (r *SQLRepository) CompleteAttempt(ctx context.Context, tenantID, userID, date string, solvedAt time.Time, durationMs int64, status string) (bool, error) {
	res, err := r.db.ExecContext(ctx, r.q(`UPDATE game_attempts SET solved_at = ?, duration_ms = ?, status = ?
		WHERE tenant_id = ? AND user_id = ? AND puzzle_date = ? AND status = ?`),
		solvedAt.UTC(), durationMs, status, tenantID, userID, date, game.StatusPlaying)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

func (r *SQLRepository) AddMistake(ctx context.Context, tenantID, userID, date string) error {
	_, err := r.db.ExecContext(ctx, r.q(`UPDATE game_attempts SET mistakes = mistakes + 1
		WHERE tenant_id = ? AND user_id = ? AND puzzle_date = ? AND status = ?`),
		tenantID, userID, date, game.StatusPlaying)
	return err
}

// ─── Streak ──────────────────────────────────────────────────────────────────

func (r *SQLRepository) GetStreak(ctx context.Context, tenantID, userID string) (*game.Streak, error) {
	s := game.Streak{TenantID: tenantID, UserID: userID}
	err := r.db.QueryRowContext(ctx, r.q(`SELECT current_streak, best_streak, last_solved_date, freezes_available, freeze_week
		FROM game_streaks WHERE tenant_id = ? AND user_id = ?`), tenantID, userID,
	).Scan(&s.Current, &s.Best, &s.LastSolvedDate, &s.FreezesAvailable, &s.FreezeWeek)
	if errors.Is(err, sql.ErrNoRows) {
		return &s, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SQLRepository) SaveStreak(ctx context.Context, s *game.Streak) error {
	_, err := r.db.ExecContext(ctx, r.q(`INSERT INTO game_streaks
		(tenant_id, user_id, current_streak, best_streak, last_solved_date, freezes_available, freeze_week)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (tenant_id, user_id) DO UPDATE SET
			current_streak = excluded.current_streak,
			best_streak = excluded.best_streak,
			last_solved_date = excluded.last_solved_date,
			freezes_available = excluded.freezes_available,
			freeze_week = excluded.freeze_week`),
		s.TenantID, s.UserID, s.Current, s.Best, s.LastSolvedDate, s.FreezesAvailable, s.FreezeWeek)
	return err
}

// ─── Pengaturan ──────────────────────────────────────────────────────────────

func (r *SQLRepository) GetSettings(ctx context.Context, tenantID, userID string) (*game.Settings, error) {
	s := game.Settings{TenantID: tenantID, UserID: userID}
	var changed sql.NullTime
	err := r.db.QueryRowContext(ctx, r.q(`SELECT leaderboard_public, reminder_enabled, tz, tz_changed_at
		FROM game_settings WHERE tenant_id = ? AND user_id = ?`), tenantID, userID,
	).Scan(&s.LeaderboardPublic, &s.ReminderEnabled, &s.Timezone, &changed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if changed.Valid {
		s.TimezoneChangedAt = changed.Time.UTC()
	}
	return &s, nil
}

func (r *SQLRepository) SaveSettings(ctx context.Context, s *game.Settings) error {
	var changed any
	if !s.TimezoneChangedAt.IsZero() {
		changed = s.TimezoneChangedAt.UTC()
	}
	_, err := r.db.ExecContext(ctx, r.q(`INSERT INTO game_settings
		(tenant_id, user_id, leaderboard_public, reminder_enabled, tz, tz_changed_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (tenant_id, user_id) DO UPDATE SET
			leaderboard_public = excluded.leaderboard_public,
			reminder_enabled = excluded.reminder_enabled,
			tz = excluded.tz,
			tz_changed_at = excluded.tz_changed_at`),
		s.TenantID, s.UserID, s.LeaderboardPublic, s.ReminderEnabled, s.Timezone, changed)
	return err
}
