package store

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// MediaPurgeQueue adalah antrean penghapusan berkas fisik yang tidak lagi punya baris pesan
// (mis. sisa akun yang dihapus), sehingga tak terjangkau GetExpiredMediaMessages.
type MediaPurgeQueue interface {
	// ClaimDue mengambil paling banyak limit berkas yang sudah waktunya dicoba hapus.
	ClaimDue(ctx context.Context, limit int) ([]string, error)
	// Complete membuang berkas dari antrean (sudah terhapus).
	Complete(ctx context.Context, mediaURL string) error
	// Fail menjadwalkan percobaan ulang dengan jeda bertambah; setelah maxAttempts berkas dibuang dari antrean
	// dan dikembalikan sebagai gaveUp=true agar pemanggil mencatatnya di log.
	Fail(ctx context.Context, mediaURL string, maxAttempts int) (gaveUp bool, err error)
}

// SQLMediaPurgeQueue adalah implementasi MediaPurgeQueue untuk SQLite & PostgreSQL.
type SQLMediaPurgeQueue struct {
	db         *sql.DB
	driverName string
}

// NewSQLMediaPurgeQueue membuat antrean; tabelnya dibuat oleh migrasi SQLMessageStore.
func NewSQLMediaPurgeQueue(db *sql.DB, driverName string) *SQLMediaPurgeQueue {
	return &SQLMediaPurgeQueue{db: db, driverName: driverName}
}

func (q *SQLMediaPurgeQueue) rebind(query string) string {
	if q.driverName != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func (q *SQLMediaPurgeQueue) ClaimDue(ctx context.Context, limit int) ([]string, error) {
	rows, err := q.db.QueryContext(ctx, q.rebind(`SELECT media_url FROM media_purge_queue WHERE next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?`), time.Now().UTC(), limit)
	if err != nil {
		return nil, fmt.Errorf("gagal membaca antrean hapus media: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (q *SQLMediaPurgeQueue) Complete(ctx context.Context, mediaURL string) error {
	_, err := q.db.ExecContext(ctx, q.rebind(`DELETE FROM media_purge_queue WHERE media_url = ?`), mediaURL)
	return err
}

func (q *SQLMediaPurgeQueue) Fail(ctx context.Context, mediaURL string, maxAttempts int) (bool, error) {
	var attempts int
	if err := q.db.QueryRowContext(ctx, q.rebind(`SELECT attempts FROM media_purge_queue WHERE media_url = ?`), mediaURL).Scan(&attempts); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	attempts++
	if attempts >= maxAttempts {
		return true, q.Complete(ctx, mediaURL)
	}
	// Jeda eksponensial: 1, 2, 4, ... jam (maks 24 jam).
	delay := time.Hour << (attempts - 1)
	if delay > 24*time.Hour {
		delay = 24 * time.Hour
	}
	_, err := q.db.ExecContext(ctx, q.rebind(`UPDATE media_purge_queue SET attempts = ?, next_attempt_at = ? WHERE media_url = ?`),
		attempts, time.Now().UTC().Add(delay), mediaURL)
	return false, err
}
