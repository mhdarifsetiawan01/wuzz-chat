package store

import (
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
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

// CheckRevocation memenuhi auth.CombinedRevocationChecker: memeriksa pencabutan token (jti), pencabutan sesi, dan pencabutan
// massal akun. Di PostgreSQL ketiganya dikerjakan dalam SATU query (sebelumnya tiga putaran berurutan ke database di
// setiap permintaan ber-token, yang di produksi ±100 ms per putaran). Semantik identik dengan IsTokenRevoked +
// IsUserRevokedBefore: tetap memeriksa database setiap kali (tanpa cache baru), pencabutan individual didahulukan, dan
// issuedAt nol melewati pemeriksaan massal. Driver lain memakai jalur lama.
func (s *SQLTokenStore) CheckRevocation(jti, userID string, issuedAt time.Time) (auth.RevocationReason, error) {
	if s.driverName != "postgres" {
		return s.checkRevocationSequential(jti, userID, issuedAt)
	}

	// Pencabutan massal yang sudah ada di memori tidak perlu dibaca ulang dari database.
	var cachedBefore time.Time
	haveCached := false
	if userID != "" {
		if val, ok := s.userRevocationsCache.Load(userID); ok {
			if t, okTime := val.(time.Time); okTime && !t.IsZero() {
				cachedBefore, haveCached = t, true
			}
		}
	}

	if haveCached {
		var tokRevoked bool
		if err := s.db.QueryRow(`SELECT (EXISTS (SELECT 1 FROM revoked_tokens WHERE jti = $1)
			OR EXISTS (SELECT 1 FROM sessions WHERE id = $1 AND is_revoked = TRUE))`, jti).Scan(&tokRevoked); err != nil {
			return auth.NotRevoked, fmt.Errorf("gagal memeriksa pencabutan token: %w", err)
		}
		if tokRevoked {
			return auth.TokenRevoked, nil
		}
		if !issuedAt.IsZero() && issuedAt.Unix() < cachedBefore.Unix() {
			return auth.AllSessionsRevoked, nil
		}
		return auth.NotRevoked, nil
	}

	var tokRevoked bool
	var revokedBefore sql.NullTime
	if err := s.db.QueryRow(`SELECT (EXISTS (SELECT 1 FROM revoked_tokens WHERE jti = $1)
		OR EXISTS (SELECT 1 FROM sessions WHERE id = $1 AND is_revoked = TRUE)),
		(SELECT revoked_before FROM user_token_revocations WHERE user_id = $2)`, jti, userID).Scan(&tokRevoked, &revokedBefore); err != nil {
		return auth.NotRevoked, fmt.Errorf("gagal memeriksa pencabutan token/sesi: %w", err)
	}
	if revokedBefore.Valid && !revokedBefore.Time.IsZero() && userID != "" {
		s.userRevocationsCache.Store(userID, revokedBefore.Time) // sama seperti IsUserRevokedBefore: hanya yang ada baris
	}
	if tokRevoked {
		return auth.TokenRevoked, nil
	}
	if !issuedAt.IsZero() && revokedBefore.Valid && !revokedBefore.Time.IsZero() && issuedAt.Unix() < revokedBefore.Time.Unix() {
		return auth.AllSessionsRevoked, nil
	}
	return auth.NotRevoked, nil
}

// checkRevocationSequential adalah jalur lama (dua pemeriksaan terpisah), dipakai driver selain PostgreSQL.
// Galat pada satu pemeriksaan diabaikan (gagal terbuka) dan pemeriksaan berikutnya tetap jalan, persis perilaku middleware lama.
func (s *SQLTokenStore) checkRevocationSequential(jti, userID string, issuedAt time.Time) (auth.RevocationReason, error) {
	if jti != "" {
		if revoked, err := s.IsTokenRevoked(jti); err == nil && revoked {
			return auth.TokenRevoked, nil
		}
	}
	if userID != "" && !issuedAt.IsZero() {
		if revoked, err := s.IsUserRevokedBefore(userID, issuedAt); err == nil && revoked {
			return auth.AllSessionsRevoked, nil
		}
	}
	return auth.NotRevoked, nil
}
