package store

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// AccountEraser menghapus akun beserta data pribadinya (kebutuhan kebijakan Google Play & privasi).
type AccountEraser interface {
	// EraseUser menghapus data pribadi user dalam satu transaksi dan menganonimkan barisnya di tabel users.
	// Baris users sengaja dipertahankan (tombstone) agar referensi dari data milik orang lain tidak rusak.
	EraseUser(ctx context.Context, userID string) error
}

// SQLAccountEraser adalah implementasi AccountEraser berbasis SQL (SQLite & PostgreSQL).
type SQLAccountEraser struct {
	db         *sql.DB
	driverName string
}

// NewSQLAccountEraser membuat instance baru SQLAccountEraser.
func NewSQLAccountEraser(db *sql.DB, driverName string) *SQLAccountEraser {
	return &SQLAccountEraser{db: db, driverName: driverName}
}

// rebind mengubah placeholder `?` menjadi `$n` untuk PostgreSQL.
func (s *SQLAccountEraser) rebind(query string) string {
	if s.driverName != "postgres" {
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

// EraseUser menjalankan seluruh penghapusan secara atomik. Jika satu langkah gagal, tidak ada yang berubah.
func (s *SQLAccountEraser) EraseUser(ctx context.Context, userID string) error {
	if strings.TrimSpace(userID) == "" {
		return ErrUserNotFound
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal memulai transaksi hapus akun: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	exec := func(query string, args ...any) error {
		if _, err := tx.ExecContext(ctx, s.rebind(query), args...); err != nil {
			f := strings.Fields(query)
			if len(f) > 4 {
				f = f[:4]
			}
			return fmt.Errorf("hapus akun gagal (%s): %w", strings.Join(f, " "), err)
		}
		return nil
	}

	var exists int
	if err := tx.QueryRowContext(ctx, s.rebind(`SELECT COUNT(1) FROM users WHERE id = ?`), userID).Scan(&exists); err != nil {
		return fmt.Errorf("gagal memeriksa user: %w", err)
	}
	if exists == 0 {
		return ErrUserNotFound
	}

	now := time.Now().UTC()

	// 1. Serah-terima peran creator grup ke anggota lain (admin dulu, lalu anggota tertua).
	rows, err := tx.QueryContext(ctx, s.rebind(`SELECT conversation_id FROM conversation_members WHERE user_id = ? AND role = 'creator'`), userID)
	if err != nil {
		return fmt.Errorf("gagal membaca grup milik user: %w", err)
	}
	var ownedConvs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return err
		}
		ownedConvs = append(ownedConvs, id)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return fmt.Errorf("gagal membaca grup milik user: %w", err)
	}
	_ = rows.Close()

	for _, convID := range ownedConvs {
		var heir string
		err := tx.QueryRowContext(ctx, s.rebind(`SELECT user_id FROM conversation_members
			WHERE conversation_id = ? AND user_id <> ?
			ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at ASC LIMIT 1`), convID, userID).Scan(&heir)
		switch {
		case err == sql.ErrNoRows:
			// Tidak ada anggota tersisa: hapus percakapan beserta isinya.
			if err := exec(`DELETE FROM messages WHERE room_id = ?`, convID); err != nil {
				return err
			}
			if err := exec(`DELETE FROM pinned_messages WHERE conversation_id = ?`, convID); err != nil {
				return err
			}
			if err := exec(`DELETE FROM conversation_join_requests WHERE conversation_id = ?`, convID); err != nil {
				return err
			}
			if err := exec(`DELETE FROM conversation_members WHERE conversation_id = ?`, convID); err != nil {
				return err
			}
			if err := exec(`DELETE FROM conversations WHERE id = ?`, convID); err != nil {
				return err
			}
		case err != nil:
			return fmt.Errorf("gagal mencari pewaris grup: %w", err)
		default:
			if err := exec(`UPDATE conversation_members SET role = 'creator' WHERE conversation_id = ? AND user_id = ?`, convID, heir); err != nil {
				return err
			}
			if err := exec(`UPDATE conversations SET created_by = ?, updated_at = ? WHERE id = ?`, heir, now, convID); err != nil {
				return err
			}
		}
	}

	// 2. Pesan yang ditulis user (DM dan grup) beserta pin-nya.
	if err := exec(`DELETE FROM pinned_messages WHERE pinned_by = ? OR message_id IN (SELECT id FROM messages WHERE from_id = ?)`, userID, userID); err != nil {
		return err
	}
	if err := exec(`DELETE FROM messages WHERE from_id = ?`, userID); err != nil {
		return err
	}

	// 3. Keanggotaan, permintaan bergabung, dan relasi pertemanan.
	if err := exec(`DELETE FROM conversation_members WHERE user_id = ?`, userID); err != nil {
		return err
	}
	if err := exec(`DELETE FROM conversation_join_requests WHERE user_id = ?`, userID); err != nil {
		return err
	}
	if err := exec(`DELETE FROM user_connections WHERE requester_id = ? OR receiver_id = ?`, userID, userID); err != nil {
		return err
	}

	// 4. Feed komunitas: konten milik user, serta suka/komentar orang lain pada postingannya.
	if err := exec(`DELETE FROM feed_likes WHERE user_id = ? OR post_id IN (SELECT id FROM feed_posts WHERE user_id = ?)`, userID, userID); err != nil {
		return err
	}
	if err := exec(`DELETE FROM feed_comments WHERE user_id = ? OR post_id IN (SELECT id FROM feed_posts WHERE user_id = ?)`, userID, userID); err != nil {
		return err
	}
	if err := exec(`DELETE FROM feed_posts WHERE user_id = ?`, userID); err != nil {
		return err
	}
	// Sinkronkan ulang penghitung pada postingan orang lain.
	if err := exec(`UPDATE feed_posts SET
		likes_count = (SELECT COUNT(1) FROM feed_likes l WHERE l.post_id = feed_posts.id),
		comments_count = (SELECT COUNT(1) FROM feed_comments c WHERE c.post_id = feed_posts.id)`); err != nil {
		return err
	}

	// 5. Kredensial, sesi, perangkat, push token, dan token transfer/pertukaran.
	for _, q := range []string{
		`DELETE FROM user_credentials WHERE user_id = ?`,
		`DELETE FROM sessions WHERE user_id = ?`,
		`DELETE FROM devices WHERE user_id = ?`,
		`DELETE FROM push_subscriptions WHERE user_id = ?`,
		`DELETE FROM device_transfer_sessions WHERE user_id = ?`,
		`DELETE FROM exchange_tokens WHERE user_id = ?`,
	} {
		if err := exec(q, userID); err != nil {
			return err
		}
	}

	// 6. Cabut seluruh token yang sudah terbit (JWT lama langsung ditolak).
	upsert := `INSERT INTO user_token_revocations (user_id, revoked_before) VALUES (?, ?)
		ON CONFLICT(user_id) DO UPDATE SET revoked_before = excluded.revoked_before`
	if err := exec(upsert, userID, now); err != nil {
		return err
	}

	// 7. Anonimkan baris users (tombstone). Username asli dibebaskan.
	tombstone := "deleted_" + strings.ReplaceAll(userID, "-", "")
	if len(tombstone) > 60 {
		tombstone = tombstone[:60]
	}
	if err := exec(`UPDATE users SET
		username = ?, display_name = 'Akun Terhapus', password_hash = '', status_message = '', bio = '',
		avatar_url = '', metadata = '{}', public_key = '', active_device_id = '', external_user_id = '',
		is_private_account = TRUE
		WHERE id = ?`, tombstone, userID); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("gagal commit hapus akun: %w", err)
	}
	return nil
}
