package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"
)

const (
	shortCodeAlphabet = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ" // tanpa 0/O/1/l/I agar mudah dibaca
	shortCodeLength   = 8
	shortCodeAttempts = 5
)

var (
	// ErrShortLinkNotFound berarti kode tidak dikenal atau grupnya sudah tidak ada.
	ErrShortLinkNotFound = errors.New("tautan tidak ditemukan")
	// ErrShortLinkForbidden berarti pemanggil bukan anggota grup yang dimintai tautan.
	ErrShortLinkForbidden = errors.New("hanya anggota yang dapat membuat tautan")

	shortCodePattern = regexp.MustCompile(`^[2-9a-hj-km-np-zA-HJ-NP-Z]{8}$`)
)

// IsShortCode memeriksa apakah s berbentuk kode tautan pendek (bukan ID grp_/sub_/dm_).
func IsShortCode(s string) bool { return shortCodePattern.MatchString(s) }

// ShortLinkStore menyimpan kode tautan pendek di kolom conversations.short_code.
type ShortLinkStore struct {
	db         *sql.DB
	driverName string
}

func NewShortLinkStore(db *sql.DB, driverName string) *ShortLinkStore {
	return &ShortLinkStore{db: db, driverName: driverName}
}

func generateShortCode() (string, error) {
	max := big.NewInt(int64(len(shortCodeAlphabet)))
	var b strings.Builder
	for i := 0; i < shortCodeLength; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b.WriteByte(shortCodeAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// GetOrCreate mengembalikan kode pendek grup/subgrup roomID, membuatnya bila belum ada.
// Hanya anggota grup yang boleh meminta; kode sudah ada tidak pernah diganti sehingga tautan lama tetap berlaku.
func (s *ShortLinkStore) GetOrCreate(ctx context.Context, roomID, userID string) (string, error) {
	if !strings.HasPrefix(roomID, "grp_") && !strings.HasPrefix(roomID, "sub_") {
		return "", ErrShortLinkNotFound
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var code sql.NullString
	err := s.db.QueryRowContext(ctx, rebindQuery(s.driverName,
		`SELECT short_code FROM conversations WHERE id = ?`), roomID).Scan(&code)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrShortLinkNotFound
	}
	if err != nil {
		return "", err
	}

	var member int
	if err := s.db.QueryRowContext(ctx, rebindQuery(s.driverName,
		`SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?`), roomID, userID).Scan(&member); err != nil {
		return "", err
	}
	if member == 0 {
		return "", ErrShortLinkForbidden
	}
	if code.Valid && code.String != "" {
		return code.String, nil
	}

	for i := 0; i < shortCodeAttempts; i++ {
		candidate, err := generateShortCode()
		if err != nil {
			return "", err
		}
		// UPDATE bersyarat: dua permintaan bersamaan tidak saling menimpa kode.
		res, err := s.db.ExecContext(ctx, rebindQuery(s.driverName,
			`UPDATE conversations SET short_code = ? WHERE id = ? AND (short_code IS NULL OR short_code = '')`), candidate, roomID)
		if err != nil {
			if isUniqueViolation(err) {
				continue // tabrakan kode: coba kode lain
			}
			return "", err
		}
		if n, _ := res.RowsAffected(); n == 1 {
			return candidate, nil
		}
		// Kalah balapan: baca kode pemenang.
		var won sql.NullString
		if err := s.db.QueryRowContext(ctx, rebindQuery(s.driverName,
			`SELECT short_code FROM conversations WHERE id = ?`), roomID).Scan(&won); err != nil {
			return "", err
		}
		if won.Valid && won.String != "" {
			return won.String, nil
		}
	}
	return "", fmt.Errorf("gagal membuat kode tautan pendek setelah %d percobaan", shortCodeAttempts)
}

// Resolve menerjemahkan kode pendek menjadi ID grup/subgrup. Hanya ID yang dikembalikan; hak akses tetap diperiksa
// oleh endpoint grup (grup privat menolak non-anggota).
func (s *ShortLinkStore) Resolve(ctx context.Context, code string) (string, error) {
	if !IsShortCode(code) {
		return "", ErrShortLinkNotFound
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var id string
	err := s.db.QueryRowContext(ctx, rebindQuery(s.driverName,
		`SELECT id FROM conversations WHERE short_code = ?`), code).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrShortLinkNotFound
	}
	return id, err
}
