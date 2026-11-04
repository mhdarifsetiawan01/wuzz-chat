package store_test

import (
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestMediaReleaser_QueuesOnlyOwnedAndUnreferenced(t *testing.T) {
	ms := openMessageStore(t, "rel.db")
	db := ms.DB()
	us := store.NewSQLUserStore(db, ms.DriverName())
	alice, _ := us.Register("alice_rel", "Alice", "password123")
	now := time.Now().UTC()
	ex := func(q string, a ...any) {
		t.Helper()
		if _, err := db.Exec(rebindPG(ms, q), a...); err != nil {
			t.Fatalf("seed (%s): %v", q, err)
		}
	}
	const own = "https://media.contoh.id/"
	ex(`UPDATE users SET avatar_url = ? WHERE id = ?`, own+"in_avatar.jpg", alice.ID)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m1','dm_x',?,'A','b','',?, 'active',?)`, alice.ID, own+"in_msg.jpg", now)
	ex(`INSERT INTO feed_posts (id, user_id, content, media_urls, created_at, updated_at) VALUES ('fp1',?,'p',?,?,?)`, alice.ID, `["`+own+`in_post.jpg"]`, now, now)
	// Karakter khusus LIKE pada nama berkas tidak boleh jadi wildcard: "a_b" tidak boleh cocok dengan "aXb".
	ex(`INSERT INTO feed_posts (id, user_id, content, media_urls, created_at, updated_at) VALUES ('fp2',?,'p',?,?,?)`, alice.ID, `["`+own+`aXb.jpg"]`, now, now)

	rel := store.NewMediaReleaser(db, ms.DriverName(), store.NewSQLMediaPurgeQueue(db, ms.DriverName()),
		func(u string) bool { return strings.HasPrefix(u, own) })

	rel.Release(t.Context(),
		own+"free.jpg",           // dimiliki, tidak dirujuk -> antre
		own+"free.jpg",           // duplikat -> sekali
		own+"in_avatar.jpg",      // masih foto profil -> tahan
		own+"in_msg.jpg",         // masih dipakai pesan -> tahan
		own+"in_post.jpg",        // masih dipakai postingan lain -> tahan
		own+"a_b.jpg",            // '_' bukan wildcard -> antre
		"https://asing.id/x.jpg", // bukan milik storage -> abaikan
		"",
	)

	got, err := store.NewSQLMediaPurgeQueue(db, ms.DriverName()).ClaimDue(t.Context(), 100)
	if err != nil {
		t.Fatal(err)
	}
	// Enqueue menjadwalkan percobaan 1 jam lagi, jadi ClaimDue (hanya yang jatuh tempo) kosong. Baca tabel langsung.
	_ = got
	rows, err := db.Query(`SELECT media_url FROM media_purge_queue`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var queued []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			t.Fatal(err)
		}
		queued = append(queued, u)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	sort.Strings(queued)
	want := []string{own + "a_b.jpg", own + "free.jpg"}
	if strings.Join(queued, ",") != strings.Join(want, ",") {
		t.Fatalf("antrean: want %v, got %v", want, queued)
	}
}

func TestMediaReleaser_NilSafe(t *testing.T) {
	var rel *store.MediaReleaser
	rel.Release(t.Context(), "https://x/y.jpg") // tidak boleh panik

	ms := openMessageStore(t, "rel2.db")
	store.NewMediaReleaser(ms.DB(), ms.DriverName(), nil, nil).Release(t.Context(), "https://x/y.jpg")
}
