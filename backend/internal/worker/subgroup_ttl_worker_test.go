package worker

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	_ "modernc.org/sqlite"
)

func TestSubGroupTTLWorker_ExpireOnce(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_worker.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("Gagal inisialisasi store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), "sqlite")

	// Register user & create parent group
	creator, err := userStore.Register("worker_creator", "Creator", "Pass123!")
	if err != nil {
		t.Fatalf("Gagal register creator: %v", err)
	}
	parentGroup, err := userStore.CreateGroup("Parent Group", "Desc", "", creator.ID, "parent_grp", true, nil)
	if err != nil {
		t.Fatalf("Gagal membuat parent group: %v", err)
	}

	// Create subgrup
	sub, err := userStore.CreateSubGroup(parentGroup.ID, "Topik Kadaluwarsa", "Desc", creator.ID, "7_days", true)
	if err != nil {
		t.Fatalf("Gagal membuat subgrup: %v", err)
	}

	// Buat worker
	worker := NewSubGroupTTLWorker(userStore, 1*time.Minute)

	// Belum ada yang expired
	if count := worker.ExpireOnce(); count != 0 {
		t.Errorf("Ekspektasi 0 expired, dapat: %d", count)
	}

	// Set expires_at ke masa lalu
	past := time.Now().UTC().Add(-2 * time.Hour)
	_, err = sqlStore.DB().Exec(`UPDATE conversations SET expires_at = ? WHERE id = ?`, past, sub.ID)
	if err != nil {
		t.Fatalf("Gagal update expires_at: %v", err)
	}

	// Jalankan ExpireOnce
	if count := worker.ExpireOnce(); count != 1 {
		t.Errorf("Ekspektasi 1 expired, dapat: %d", count)
	}

	// Verifikasi worker start & stop
	worker.Start()
	time.Sleep(50 * time.Millisecond)
	worker.Stop()
}
