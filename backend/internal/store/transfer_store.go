package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var (
	ErrTransferNotFound     = errors.New("sesi transfer tidak ditemukan")
	ErrTransferAlreadyUsed  = errors.New("sesi transfer sudah pernah digunakan")
	ErrTransferExpired      = errors.New("sesi transfer telah kedaluwarsa")
	ErrTransferUnauthorized = errors.New("sesi transfer bukan milik akun ini")
)

// DeviceTransferSession merepresentasikan record transfer key antar perangkat.
type DeviceTransferSession struct {
	SessionToken    string    `json:"session_token"`
	UserID          string    `json:"user_id"`
	EncryptedBundle string    `json:"encrypted_bundle"`
	IsUsed          bool      `json:"is_used"`
	CreatedAt       time.Time `json:"created_at"`
	ExpiresAt       time.Time `json:"expires_at"`
}

// TransferStore mendefinisikan kontrak operasi penyimpanan transfer sesi E2EE.
type TransferStore interface {
	CreateTransferSession(userID, sessionToken, encryptedBundle string, ttl time.Duration) error
	ConsumeTransferSession(sessionToken, targetUserID, targetDeviceID string) (string, error)
	CleanupExpiredSessions() (int64, error)
}

// SQLTransferStore adalah implementasi TransferStore berbasis SQL.
type SQLTransferStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLTransferStore membuat instance baru SQLTransferStore.
func NewSQLTransferStore(db *sql.DB, driverName string) *SQLTransferStore {
	return &SQLTransferStore{
		db:         db,
		driverName: driverName,
	}
}

// CreateTransferSession menyimpan sesi transfer baru dengan TTL yang ditentukan.
func (s *SQLTransferStore) CreateTransferSession(userID, sessionToken, encryptedBundle string, ttl time.Duration) error {
	now := time.Now().UTC()
	expiresAt := now.Add(ttl)

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO device_transfer_sessions (session_token, user_id, encrypted_bundle, is_used, created_at, expires_at)
		         VALUES ($1, $2, $3, FALSE, $4, $5)`
	} else {
		query = `INSERT INTO device_transfer_sessions (session_token, user_id, encrypted_bundle, is_used, created_at, expires_at)
		         VALUES (?, ?, ?, FALSE, ?, ?)`
	}

	_, err := s.db.Exec(query, sessionToken, userID, encryptedBundle, now, expiresAt)
	if err != nil {
		return fmt.Errorf("gagal membuat sesi transfer: %w", err)
	}

	return nil
}

// ConsumeTransferSession mengambil bundle terenkripsi secara atomik (one-time use),
// menandai sesi sebagai used, dan memperbarui active_device_id user ke targetDeviceID dalam 1 transaksi DB.
func (s *SQLTransferStore) ConsumeTransferSession(sessionToken, targetUserID, targetDeviceID string) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", fmt.Errorf("gagal memulai transaksi DB: %w", err)
	}
	defer tx.Rollback()

	var userID, encryptedBundle string
	var isUsed bool
	var expiresAt time.Time

	var selectQuery string
	if s.driverName == "postgres" {
		selectQuery = `SELECT user_id, encrypted_bundle, is_used, expires_at 
		               FROM device_transfer_sessions 
		               WHERE session_token = $1 FOR UPDATE`
	} else {
		selectQuery = `SELECT user_id, encrypted_bundle, is_used, expires_at 
		               FROM device_transfer_sessions 
		               WHERE session_token = ?`
	}

	row := tx.QueryRow(selectQuery, sessionToken)
	err = row.Scan(&userID, &encryptedBundle, &isUsed, &expiresAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrTransferNotFound
		}
		return "", fmt.Errorf("gagal membaca sesi transfer: %w", err)
	}

	if isUsed {
		return "", ErrTransferAlreadyUsed
	}

	if time.Now().UTC().After(expiresAt) {
		return "", ErrTransferExpired
	}

	if userID != targetUserID {
		return "", ErrTransferUnauthorized
	}

	// 1. Mark transfer session as used
	var updateSessionQuery string
	if s.driverName == "postgres" {
		updateSessionQuery = `UPDATE device_transfer_sessions SET is_used = TRUE WHERE session_token = $1`
	} else {
		updateSessionQuery = `UPDATE device_transfer_sessions SET is_used = TRUE WHERE session_token = ?`
	}

	if _, err := tx.Exec(updateSessionQuery, sessionToken); err != nil {
		return "", fmt.Errorf("gagal menandai sesi transfer: %w", err)
	}

	// 2. Update active_device_id user ke perangkat baru jika targetDeviceID disertakan
	if targetDeviceID != "" {
		var updateUserQuery string
		if s.driverName == "postgres" {
			updateUserQuery = `UPDATE users SET active_device_id = $1 WHERE id = $2`
		} else {
			updateUserQuery = `UPDATE users SET active_device_id = ? WHERE id = ?`
		}

		if _, err := tx.Exec(updateUserQuery, targetDeviceID, targetUserID); err != nil {
			return "", fmt.Errorf("gagal memperbarui active_device_id: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("gagal commit transaksi transfer: %w", err)
	}

	return encryptedBundle, nil
}

// CleanupExpiredSessions menghapus sesi transfer yang sudah kedaluwarsa atau sudah digunakan.
func (s *SQLTransferStore) CleanupExpiredSessions() (int64, error) {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `DELETE FROM device_transfer_sessions WHERE expires_at < $1 OR is_used = TRUE`
	} else {
		query = `DELETE FROM device_transfer_sessions WHERE expires_at < ? OR is_used = TRUE`
	}

	res, err := s.db.Exec(query, now)
	if err != nil {
		return 0, fmt.Errorf("gagal membersihkan sesi kedaluwarsa: %w", err)
	}

	return res.RowsAffected()
}
