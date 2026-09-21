package store

import (
	"database/sql"
	"fmt"
	"time"
)

// Session merepresentasikan rekaman sesi login pengguna yang terikat pada JTI token JWT.
type Session struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	DeviceID     string    `json:"device_id"`
	UserAgent    string    `json:"user_agent"`
	IPAddress    string    `json:"ip_address"`
	IsRevoked    bool      `json:"is_revoked"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	LastActiveAt time.Time `json:"last_active_at"`
	IsCurrent    bool      `json:"is_current,omitempty"`
}

// SessionStore mendefinisikan kontrak operasi penyimpanan dan pengelolaan sesi login terpusat.
type SessionStore interface {
	CreateSession(session *Session) error
	GetActiveSessions(userID, currentSessionID string) ([]Session, error)
	RevokeSession(sessionID, userID string) error
	RevokeAllOtherSessions(userID, exceptSessionID string) error
	IsSessionRevoked(sessionID string) (bool, error)
	TouchSession(sessionID string) error
	CleanupExpiredSessions() (int64, error)
}

// SQLSessionStore mengimplementasikan SessionStore menggunakan database SQL (Postgres & SQLite).
type SQLSessionStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLSessionStore membuat instance baru SQLSessionStore.
func NewSQLSessionStore(db *sql.DB, driverName string) *SQLSessionStore {
	return &SQLSessionStore{
		db:         db,
		driverName: driverName,
	}
}

// CreateSession mencatat sesi baru ke database.
func (s *SQLSessionStore) CreateSession(session *Session) error {
	if session == nil || session.ID == "" || session.UserID == "" {
		return fmt.Errorf("sesi tidak valid: id dan user_id wajib diisi")
	}

	now := time.Now().UTC()
	if session.CreatedAt.IsZero() {
		session.CreatedAt = now
	}
	if session.LastActiveAt.IsZero() {
		session.LastActiveAt = now
	}
	if session.ExpiresAt.IsZero() {
		session.ExpiresAt = now.Add(7 * 24 * time.Hour)
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO sessions (id, user_id, device_id, user_agent, ip_address, is_revoked, created_at, expires_at, last_active_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		         ON CONFLICT (id) DO UPDATE SET last_active_at = EXCLUDED.last_active_at`
	} else {
		query = `INSERT INTO sessions (id, user_id, device_id, user_agent, ip_address, is_revoked, created_at, expires_at, last_active_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		         ON CONFLICT(id) DO UPDATE SET last_active_at = excluded.last_active_at`
	}

	_, err := s.db.Exec(query,
		session.ID,
		session.UserID,
		session.DeviceID,
		session.UserAgent,
		session.IPAddress,
		session.IsRevoked,
		session.CreatedAt.UTC(),
		session.ExpiresAt.UTC(),
		session.LastActiveAt.UTC(),
	)
	if err != nil {
		return fmt.Errorf("gagal membuat sesi (id: %s): %w", session.ID, err)
	}
	return nil
}

// GetActiveSessions mengembalikan seluruh sesi aktif milik user yang belum dicabut dan belum kedaluwarsa.
func (s *SQLSessionStore) GetActiveSessions(userID, currentSessionID string) ([]Session, error) {
	if userID == "" {
		return []Session{}, nil
	}

	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, user_id, COALESCE(device_id, ''), COALESCE(user_agent, ''), COALESCE(ip_address, ''),
		                is_revoked, created_at, expires_at, last_active_at
		         FROM sessions
		         WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > $2
		         ORDER BY last_active_at DESC`
	} else {
		query = `SELECT id, user_id, COALESCE(device_id, ''), COALESCE(user_agent, ''), COALESCE(ip_address, ''),
		                is_revoked, created_at, expires_at, last_active_at
		         FROM sessions
		         WHERE user_id = ? AND is_revoked = 0 AND expires_at > ?
		         ORDER BY last_active_at DESC`
	}

	rows, err := s.db.Query(query, userID, now)
	if err != nil {
		return nil, fmt.Errorf("gagal query sesi aktif: %w", err)
	}
	defer rows.Close()

	sessions := make([]Session, 0)
	for rows.Next() {
		var sess Session
		err := rows.Scan(
			&sess.ID,
			&sess.UserID,
			&sess.DeviceID,
			&sess.UserAgent,
			&sess.IPAddress,
			&sess.IsRevoked,
			&sess.CreatedAt,
			&sess.ExpiresAt,
			&sess.LastActiveAt,
		)
		if err != nil {
			return nil, fmt.Errorf("gagal scan sesi: %w", err)
		}
		if currentSessionID != "" && sess.ID == currentSessionID {
			sess.IsCurrent = true
		}
		sessions = append(sessions, sess)
	}

	return sessions, rows.Err()
}

// RevokeSession mencabut satu sesi tertentu milik user.
func (s *SQLSessionStore) RevokeSession(sessionID, userID string) error {
	if sessionID == "" || userID == "" {
		return nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `UPDATE sessions SET is_revoked = TRUE WHERE id = $1 AND user_id = $2`
	} else {
		query = `UPDATE sessions SET is_revoked = 1 WHERE id = ? AND user_id = ?`
	}

	_, err := s.db.Exec(query, sessionID, userID)
	if err != nil {
		return fmt.Errorf("gagal mencabut sesi (id: %s): %w", sessionID, err)
	}
	return nil
}

// RevokeAllOtherSessions mencabut semua sesi aktif milik user kecuali sesi saat ini.
func (s *SQLSessionStore) RevokeAllOtherSessions(userID, exceptSessionID string) error {
	if userID == "" {
		return nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `UPDATE sessions SET is_revoked = TRUE WHERE user_id = $1 AND id != $2 AND is_revoked = FALSE`
	} else {
		query = `UPDATE sessions SET is_revoked = 1 WHERE user_id = ? AND id != ? AND is_revoked = 0`
	}

	_, err := s.db.Exec(query, userID, exceptSessionID)
	if err != nil {
		return fmt.Errorf("gagal mencabut sesi lain untuk user %s: %w", userID, err)
	}
	return nil
}

// IsSessionRevoked memeriksa apakah suatu sesi ditandai revoked di database.
func (s *SQLSessionStore) IsSessionRevoked(sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `SELECT is_revoked FROM sessions WHERE id = $1 LIMIT 1`
	} else {
		query = `SELECT is_revoked FROM sessions WHERE id = ? LIMIT 1`
	}

	var isRevoked bool
	err := s.db.QueryRow(query, sessionID).Scan(&isRevoked)
	if err != nil {
		if err == sql.ErrNoRows {
			// Sesi belum tercatat (misal token legacy sebelum migrasi Phase 1), fail-open
			return false, nil
		}
		return false, fmt.Errorf("gagal query status sesi: %w", err)
	}
	return isRevoked, nil
}

// TouchSession memperbarui timestamp last_active_at sesi.
func (s *SQLSessionStore) TouchSession(sessionID string) error {
	if sessionID == "" {
		return nil
	}

	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE sessions SET last_active_at = $1 WHERE id = $2`
	} else {
		query = `UPDATE sessions SET last_active_at = ? WHERE id = ?`
	}

	_, err := s.db.Exec(query, now, sessionID)
	return err
}

// CleanupExpiredSessions membersihkan sesi yang telah kedaluwarsa secara alami.
func (s *SQLSessionStore) CleanupExpiredSessions() (int64, error) {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `DELETE FROM sessions WHERE expires_at < $1`
	} else {
		query = `DELETE FROM sessions WHERE expires_at < ?`
	}

	res, err := s.db.Exec(query, now)
	if err != nil {
		return 0, fmt.Errorf("gagal membersihkan sesi kedaluwarsa: %w", err)
	}
	return res.RowsAffected()
}
