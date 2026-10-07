package store_test

import (
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestEraseUser_QueuesOrphanedMedia(t *testing.T) {
	ms := openMessageStore(t, "q.db")
	db := ms.DB()
	us := store.NewSQLUserStore(db, ms.DriverName())
	alice, _ := us.Register("alice_q", "Alice", "password123")
	bob, _ := us.Register("bob_q", "Bob", "password123")

	now := time.Now().UTC()
	ex := func(q string, a ...any) {
		t.Helper()
		if _, err := db.Exec(rebindPG(ms, q), a...); err != nil {
			t.Fatalf("seed (%s): %v", q, err)
		}
	}
	ex(`UPDATE users SET avatar_url = '/uploads/avatar_a.png' WHERE id = ?`, alice.ID)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m1','dm_x',?,'A','b','','/uploads/own.jpg','active',?)`, alice.ID, now)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m2','dm_x',?,'A','b','','/uploads/shared.jpg','active',?)`, alice.ID, now)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m3','dm_y',?,'B','a','','/uploads/shared.jpg','active',?)`, bob.ID, now)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m4','dm_x',?,'A','b','','/uploads/gone.jpg','expired',?)`, alice.ID, now)
	ex(`INSERT INTO feed_posts (id, user_id, content, media_urls, created_at, updated_at) VALUES ('fp1',?,'p','["/uploads/post1.jpg","/uploads/post2.jpg"]',?,?)`, alice.ID, now, now)

	if err := store.NewSQLAccountEraser(db, ms.DriverName()).EraseUser(t.Context(), alice.ID); err != nil {
		t.Fatalf("EraseUser: %v", err)
	}

	q := store.NewSQLMediaPurgeQueue(db, ms.DriverName())
	got, err := q.ClaimDue(t.Context(), 100)
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(got)
	want := []string{"/uploads/avatar_a.png", "/uploads/own.jpg", "/uploads/post1.jpg", "/uploads/post2.jpg"}
	if len(got) != len(want) {
		t.Fatalf("antrean: want %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("antrean: want %v, got %v", want, got)
		}
	}
}

func TestMediaPurgeQueue_RetryAndGiveUp(t *testing.T) {
	ms := openMessageStore(t, "q2.db")
	q := store.NewSQLMediaPurgeQueue(ms.DB(), ms.DriverName())
	now := time.Now().UTC()
	if _, err := ms.DB().Exec(rebindPG(ms, `INSERT INTO media_purge_queue (media_url, attempts, next_attempt_at, created_at) VALUES ('/uploads/x.jpg',0,?,?)`), now, now); err != nil {
		t.Fatal(err)
	}

	gaveUp, err := q.Fail(t.Context(), "/uploads/x.jpg", 3)
	if err != nil || gaveUp {
		t.Fatalf("percobaan 1: gaveUp=%v err=%v", gaveUp, err)
	}
	// Dijadwalkan ulang ke depan: belum jatuh tempo.
	if due, _ := q.ClaimDue(t.Context(), 10); len(due) != 0 {
		t.Fatalf("berkas gagal tidak boleh langsung jatuh tempo, got %v", due)
	}
	_, _ = ms.DB().Exec(rebindPG(ms, `UPDATE media_purge_queue SET next_attempt_at = ?`), now.Add(-time.Minute))
	if gaveUp, _ = q.Fail(t.Context(), "/uploads/x.jpg", 3); gaveUp {
		t.Fatal("percobaan 2 belum boleh menyerah")
	}
	if gaveUp, _ = q.Fail(t.Context(), "/uploads/x.jpg", 3); !gaveUp {
		t.Fatal("percobaan 3 harus menyerah")
	}
	var n int
	_ = ms.DB().QueryRow(`SELECT COUNT(1) FROM media_purge_queue`).Scan(&n)
	if n != 0 {
		t.Fatalf("berkas yang menyerah harus keluar dari antrean, sisa %d", n)
	}
}

// rebindPG mengubah placeholder ? menjadi $n bila store uji memakai PostgreSQL.
func rebindPG(ms *store.SQLMessageStore, q string) string {
	if ms.DriverName() != "postgres" {
		return q
	}
	var b strings.Builder
	n := 0
	for _, r := range q {
		if r == '?' {
			n++
			b.WriteString("$" + strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
