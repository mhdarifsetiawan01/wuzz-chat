package store

import (
	"database/sql"
	"fmt"
	"sync"
	"time"
)

// TokenStore mendefinisikan kontrak operasi penyimpanan token JWT yang dicabut.
type TokenStore interface {
	RevokeToken(jti, userID string, expiresAt time.Time) error
	IsTokenRevoked(jti string) (bool, error)
	RevokeAllUserTokens(userID string) error
	IsUserRevokedBefore(userID string, issuedAt time.Time) (bool, error)
	CleanupExpiredTokens() (int64, error)
}

// SQLTokenStore mengimplementasikan TokenStore dengan database SQL (Postgres & SQLite).
type SQLTokenStore struct {
	db                   *sql.DB
	driverName           string
	userRevocationsCache sync.Map // cache user_id -> time.Time
}

// NewSQLTokenStore membuat instance baru SQLTokenStore.
func NewSQLTokenStore(db *sql.DB, driverName string) *SQLTokenStore {
	return &SQLTokenStore{
		db:         db,
		driverName: driverName,
	}
}

// RevokeToken mencatat JTI ke tabel revoked_tokens (blacklist) hingga waktu kedaluwarsanya.
func (s *SQLTokenStore) RevokeToken(jti, userID string, expiresAt time.Time) error {
	if jti == "" {
		return nil
	}

	revokedAt := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO revoked_tokens (jti, user_id, revoked_at, expires_at)
		         VALUES ($1, $2, $3, $4)
		         ON CONFLICT (jti) DO NOTHING`
	} else {
		query = `INSERT OR IGNORE INTO revoked_tokens (jti, user_id, revoked_at, expires_at)
		         VALUES (?, ?, ?, ?)`
	}

	_, err := s.db.Exec(query, jti, userID, revokedAt, expiresAt.UTC())
	if err != nil {
		return fmt.Errorf("gagal mencabut token (jti: %s): %w", jti, err)
	}
	return nil
}

// IsTokenRevoked memeriksa apakah suatu JTI tercatat dalam daftar token yang dicabut atau status sesi telah dicabut.
func (s *SQLTokenStore) IsTokenRevoked(jti string) (bool, error) {
	if jti == "" {
		return false, nil
	}

	var query string
	if s.driverName == "postgres" {
		query = `SELECT 1 FROM revoked_tokens WHERE jti = $1 LIMIT 1`
	} else {
		query = `SELECT 1 FROM revoked_tokens WHERE jti = ? LIMIT 1`
	}

	var dummy int
	err := s.db.QueryRow(query, jti).Scan(&dummy)
	if err == nil {
		return true, nil
	}
	if err != sql.ErrNoRows {
		return false, fmt.Errorf("gagal query revoked_tokens: %w", err)
	}

	// Periksa juga status pencabutan sesi di tabel sessions (Phase 1: Session Foundation)
	var sessionQuery string
	if s.driverName == "postgres" {
		sessionQuery = `SELECT 1 FROM sessions WHERE id = $1 AND is_revoked = TRUE LIMIT 1`
	} else {
		sessionQuery = `SELECT 1 FROM sessions WHERE id = ? AND is_revoked = 1 LIMIT 1`
	}

	err = s.db.QueryRow(sessionQuery, jti).Scan(&dummy)
	if err == nil {
		return true, nil
	}
	if err == sql.ErrNoRows {
		return false, nil
	}
	return false, fmt.Errorf("gagal query sessions: %w", err)
}

// RevokeAllUserTokens membatalkan semua token yang diterbitkan sebelum saat ini untuk user tertentu (misal saat ganti password).
func (s *SQLTokenStore) RevokeAllUserTokens(userID string) error {
	if userID == "" {
		return nil
	}

	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO user_token_revocations (user_id, revoked_before)
		         VALUES ($1, $2)
		         ON CONFLICT (user_id) DO UPDATE SET revoked_before = EXCLUDED.revoked_before`
	} else {
		query = `INSERT INTO user_token_revocations (user_id, revoked_before)
		         VALUES (?, ?)
		         ON CONFLICT(user_id) DO UPDATE SET revoked_before = excluded.revoked_before`
	}

	_, err := s.db.Exec(query, userID, now)
	if err != nil {
		return fmt.Errorf("gagal mencabut semua token user %s: %w", userID, err)
	}

	s.userRevocationsCache.Store(userID, now)
	return nil
}

// IsUserRevokedBefore memeriksa apakah token diterbitkan sebelum waktu pencabutan massal user tersebut.
func (s *SQLTokenStore) IsUserRevokedBefore(userID string, issuedAt time.Time) (bool, error) {
	if userID == "" {
		return false, nil
	}

	var revokedBefore time.Time
	// Cek cache memori terlebih dahulu (0ms fast path)
	if val, ok := s.userRevocationsCache.Load(userID); ok {
		if t, okTime := val.(time.Time); okTime {
			revokedBefore = t
		}
	}

	if revokedBefore.IsZero() {
		var query string
		if s.driverName == "postgres" {
			query = `SELECT revoked_before FROM user_token_revocations WHERE user_id = $1`
		} else {
			query = `SELECT revoked_before FROM user_token_revocations WHERE user_id = ?`
		}

		err := s.db.QueryRow(query, userID).Scan(&revokedBefore)
		if err != nil {
			if err == sql.ErrNoRows {
				return false, nil
			}
			return false, fmt.Errorf("gagal cek user_token_revocations: %w", err)
		}

		s.userRevocationsCache.Store(userID, revokedBefore)
	}

	if revokedBefore.IsZero() {
		return false, nil
	}

	// Bandingkan dalam detik Unix (karena field iat JWT RFC 7519 hanya berpresisi detik integer)
	return issuedAt.Unix() < revokedBefore.Unix(), nil
}

// CleanupExpiredTokens membersihkan entri revoked_tokens yang sudah kedaluwarsa secara alami.
func (s *SQLTokenStore) CleanupExpiredTokens() (int64, error) {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `DELETE FROM revoked_tokens WHERE expires_at < $1`
	} else {
		query = `DELETE FROM revoked_tokens WHERE expires_at < ?`
	}

	res, err := s.db.Exec(query, now)
	if err != nil {
		return 0, fmt.Errorf("gagal cleanup expired tokens: %w", err)
	}
	return res.RowsAffected()
}
