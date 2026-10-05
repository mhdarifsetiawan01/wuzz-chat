// Package pgtest menyediakan database PostgreSQL sementara untuk tes integrasi.
//
// Aktif hanya bila PG_TEST_ADMIN_DSN diisi (mis. postgres://postgres@127.0.0.1:54329/postgres?sslmode=disable);
// tanpa itu tes memakai SQLite seperti biasa. Setiap tes mendapat database baru yang dihapus saat selesai.
package pgtest

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// NewDSN membuat database baru dan mengembalikan DSN-nya. ok=false bila PostgreSQL uji tidak dikonfigurasi.
func NewDSN(t testing.TB) (dsn string, ok bool) {
	t.Helper()
	admin := strings.TrimSpace(os.Getenv("PG_TEST_ADMIN_DSN"))
	if admin == "" {
		return "", false
	}
	db, err := sql.Open("postgres", admin)
	if err != nil {
		t.Fatalf("pgtest: gagal membuka koneksi admin: %v", err)
	}
	name := "wz_" + strings.ReplaceAll(uuid.New().String(), "-", "")[:16]
	if _, err := db.Exec(`CREATE DATABASE ` + name); err != nil {
		_ = db.Close()
		t.Fatalf("pgtest: gagal membuat database uji: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(fmt.Sprintf(`DROP DATABASE IF EXISTS %s WITH (FORCE)`, name))
		_ = db.Close()
	})

	u, err := url.Parse(admin)
	if err != nil {
		t.Fatalf("pgtest: PG_TEST_ADMIN_DSN tidak valid: %v", err)
	}
	u.Path = "/" + name
	return u.String(), true
}

// ProductionShape menyamakan skema database uji dengan Postgres produksi. Di produksi users.metadata bertipe JSONB
// (ditambahkan lewat ALTER pada tabel lama), sedangkan CREATE TABLE untuk database baru membuatnya TEXT sehingga
// query `COALESCE(metadata, '{}'::jsonb)` gagal pada database yang dibuat dari nol (bug laten, di luar lingkup tes ini).
func ProductionShape(t testing.TB, db *sql.DB) {
	t.Helper()
	for _, q := range []string{
		`ALTER TABLE users ALTER COLUMN metadata DROP DEFAULT`,
		`ALTER TABLE users ALTER COLUMN metadata TYPE JSONB USING metadata::jsonb`,
		`ALTER TABLE users ALTER COLUMN metadata SET DEFAULT '{}'::jsonb`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("pgtest: gagal menyamakan skema (%s): %v", q, err)
		}
	}
}
