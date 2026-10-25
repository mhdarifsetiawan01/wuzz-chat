package game_test

import (
	"context"
	"path/filepath"
	"testing"

	gameinfra "github.com/bms-del112/wuzz-chat/internal/game/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/testutil/pgtest"
)

// Produksi sudah punya tabel game_settings (dibuat 25 Okt 2026) tanpa kolom hide_from_social. Auto-migrasi harus
// menambahkannya pada tabel yang sudah ada, bukan hanya pada database baru.
func TestMigration_AddsHideFromSocialToExistingGameSettings(t *testing.T) {
	driver, target := "sqlite", filepath.Join(t.TempDir(), "mig.db")
	if dsn, ok := pgtest.NewDSN(t); ok {
		driver, target = "postgres", dsn
	}

	first, err := store.NewSQLMessageStore(driver, target)
	if err != nil {
		t.Fatal(err)
	}
	// Meniru skema lama: tabel ada, kolom belum ada, dan sudah berisi satu baris pengguna.
	if _, err := first.DB().Exec(`ALTER TABLE game_settings DROP COLUMN hide_from_social`); err != nil {
		first.Close()
		t.Skipf("driver tidak mendukung DROP COLUMN: %v", err)
	}
	ins := `INSERT INTO game_settings (tenant_id, user_id, leaderboard_public, reminder_enabled, tz) VALUES ('default', 'old_user', ?, ?, 'Asia/Jakarta')`
	if driver == "postgres" {
		ins = `INSERT INTO game_settings (tenant_id, user_id, leaderboard_public, reminder_enabled, tz) VALUES ('default', 'old_user', $1, $2, 'Asia/Jakarta')`
	}
	if _, err := first.DB().Exec(ins, true, false); err != nil {
		t.Fatal(err)
	}
	first.Close()

	// Server dinyalakan ulang dengan kode baru.
	second, err := store.NewSQLMessageStore(driver, target)
	if err != nil {
		t.Fatalf("buka ulang setelah migrasi: %v", err)
	}
	t.Cleanup(func() { second.Close() })

	repo := gameinfra.NewSQLRepository(second.DB(), second.DriverName())
	got, err := repo.GetSettings(context.Background(), "default", "old_user")
	if err != nil || got == nil {
		t.Fatalf("baca pengaturan lama: %+v %v", got, err)
	}
	if got.HideFromSocial {
		t.Error("pengguna lama harus default tampil (hide_from_social = false)")
	}
	if !got.LeaderboardPublic {
		t.Error("pilihan lama (papan publik) tidak boleh hilang saat migrasi")
	}
	got.HideFromSocial = true
	if err := repo.SaveSettings(context.Background(), got); err != nil {
		t.Fatalf("simpan setelah migrasi: %v", err)
	}
	if again, _ := repo.GetSettings(context.Background(), "default", "old_user"); again == nil || !again.HideFromSocial {
		t.Errorf("nilai baru tidak tersimpan: %+v", again)
	}
}
