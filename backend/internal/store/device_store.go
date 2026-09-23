package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// ─────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────

// Device merepresentasikan satu perangkat yang pernah login oleh seorang user.
type Device struct {
	ID         string     `json:"id"`           // dev_<uuid>, dari localStorage frontend
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`         // Contoh: "Chrome on Windows 11"
	Platform   string     `json:"platform"`     // "web" | "android" | "ios" | "desktop"
	UserAgent  string     `json:"user_agent,omitempty"`
	IPAddress  string     `json:"ip_address,omitempty"`
	IsActive   bool       `json:"is_active"`
	LastSeenAt *time.Time `json:"last_seen_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ─────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────

// DeviceStore mendefinisikan operasi yang bisa dilakukan pada tabel devices.
type DeviceStore interface {
	// RegisterOrUpdateDevice mencatat perangkat baru atau memperbarui data perangkat yang sudah ada.
	// Dipanggil setiap kali user berhasil login.
	RegisterOrUpdateDevice(device *Device) error

	// GetUserDevices mengembalikan semua perangkat aktif milik user tertentu.
	GetUserDevices(userID string) ([]Device, error)

	// DeactivateDevice menonaktifkan (is_active = false) sebuah perangkat.
	// userID digunakan sebagai guard keamanan — user hanya bisa menonaktifkan device miliknya sendiri.
	DeactivateDevice(deviceID, userID string) error

	// TouchDevice memperbarui last_seen_at ke waktu sekarang.
	// Dipanggil saat WebSocket berhasil terhubung.
	TouchDevice(deviceID string) error

	// GetDeviceByID mengambil detail sebuah perangkat berdasarkan ID (aktif maupun nonaktif).
	GetDeviceByID(deviceID string) (*Device, error)
}

// ─────────────────────────────────────────────
// SQL Implementation
// ─────────────────────────────────────────────

// SQLDeviceStore adalah implementasi DeviceStore menggunakan SQL (PostgreSQL atau SQLite).
type SQLDeviceStore struct {
	db         *sql.DB
	driverName string // "postgres" atau "sqlite3"
}

// NewSQLDeviceStore membuat instance baru SQLDeviceStore.
func NewSQLDeviceStore(db *sql.DB, driverName string) *SQLDeviceStore {
	return &SQLDeviceStore{db: db, driverName: driverName}
}

// isPostgres mengembalikan true jika driver adalah PostgreSQL.
func (s *SQLDeviceStore) isPostgres() bool {
	return s.driverName == "postgres"
}

// RegisterOrUpdateDevice melakukan UPSERT — update jika sudah ada, insert jika belum ada.
func (s *SQLDeviceStore) RegisterOrUpdateDevice(device *Device) error {
	now := time.Now().UTC()
	if device.CreatedAt.IsZero() {
		device.CreatedAt = now
	}

	var upsertQuery string
	if s.isPostgres() {
		upsertQuery = `INSERT INTO devices (id, user_id, name, platform, user_agent, ip_address, is_active, last_seen_at, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				name = EXCLUDED.name,
				platform = EXCLUDED.platform,
				user_agent = EXCLUDED.user_agent,
				ip_address = EXCLUDED.ip_address,
				is_active = TRUE,
				last_seen_at = EXCLUDED.last_seen_at`
	} else {
		upsertQuery = `INSERT INTO devices (id, user_id, name, platform, user_agent, ip_address, is_active, last_seen_at, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
			ON CONFLICT (id) DO UPDATE SET
				user_id = excluded.user_id,
				name = excluded.name,
				platform = excluded.platform,
				user_agent = excluded.user_agent,
				ip_address = excluded.ip_address,
				is_active = 1,
				last_seen_at = excluded.last_seen_at`
	}

	_, err := s.db.Exec(upsertQuery,
		device.ID, device.UserID, device.Name, device.Platform,
		device.UserAgent, device.IPAddress, now, device.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("RegisterOrUpdateDevice upsert: %w", err)
	}

	return nil
}

// GetUserDevices mengembalikan semua perangkat aktif milik user, diurutkan berdasarkan last_seen_at terbaru.
func (s *SQLDeviceStore) GetUserDevices(userID string) ([]Device, error) {
	var query string
	if s.isPostgres() {
		query = `SELECT id, user_id, name, platform, ip_address, is_active, last_seen_at, created_at
			FROM devices
			WHERE user_id=$1 AND is_active=TRUE
			ORDER BY last_seen_at DESC NULLS LAST`
	} else {
		query = `SELECT id, user_id, name, platform, ip_address, is_active, last_seen_at, created_at
			FROM devices
			WHERE user_id=? AND is_active=1
			ORDER BY CASE WHEN last_seen_at IS NULL THEN 0 ELSE 1 END DESC, last_seen_at DESC`
	}

	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("GetUserDevices query: %w", err)
	}
	defer rows.Close()

	var devices []Device
	for rows.Next() {
		var d Device
		var lastSeen sql.NullTime
		err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Platform, &d.IPAddress, &d.IsActive, &lastSeen, &d.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("GetUserDevices scan: %w", err)
		}
		if lastSeen.Valid {
			d.LastSeenAt = &lastSeen.Time
		}
		devices = append(devices, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetUserDevices rows: %w", err)
	}

	return devices, nil
}

// DeactivateDevice menonaktifkan perangkat (is_active = false).
// Guard: userID harus cocok agar user tidak bisa menonaktifkan device user lain.
func (s *SQLDeviceStore) DeactivateDevice(deviceID, userID string) error {
	var query string
	if s.isPostgres() {
		query = `UPDATE devices SET is_active=FALSE WHERE id=$1 AND user_id=$2`
	} else {
		query = `UPDATE devices SET is_active=0 WHERE id=? AND user_id=?`
	}

	result, err := s.db.Exec(query, deviceID, userID)
	if err != nil {
		return fmt.Errorf("DeactivateDevice: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("DeactivateDevice rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("device tidak ditemukan atau bukan milik user")
	}

	return nil
}

// TouchDevice memperbarui last_seen_at ke waktu sekarang.
func (s *SQLDeviceStore) TouchDevice(deviceID string) error {
	var query string
	if s.isPostgres() {
		query = `UPDATE devices SET last_seen_at=$1 WHERE id=$2`
	} else {
		query = `UPDATE devices SET last_seen_at=? WHERE id=?`
	}
	_, err := s.db.Exec(query, time.Now().UTC(), deviceID)
	if err != nil {
		return fmt.Errorf("TouchDevice: %w", err)
	}
	return nil
}

// GetDeviceByID mengambil detail sebuah perangkat berdasarkan ID (aktif maupun nonaktif).
func (s *SQLDeviceStore) GetDeviceByID(deviceID string) (*Device, error) {
	var query string
	if s.isPostgres() {
		query = `SELECT id, user_id, name, platform, ip_address, is_active, last_seen_at, created_at
			FROM devices WHERE id=$1`
	} else {
		query = `SELECT id, user_id, name, platform, ip_address, is_active, last_seen_at, created_at
			FROM devices WHERE id=?`
	}

	var d Device
	var lastSeen sql.NullTime
	err := s.db.QueryRow(query, deviceID).Scan(
		&d.ID, &d.UserID, &d.Name, &d.Platform, &d.IPAddress, &d.IsActive, &lastSeen, &d.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // not found
		}
		return nil, fmt.Errorf("GetDeviceByID: %w", err)
	}
	if lastSeen.Valid {
		d.LastSeenAt = &lastSeen.Time
	}
	return &d, nil
}

