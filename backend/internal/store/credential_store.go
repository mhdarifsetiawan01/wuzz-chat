package store

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// =============================================================
// MODEL
// =============================================================

// UserCredential merepresentasikan satu metode login yang dimiliki user.
// Contoh: type='password', type='passkey', type='oauth'.
type UserCredential struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Type       string    `json:"type"`       // "password" | "passkey" | "oauth"
	Identifier string    `json:"identifier"` // username / email / credential_id
	SecretData string    `json:"-"`          // bcrypt hash -- TIDAK dikirim ke frontend!
	Name       string    `json:"name"`       // Label: "Password Akun", "Touch ID MacBook"
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// =============================================================
// INTERFACE (Kontrak)
// =============================================================

// CredentialStore mendefinisikan operasi tabel user_credentials.
type CredentialStore interface {
	// CreateCredential menyimpan kredensial baru untuk seorang user.
	// Jika sudah ada (ON CONFLICT), diabaikan -- tidak error.
	CreateCredential(cred *UserCredential) error

	// GetPasswordCredential mengambil kredensial password milik userID.
	// Mengembalikan (nil, nil) jika tidak ditemukan -- ini NORMAL untuk user lama!
	GetPasswordCredential(userID string) (*UserCredential, error)

	// UpdatePasswordCredential memperbarui hash password di tabel ini.
	// Dipanggil saat user berhasil ChangePassword.
	UpdatePasswordCredential(userID, newSecretData string) error

	// ListCredentials mengembalikan semua metode login user (tanpa secret_data).
	ListCredentials(userID string) ([]UserCredential, error)
}

// =============================================================
// SQL IMPLEMENTATION
// =============================================================

// SQLCredentialStore adalah implementasi CredentialStore menggunakan SQL.
type SQLCredentialStore struct {
	db         *sql.DB
	driverName string // "postgres" atau "sqlite"
}

// NewSQLCredentialStore membuat instance baru SQLCredentialStore.
func NewSQLCredentialStore(db *sql.DB, driverName string) *SQLCredentialStore {
	return &SQLCredentialStore{db: db, driverName: driverName}
}

// isPostgres mengembalikan true jika driver adalah PostgreSQL.
func (s *SQLCredentialStore) isPostgres() bool {
	return s.driverName == "postgres"
}

// CreateCredential menyimpan baris baru ke tabel user_credentials.
func (s *SQLCredentialStore) CreateCredential(cred *UserCredential) error {
	if cred.ID == "" {
		cred.ID = uuid.New().String()
	}
	now := time.Now().UTC()
	if cred.CreatedAt.IsZero() {
		cred.CreatedAt = now
	}
	cred.UpdatedAt = now

	var query string
	if s.isPostgres() {
		query = `INSERT INTO user_credentials
		         (id, user_id, type, identifier, secret_data, name, created_at, updated_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		         ON CONFLICT DO NOTHING`
	} else {
		query = `INSERT OR IGNORE INTO user_credentials
		         (id, user_id, type, identifier, secret_data, name, created_at, updated_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.Exec(query,
		cred.ID, cred.UserID, cred.Type, cred.Identifier,
		cred.SecretData, cred.Name, cred.CreatedAt, cred.UpdatedAt)
	if err != nil {
		return fmt.Errorf("gagal menyimpan credential: %w", err)
	}
	return nil
}

// GetPasswordCredential mencari kredensial bertipe 'password' milik userID.
// PENTING: Mengembalikan (nil, nil) -- bukan error -- jika tidak ditemukan.
func (s *SQLCredentialStore) GetPasswordCredential(userID string) (*UserCredential, error) {
	var query string
	if s.isPostgres() {
		query = `SELECT id, user_id, type, identifier, secret_data, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = $1 AND type = 'password' LIMIT 1`
	} else {
		query = `SELECT id, user_id, type, identifier, secret_data, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = ? AND type = 'password' LIMIT 1`
	}

	row := s.db.QueryRow(query, userID)
	var cred UserCredential
	err := row.Scan(
		&cred.ID, &cred.UserID, &cred.Type, &cred.Identifier,
		&cred.SecretData, &cred.Name, &cred.CreatedAt, &cred.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil // Tidak ditemukan -- ini NORMAL untuk user lama
	}
	if err != nil {
		return nil, fmt.Errorf("gagal membaca credential: %w", err)
	}
	return &cred, nil
}

// UpdatePasswordCredential memperbarui hash password di tabel user_credentials.
func (s *SQLCredentialStore) UpdatePasswordCredential(userID, newSecretData string) error {
	now := time.Now().UTC()
	var query string
	if s.isPostgres() {
		query = `UPDATE user_credentials SET secret_data = $1, updated_at = $2
		         WHERE user_id = $3 AND type = 'password'`
	} else {
		query = `UPDATE user_credentials SET secret_data = ?, updated_at = ?
		         WHERE user_id = ? AND type = 'password'`
	}
	_, err := s.db.Exec(query, newSecretData, now, userID)
	if err != nil {
		return fmt.Errorf("gagal update password credential: %w", err)
	}
	return nil
}

// ListCredentials mengembalikan semua kredensial milik userID.
// PENTING: secret_data TIDAK diisi -- tidak boleh bocor ke frontend!
func (s *SQLCredentialStore) ListCredentials(userID string) ([]UserCredential, error) {
	var query string
	if s.isPostgres() {
		// Perhatikan: kita SELECT 7 kolom, TIDAK termasuk secret_data
		query = `SELECT id, user_id, type, identifier, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = $1 ORDER BY created_at ASC`
	} else {
		query = `SELECT id, user_id, type, identifier, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = ? ORDER BY created_at ASC`
	}

	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("gagal query credentials: %w", err)
	}
	defer rows.Close()

	var result []UserCredential
	for rows.Next() {
		var c UserCredential
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.Type, &c.Identifier,
			&c.Name, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		// c.SecretData sengaja dikosongkan -- tidak di-SELECT dari DB
		result = append(result, c)
	}
	return result, nil
}
