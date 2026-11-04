package store_test

import (
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestUploadOrphanSweeper(t *testing.T) {
	const own = "https://media.contoh.id/"
	owns := func(u string) bool { return strings.HasPrefix(u, own) }

	setup := func(t *testing.T, name string) (*store.SQLMessageStore, *store.UploadTicketStore, *store.MediaReleaser) {
		ms := openMessageStore(t, name)
		db := ms.DB()
		us := store.NewSQLUserStore(db, ms.DriverName())
		alice, _ := us.Register("alice_sw_"+name[:3], "Alice", "password123")
		now := time.Now().UTC()
		if _, err := db.Exec(rebindPG(ms, `INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, media_url, media_status, created_at) VALUES ('m1','dm_x',?,'A','b','',?, 'active',?)`), alice.ID, own+"used.jpg", now); err != nil {
			t.Fatal(err)
		}
		tk := store.NewUploadTicketStore(db, ms.DriverName())
		rel := store.NewMediaReleaser(db, ms.DriverName(), store.NewSQLMediaPurgeQueue(db, ms.DriverName()), owns)
		old := time.Now().UTC().Add(-100 * time.Hour)
		for _, u := range []string{own + "used.jpg", own + "orphan.jpg", "https://asing.id/x.jpg", own + "fresh.jpg"} {
			tk.Record(t.Context(), u, "default", alice.ID, "feed")
		}
		for _, u := range []string{own + "used.jpg", own + "orphan.jpg", "https://asing.id/x.jpg"} {
			if _, err := db.Exec(rebindPG(ms, `UPDATE upload_tickets SET created_at = ? WHERE public_url = ?`), old, u); err != nil {
				t.Fatal(err)
			}
		}
		return ms, tk, rel
	}
	list := func(t *testing.T, ms *store.SQLMessageStore, table, col string) string {
		t.Helper()
		rows, err := ms.DB().Query(`SELECT ` + col + ` FROM ` + table + ` ORDER BY ` + col)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out = append(out, strings.TrimPrefix(s, own))
		}
		return strings.Join(out, ",")
	}

	t.Run("true: antrekan yatim, buang tiket terpakai dan asing, sisakan yang baru", func(t *testing.T) {
		ms, tk, rel := setup(t, "sweep_on.db")
		store.NewUploadOrphanSweeper(tk, rel, "true", 72*time.Hour).Sweep(t.Context())
		if got := list(t, ms, "media_purge_queue", "media_url"); got != "orphan.jpg" {
			t.Fatalf("antrean: want orphan.jpg, got %q", got)
		}
		if got := list(t, ms, "upload_tickets", "public_url"); got != "fresh.jpg" {
			t.Fatalf("tiket tersisa: want fresh.jpg, got %q", got)
		}
	})

	t.Run("dry: tidak mengantrekan, tiket yatim dipertahankan", func(t *testing.T) {
		ms, tk, rel := setup(t, "sweep_dry.db")
		store.NewUploadOrphanSweeper(tk, rel, "dry", 72*time.Hour).Sweep(t.Context())
		if got := list(t, ms, "media_purge_queue", "media_url"); got != "" {
			t.Fatalf("dry tidak boleh mengantrekan: %q", got)
		}
		if got := list(t, ms, "upload_tickets", "public_url"); got != "fresh.jpg,orphan.jpg" {
			t.Fatalf("tiket tersisa: %q", got)
		}
	})

	t.Run("off dan nilai tak dikenal: tidak melakukan apa pun", func(t *testing.T) {
		for _, mode := range []string{"", "off", "ya-mungkin"} {
			ms, tk, rel := setup(t, "sweep_off.db")
			store.NewUploadOrphanSweeper(tk, rel, mode, 72*time.Hour).Sweep(t.Context())
			if got := list(t, ms, "media_purge_queue", "media_url"); got != "" {
				t.Fatalf("mode %q mengantrekan: %q", mode, got)
			}
			var n int
			if err := ms.DB().QueryRow(`SELECT COUNT(*) FROM upload_tickets`).Scan(&n); err != nil || n != 4 {
				t.Fatalf("mode %q membuang tiket: tersisa %d dari 4 (%v)", mode, n, err)
			}
		}
	})

	t.Run("umur minimum tidak bisa di bawah 24 jam", func(t *testing.T) {
		ms, tk, rel := setup(t, "sweep_min.db")
		// tiket 'fresh' baru dibuat: dengan minAge 1 jam (dipaksa 24 jam) tidak boleh tersapu
		store.NewUploadOrphanSweeper(tk, rel, "true", time.Hour).Sweep(t.Context())
		if got := list(t, ms, "upload_tickets", "public_url"); got != "fresh.jpg" {
			t.Fatalf("fresh harus tetap ada: %q", got)
		}
	})

	t.Run("Record idempoten dan tahan nil", func(t *testing.T) {
		ms, tk, _ := setup(t, "sweep_rec.db")
		tk.Record(t.Context(), own+"fresh.jpg", "default", "u", "feed")
		var n int
		if err := ms.DB().QueryRow(`SELECT COUNT(*) FROM upload_tickets`).Scan(&n); err != nil || n != 4 {
			t.Fatalf("want 4 tiket, got %d (%v)", n, err)
		}
		var nilStore *store.UploadTicketStore
		nilStore.Record(t.Context(), "x", "", "", "")
		(*store.UploadOrphanSweeper)(nil).Sweep(t.Context())
	})

}

func TestParseOrphanSweepMode(t *testing.T) {
	for in, want := range map[string]string{"": "off", "off": "off", "DRY": "dry", " dry-run ": "dry", "true": "true", "1": "true", "abc": "off"} {
		if got := store.ParseOrphanSweepMode(in); got != want {
			t.Errorf("ParseOrphanSweepMode(%q) = %q, want %q", in, got, want)
		}
	}
}
