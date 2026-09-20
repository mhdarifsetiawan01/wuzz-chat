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

func TestSubGroupTTLWorker_TriggerMemoryJob(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_ttl_trigger.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("Gagal inisialisasi store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), "sqlite")
	memStore := store.NewSQLMemoryStore(sqlStore.DB(), "sqlite")

	creator, err := userStore.Register("ttl_creator", "Creator", "Pass123!")
	if err != nil {
		t.Fatalf("Gagal register creator: %v", err)
	}
	parentGroup, err := userStore.CreateGroup("Main Group", "Desc", "", creator.ID, "main_grp", true, nil)
	if err != nil {
		t.Fatalf("Gagal membuat parent group: %v", err)
	}

	sub, err := userStore.CreateSubGroup(parentGroup.ID, "Forum Diskusi Arsitektur", "Desc", creator.ID, "7_days", true)
	if err != nil {
		t.Fatalf("Gagal membuat subgrup: %v", err)
	}

	// Set expires_at ke masa lalu
	past := time.Now().UTC().Add(-1 * time.Hour)
	_, err = sqlStore.DB().Exec(`UPDATE conversations SET expires_at = ? WHERE id = ?`, past, sub.ID)
	if err != nil {
		t.Fatalf("Gagal update expires_at: %v", err)
	}

	worker := NewSubGroupTTLWorker(userStore, 1*time.Minute)
	worker.SetMemoryStore(memStore)

	affected := worker.ExpireOnce()
	if affected != 1 {
		t.Fatalf("Ekspektasi 1 subgrup kedaluwarsa, dapat: %d", affected)
	}

	// Verifikasi ForumMemoryJob otomatis terbuat di memory_store
	job, err := memStore.GetJobByForumID(t.Context(), sub.ID)
	if err != nil {
		t.Fatalf("Ekspektasi job memory otomatis terbuat, error: %v", err)
	}
	if job.ForumID != sub.ID {
		t.Errorf("job.ForumID mismatch: expected %s, got %s", sub.ID, job.ForumID)
	}
	if job.GroupID != parentGroup.ID {
		t.Errorf("job.GroupID mismatch: expected %s, got %s", parentGroup.ID, job.GroupID)
	}
	if job.Status != store.JobStatusQueued {
		t.Errorf("job.Status mismatch: expected QUEUED, got %s", job.Status)
	}

	// Jalankan ExpireOnce kedua kalinya untuk memastikan idempotency (tidak error)
	affectedAgain := worker.ExpireOnce()
	if affectedAgain != 0 {
		t.Errorf("Ekspektasi 0 pada run kedua, dapat: %d", affectedAgain)
	}
}
