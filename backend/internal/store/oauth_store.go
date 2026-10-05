package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	sharederrors "github.com/bms-del112/wuzz-chat/internal/shared/errors"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

// CredTypeOAuth adalah nilai kolom user_credentials.type untuk login pihak ketiga.
const CredTypeOAuth = "oauth"

// Sentinel error OAuth didefinisikan di shared/errors agar domain (authz) dan store memakai nilai yang sama.
var (
	ErrOAuthSubjectTaken  = sharederrors.ErrOAuthSubjectTaken
	ErrOAuthAlreadyLinked = sharederrors.ErrOAuthAlreadyLinked
	ErrOAuthNotLinked     = sharederrors.ErrOAuthNotLinked
)

// OAuthIdentifier membentuk nilai kolom identifier untuk kredensial oauth ("google:<sub>").
func OAuthIdentifier(provider, subject string) string {
	return provider + ":" + subject
}

// OAuthStore mengelola kredensial oauth. Terpisah dari CredentialStore supaya kontrak lama tidak berubah.
type OAuthStore interface {
	// FindUserIDBySubject mencari akun yang tertaut ke identitas ini. found=false bila belum ada.
	FindUserIDBySubject(ctx context.Context, provider, subject string) (userID string, found bool, err error)

	// GetLinkedSubject mengembalikan sub yang tertaut ke akun. found=false bila belum tertaut.
	GetLinkedSubject(ctx context.Context, userID, provider string) (subject string, found bool, err error)

	// CreateUserWithOAuth membuat user dan kredensial oauth dalam SATU transaksi (tanpa password) dan mengembalikan
	// userID. provider mis. "google"; subject adalah klaim sub; label hanya untuk tampilan (mis. email), bukan kunci.
	// Mengembalikan ErrUserExists atau ErrOAuthSubjectTaken bila bentrok; tidak ada yang tersimpan bila gagal.
	CreateUserWithOAuth(ctx context.Context, username, displayName, provider, subject, label string) (userID string, err error)

	// LinkOAuth menautkan identitas ke akun yang sudah ada.
	// Mengembalikan ErrOAuthSubjectTaken atau ErrOAuthAlreadyLinked bila bentrok.
	LinkOAuth(ctx context.Context, userID, provider, subject, label string) error

	// UnlinkOAuth melepas akun Google dari akun. ErrOAuthNotLinked bila tidak ada yang tertaut.
	// Pemanggil bertanggung jawab memastikan akun masih punya cara login lain (password).
	UnlinkOAuth(ctx context.Context, userID, provider string) error

	// ReplaceOAuth mengganti identitas tertaut (oldSubject harus cocok) secara atomik.
	ReplaceOAuth(ctx context.Context, userID, provider, oldSubject, newSubject, label string) error
}

// SQLOAuthStore adalah implementasi OAuthStore untuk SQLite & PostgreSQL.
type SQLOAuthStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLOAuthStore membuat store baru.
func NewSQLOAuthStore(db *sql.DB, driverName string) *SQLOAuthStore {
	return &SQLOAuthStore{db: db, driverName: driverName}
}

func (s *SQLOAuthStore) q(query string) string {
	if s.driverName != "postgres" {
		return query
	}
	// Ubah placeholder "?" menjadi $1, $2, ... untuk PostgreSQL.
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			fmt.Fprintf(&b, "$%d", n)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func (s *SQLOAuthStore) FindUserIDBySubject(ctx context.Context, provider, subject string) (string, bool, error) {
	var userID string
	err := s.db.QueryRowContext(ctx,
		s.q(`SELECT user_id FROM user_credentials WHERE type = 'oauth' AND identifier = ? LIMIT 1`),
		OAuthIdentifier(provider, subject)).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("gagal mencari kredensial oauth: %w", err)
	}
	return userID, true, nil
}

func (s *SQLOAuthStore) GetLinkedSubject(ctx context.Context, userID, provider string) (string, bool, error) {
	var ident string
	err := s.db.QueryRowContext(ctx,
		s.q(`SELECT identifier FROM user_credentials WHERE type = 'oauth' AND user_id = ? AND identifier LIKE ? LIMIT 1`),
		userID, provider+":%").Scan(&ident)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("gagal membaca kredensial oauth: %w", err)
	}
	return strings.TrimPrefix(ident, provider+":"), true, nil
}

func (s *SQLOAuthStore) CreateUserWithOAuth(ctx context.Context, username, displayName, provider, subject, label string) (string, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("gagal memulai transaksi: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Username unik per tenant tanpa membedakan huruf besar/kecil (sama dengan pencarian login).
	var exists int
	if err := tx.QueryRowContext(ctx,
		s.q(`SELECT COUNT(1) FROM users WHERE tenant_id = ? AND LOWER(username) = LOWER(?)`),
		tenantID, username).Scan(&exists); err != nil {
		return "", fmt.Errorf("gagal memeriksa username: %w", err)
	}
	if exists > 0 {
		return "", ErrUserExists
	}

	now := time.Now().UTC()
	userID := uuid.New().String()
	if _, err := tx.ExecContext(ctx,
		s.q(`INSERT INTO users (id, tenant_id, username, display_name, password_hash, status_message, avatar_url, created_at)
		     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
		userID, tenantID, username, displayName, "" /* tanpa password: bcrypt terhadap hash kosong selalu gagal */, "Tersedia untuk mengobrol", "", now); err != nil {
		return "", mapUniqueErr(err, "gagal menyimpan user")
	}
	if err := insertOAuth(ctx, tx, s, userID, provider, subject, label, now); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("gagal commit: %w", err)
	}
	return userID, nil
}

func (s *SQLOAuthStore) LinkOAuth(ctx context.Context, userID, provider, subject, label string) error {
	return insertOAuth(ctx, s.db, s, userID, provider, subject, label, time.Now().UTC())
}

func (s *SQLOAuthStore) UnlinkOAuth(ctx context.Context, userID, provider string) error {
	res, err := s.db.ExecContext(ctx,
		s.q(`DELETE FROM user_credentials WHERE type = 'oauth' AND user_id = ? AND identifier LIKE ?`),
		userID, provider+":%")
	if err != nil {
		return fmt.Errorf("gagal memutus akun Google: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrOAuthNotLinked
	}
	return nil
}

func (s *SQLOAuthStore) ReplaceOAuth(ctx context.Context, userID, provider, oldSubject, newSubject, label string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal memulai transaksi: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(ctx,
		s.q(`DELETE FROM user_credentials WHERE type = 'oauth' AND user_id = ? AND identifier = ?`),
		userID, OAuthIdentifier(provider, oldSubject))
	if err != nil {
		return fmt.Errorf("gagal melepas akun Google lama: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrOAuthNotLinked
	}
	if err := insertOAuth(ctx, tx, s, userID, provider, newSubject, label, time.Now().UTC()); err != nil {
		return err
	}
	return tx.Commit()
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func insertOAuth(ctx context.Context, ex execer, s *SQLOAuthStore, userID, provider, subject, label string, now time.Time) error {
	_, err := ex.ExecContext(ctx,
		s.q(`INSERT INTO user_credentials (id, user_id, type, identifier, secret_data, name, created_at, updated_at)
		     VALUES (?, ?, 'oauth', ?, '', ?, ?, ?)`),
		uuid.New().String(), userID, OAuthIdentifier(provider, subject), label, now, now)
	if err != nil {
		return mapUniqueErr(err, "gagal menyimpan kredensial oauth")
	}
	return nil
}

// mapUniqueErr memetakan pelanggaran indeks unik (SQLite maupun PostgreSQL) ke error domain.
func mapUniqueErr(err error, wrap string) error {
	msg := strings.ToLower(err.Error())
	unique := strings.Contains(msg, "unique constraint") || strings.Contains(msg, "duplicate key")
	if unique {
		switch {
		case strings.Contains(msg, "idx_credentials_oauth_subject") || strings.Contains(msg, "user_credentials.identifier"):
			return ErrOAuthSubjectTaken
		case strings.Contains(msg, "idx_credentials_oauth_user") || strings.Contains(msg, "user_credentials.user_id"):
			return ErrOAuthAlreadyLinked
		case strings.Contains(msg, "users"):
			return ErrUserExists
		}
	}
	return fmt.Errorf("%s: %w", wrap, err)
}
