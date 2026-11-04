package orphanreport_test

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/orphanreport"
	"github.com/bms-del112/wuzz-chat/internal/storage"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

const base = "https://media.contoh.id/"

type fakeLister struct{ pages [][]storage.ObjectInfo }

func (f *fakeLister) ListObjects(_ context.Context, _ string, token string, _ int) (*storage.ListPage, error) {
	i := 0
	if token != "" {
		i = int(token[0] - '0')
	}
	p := &storage.ListPage{Objects: f.pages[i]}
	if i+1 < len(f.pages) {
		p.NextToken = string(rune('0' + i + 1))
	}
	return p, nil
}

func (f *fakeLister) KeyFromURL(u string) (string, bool) {
	if strings.HasPrefix(u, base) {
		return strings.TrimPrefix(u, base), true
	}
	return "", false
}

func TestAnalyze_ClassifiesObjects(t *testing.T) {
	ms, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "or.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer ms.Close()
	db := ms.DB()
	now := time.Now().UTC()
	ex := func(q string, a ...any) {
		t.Helper()
		if _, err := db.Exec(q, a...); err != nil {
			t.Fatalf("seed (%s): %v", q, err)
		}
	}
	ex(`INSERT INTO users (id, username, display_name, password_hash, avatar_url, created_at) VALUES ('u1','alice_or','A','x',?,?)`, base+"avatar.jpg", now)
	ex(`INSERT INTO conversations (id, type, title, created_by, avatar_url, created_at, updated_at) VALUES ('grp_1','group','G','u1',?,?,?)`, base+"gavatar.jpg", now, now)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m1','dm',?, 'A','b','',?, 'active',?)`, "u1", base+"msg.jpg", now)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m2','dm',?, 'A','b','',?, 'active',?)`, "u1", base+"video/vid.mp4", now)
	ex(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m3','dm',?, 'A','b','',?, 'active',?)`, "u1", "https://asing.id/z.jpg", now)
	ex(`INSERT INTO feed_posts (id, user_id, content, media_urls, created_at, updated_at) VALUES ('fp1','u1','p',?,?,?)`, `["`+base+`feed1.jpg","`+base+`feed2.jpg"]`, now, now)
	ex(`INSERT INTO media_purge_queue (media_url, attempts, next_attempt_at, created_at) VALUES (?,1,?,?)`, base+"queued.jpg", now, now)
	ex(`INSERT INTO upload_tickets (public_url, tenant_id, user_id, purpose, created_at) VALUES (?,?,?,?,?)`, base+"ticketed.jpg", "default", "u1", "feed", now)

	l := &fakeLister{}
	refs, err := orphanreport.LoadReferences(context.Background(), db, l, false)
	if err != nil {
		t.Fatal(err)
	}

	old := now.Add(-10 * 24 * time.Hour)
	l.pages = [][]storage.ObjectInfo{
		{
			{Key: "avatar.jpg", Size: 1, LastModified: old},
			{Key: "gavatar.jpg", Size: 1, LastModified: old},
			{Key: "msg.jpg", Size: 1, LastModified: old},
			{Key: "video/vid.mp4", Size: 100, LastModified: old},
			{Key: "video/vid.thumb.jpg", Size: 5, LastModified: old}, // thumbnail turunan video yang dipakai
			{Key: "feed1.jpg", Size: 1, LastModified: old},
			{Key: "feed2.jpg", Size: 1, LastModified: old},
			{Key: "queued.jpg", Size: 7, LastModified: old},
		},
		{
			{Key: "ticketed.jpg", Size: 3, LastModified: old},
			{Key: "baru.jpg", Size: 4, LastModified: now.Add(-time.Hour)},
			{Key: "yatim1.jpg", Size: 1000, LastModified: old},
			{Key: "video/yatim2.mp4", Size: 5000, LastModified: now.Add(-40 * 24 * time.Hour)},
			{Key: "tenantx/yatim3.jpg", Size: 10, LastModified: now.Add(-5 * 24 * time.Hour)},
		},
	}
	var cb []string
	rep, err := orphanreport.Analyze(context.Background(), l, refs, orphanreport.Options{
		Now: func() time.Time { return now }, Sample: 2,
		OnCandidate: func(c orphanreport.Candidate) { cb = append(cb, c.Key) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if rep.Scanned != 13 || rep.Used.Count != 7 || rep.Queued.Count != 1 || rep.Young.Count != 1 || rep.Ticketed.Count != 1 || rep.Orphan.Count != 3 {
		t.Fatalf("hitungan salah: %+v", rep)
	}
	if rep.Orphan.Bytes != 6010 || rep.OrphanByPrefix["video/"].Count != 1 || rep.OrphanByPrefix["tenantx/"].Count != 1 || rep.OrphanByPrefix["(root)"].Count != 1 {
		t.Fatalf("pengelompokan awalan salah: %+v", rep.OrphanByPrefix)
	}
	if rep.OrphanByAge[">30 hari"].Count != 1 || rep.OrphanByAge["3-7 hari"].Count != 1 || rep.OrphanByAge["7-30 hari"].Count != 1 {
		t.Fatalf("pengelompokan umur salah: %+v", rep.OrphanByAge)
	}
	if len(cb) != 3 {
		t.Fatalf("OnCandidate harus dipanggil untuk semua kandidat: %v", cb)
	}
	if len(rep.Samples) != 2 || rep.Samples[0].Key != "video/yatim2.mp4" {
		t.Fatalf("contoh harus 2 dan tertua dulu: %+v", rep.Samples)
	}

	var out bytes.Buffer
	rep.Write(&out, 72*time.Hour)
	for _, want := range []string{"hanya-baca", "KANDIDAT YATIM", "video/yatim2.mp4", ">30 hari"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("laporan tidak memuat %q:\n%s", want, out.String())
		}
	}
}

func TestAnalyze_TruncatesAtMaxObjects(t *testing.T) {
	l := &fakeLister{pages: [][]storage.ObjectInfo{{
		{Key: "a", Size: 1}, {Key: "b", Size: 1}, {Key: "c", Size: 1},
	}}}
	rep, err := orphanreport.Analyze(context.Background(), l, &orphanreport.Refs{
		Used: map[string]bool{}, Queued: map[string]bool{}, Ticketed: map[string]bool{},
	}, orphanreport.Options{MaxObjects: 2, Now: func() time.Time { return time.Now() }})
	if err != nil {
		t.Fatal(err)
	}
	if !rep.Truncated || rep.Scanned != 2 {
		t.Fatalf("want truncated di 2, got %+v", rep)
	}
}
