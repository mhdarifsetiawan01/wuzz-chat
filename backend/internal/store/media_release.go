package store

import (
	"context"
	"database/sql"
	"log"
	"strconv"
	"strings"
)

// MediaReleaser memasukkan berkas media ke media_purge_queue ketika rujukan terakhirnya dilepas
// (postingan Feed dihapus, foto profil diganti). Pembersihan fisiknya dikerjakan PurgeWorker.
//
// Aturan keselamatan (penghapusan berkas tidak bisa dibatalkan):
//   - Hanya URL milik storage kita (owns) yang diantrekan. Foto profil bisa diisi URL apa saja oleh klien, jadi tanpa
//     filter ini URL asing bisa memicu penghapusan.
//   - Berkas yang masih dirujuk tempat lain (pesan, foto profil, avatar grup, postingan Feed lain) TIDAK diantrekan.
//     Pemeriksaan ini sekaligus pagar terhadap klien yang sengaja menunjuk berkas milik orang lain.
//   - Semua kegagalan hanya dicatat di log (best-effort): menghapus postingan atau mengganti avatar tidak boleh gagal
//     karena pembersihan.
type MediaReleaser struct {
	db         *sql.DB
	driverName string
	queue      MediaPurgeQueue
	owns       func(url string) bool
}

// NewMediaReleaser membuat releaser. owns nil atau queue nil berarti Release tidak melakukan apa-apa.
func NewMediaReleaser(db *sql.DB, driverName string, queue MediaPurgeQueue, owns func(url string) bool) *MediaReleaser {
	return &MediaReleaser{db: db, driverName: driverName, queue: queue, owns: owns}
}

func (r *MediaReleaser) rebind(query string) string {
	if r.driverName != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, c := range query {
		if c == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(c)
	}
	return b.String()
}

// likeEscape menetralkan karakter khusus LIKE agar URL dicocokkan apa adanya.
func likeEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	return strings.ReplaceAll(s, `_`, `\_`)
}

// stillReferenced melaporkan apakah url masih dipakai di tabel mana pun yang menyimpan URL media.
// Kecocokan substring pada feed_posts.media_urls bersifat konservatif: salah-positif hanya membuat berkas dipertahankan.
func (r *MediaReleaser) stillReferenced(ctx context.Context, url string) (bool, error) {
	const q = `SELECT 1 WHERE EXISTS (SELECT 1 FROM messages WHERE media_url = ?)
		OR EXISTS (SELECT 1 FROM users WHERE avatar_url = ?)
		OR EXISTS (SELECT 1 FROM conversations WHERE avatar_url = ?)
		OR EXISTS (SELECT 1 FROM feed_posts WHERE media_urls LIKE ? ESCAPE '\')`
	var one int
	err := r.db.QueryRowContext(ctx, r.rebind(q), url, url, url, "%"+likeEscape(url)+"%").Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// Release mengantrekan URL yang tidak lagi dirujuk. Panggil SETELAH baris yang merujuknya dihapus/diubah.
func (r *MediaReleaser) Release(ctx context.Context, urls ...string) {
	if r == nil || r.db == nil || r.queue == nil || r.owns == nil {
		return
	}
	seen := make(map[string]bool, len(urls))
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		if !r.owns(u) {
			continue
		}
		used, err := r.stillReferenced(ctx, u)
		if err != nil {
			log.Printf("⚠️ [MediaRelease] Gagal memeriksa rujukan %s, berkas dipertahankan: %v", u, err)
			continue
		}
		if used {
			continue
		}
		if err := r.queue.Enqueue(ctx, u); err != nil {
			log.Printf("⚠️ [MediaRelease] Gagal mengantrekan %s: %v", u, err)
			continue
		}
		log.Printf("🧹 [MediaRelease] Berkas diantrekan untuk dihapus: %s", u)
	}
}
