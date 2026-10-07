package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// AccountEraser menghapus akun beserta data pribadinya (kebutuhan kebijakan Google Play & privasi).
type AccountEraser interface {
	// EraseUser menghapus data pribadi user dalam satu transaksi dan menganonimkan barisnya di tabel users.
	// Baris users sengaja dipertahankan (tombstone) agar referensi dari data milik orang lain tidak rusak.
	// Berkas media milik user (lampiran pesan, media postingan, foto profil) yang kini tak dirujuk baris mana pun
	// dimasukkan ke media_purge_queue dalam transaksi yang sama; PurgeWorker menghapus berkas fisiknya.
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

	// Kandidat berkas media milik user, dikumpulkan SEBELUM barisnya dihapus (PurgeWorker mencari berkas lewat
	// tabel messages, jadi berkas yang barisnya sudah hilang tidak akan pernah dibersihkan).
	candidates := map[string]struct{}{}
	addCandidate := func(u string) {
		if u = strings.TrimSpace(u); u != "" && !strings.HasPrefix(u, "data:") {
			candidates[u] = struct{}{}
		}
	}
	collect := func(query string, args ...any) error {
		rs, err := tx.QueryContext(ctx, s.rebind(query), args...)
		if err != nil {
			return fmt.Errorf("gagal membaca media user: %w", err)
		}
		defer rs.Close()
		for rs.Next() {
			var v string
			if err := rs.Scan(&v); err != nil {
				return err
			}
			addCandidate(v)
		}
		return rs.Err()
	}
	if err := collect(`SELECT COALESCE(media_url, '') FROM messages WHERE from_id = ? AND COALESCE(media_url, '') <> '' AND COALESCE(media_status, 'active') <> 'expired'`, userID); err != nil {
		return err
	}
	if err := collect(`SELECT COALESCE(avatar_url, '') FROM users WHERE id = ?`, userID); err != nil {
		return err
	}
	var postMedia []string
	if err := collect(`SELECT COALESCE(media_urls, '') FROM feed_posts WHERE user_id = ?`, userID); err != nil {
		return err
	}
	// media_urls berupa array JSON; baris mentah tadi masuk sebagai kandidat, uraikan dan gantikan.
	for u := range candidates {
		if strings.HasPrefix(u, "[") {
			delete(candidates, u)
			var arr []string
			if json.Unmarshal([]byte(u), &arr) == nil {
				postMedia = append(postMedia, arr...)
			}
		}
	}
	for _, u := range postMedia {
		addCandidate(u)
	}

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
			if err := collect(`SELECT COALESCE(media_url, '') FROM messages WHERE room_id = ? AND COALESCE(media_url, '') <> '' AND COALESCE(media_status, 'active') <> 'expired'`, convID); err != nil {
				return err
			}
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

	// Masukkan semua kandidat (INSERT per kelompok agar hemat round-trip), lalu keluarkan kembali yang masih dirujuk
	// baris lain (mis. pesan teruskan milik orang lain, foto profil dipakai ulang) dengan satu DELETE set-based per
	// tabel. Jangan diganti pemeriksaan per berkas: itu memindai tabel besar berkali-kali (3 menit untuk 5.000 berkas).
	// Media postingan feed tidak dicek karena tiap postingan mengunggah berkasnya sendiri, bukan memakai ulang.
	urls := make([]string, 0, len(candidates))
	for u := range candidates {
		urls = append(urls, u)
	}
	const insertChunk = 200
	for i := 0; i < len(urls); i += insertChunk {
		end := i + insertChunk
		if end > len(urls) {
			end = len(urls)
		}
		var sb strings.Builder
		args := make([]any, 0, (end-i)*3)
		sb.WriteString(`INSERT INTO media_purge_queue (media_url, attempts, next_attempt_at, created_at) VALUES `)
		for j, u := range urls[i:end] {
			if j > 0 {
				sb.WriteByte(',')
			}
			sb.WriteString(`(?, 0, ?, ?)`)
			args = append(args, u, now, now)
		}
		sb.WriteString(` ON CONFLICT(media_url) DO NOTHING`)
		if err := exec(sb.String(), args...); err != nil {
			return err
		}
	}
	if len(urls) > 0 {
		if err := exec(`DELETE FROM media_purge_queue WHERE media_url IN (SELECT media_url FROM messages WHERE media_url IS NOT NULL AND media_url <> '')`); err != nil {
			return err
		}
		if err := exec(`DELETE FROM media_purge_queue WHERE media_url IN (SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url <> '')`); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("gagal commit hapus akun: %w", err)
	}
	return nil
}
