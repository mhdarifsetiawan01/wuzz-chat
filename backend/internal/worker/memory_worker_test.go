package worker

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type mockMemoryProcessor struct {
	processFunc func(ctx context.Context, job *store.ForumMemoryJob, messageCount int) error
}

func (m *mockMemoryProcessor) ProcessMemoryJob(ctx context.Context, job *store.ForumMemoryJob, messageCount int) error {
	if m.processFunc != nil {
		return m.processFunc(ctx, job, messageCount)
	}
	return nil
}

func setupTestMemoryWorkerEnv(t *testing.T) (*store.SQLMessageStore, store.MemoryStore, func()) {
	tmpDB := filepath.Join(t.TempDir(), "test_mem_worker.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("Gagal inisialisasi sqlStore: %v", err)
	}
	memStore := store.NewSQLMemoryStore(sqlStore.DB(), "sqlite")
	return sqlStore, memStore, func() {
		sqlStore.Close()
	}
}

func TestMemoryJobWorker_BaselineProcessing(t *testing.T) {
	msgStore, memStore, cleanup := setupTestMemoryWorkerEnv(t)
	defer cleanup()
	ctx := context.Background()

	forumID := "sub_" + uuid.New().String()
	groupID := "grp_" + uuid.New().String()

	// Simpan 3 pesan ke forum
	for i := 1; i <= 3; i++ {
		_ = msgStore.Save(store.StoredMessage{
			ID:        uuid.New().String(),
			RoomID:    forumID,
			FromID:    "usr_alice",
			Nickname:  "Alice",
			ToID:      forumID,
			Content:   "Pesan diskusi penting",
			Timestamp: time.Now().UTC(),
		})
	}

	// Buat job di memoryStore
	job, err := memStore.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	worker := NewMemoryJobWorker(memStore, msgStore, 1*time.Minute)

	// Jalankan ProcessOnce
	processed := worker.ProcessOnce()
	if processed != 1 {
		t.Fatalf("Ekspektasi 1 job terproses, dapat: %d", processed)
	}

	// Cek status job di database
	completedJob, err := memStore.GetJobByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetJobByID gagal: %v", err)
	}
	if completedJob.Status != store.JobStatusCompleted {
		t.Errorf("Ekspektasi status COMPLETED, dapat: %s", completedJob.Status)
	}
	if completedJob.MessageCount != 3 {
		t.Errorf("Ekspektasi message count 3, dapat: %d", completedJob.MessageCount)
	}
}

func TestMemoryJobWorker_CustomProcessorSuccess(t *testing.T) {
	msgStore, memStore, cleanup := setupTestMemoryWorkerEnv(t)
	defer cleanup()
	ctx := context.Background()

	forumID := "sub_" + uuid.New().String()
	groupID := "grp_" + uuid.New().String()

	job, err := memStore.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	processorCalled := false
	processor := &mockMemoryProcessor{
		processFunc: func(ctx context.Context, j *store.ForumMemoryJob, messageCount int) error {
			processorCalled = true
			return memStore.CompleteJob(ctx, j.ID, messageCount)
		},
	}

	worker := NewMemoryJobWorker(memStore, msgStore, 1*time.Minute)
	worker.SetProcessor(processor)

	processed := worker.ProcessOnce()
	if processed != 1 {
		t.Fatalf("Ekspektasi 1 job terproses, dapat: %d", processed)
	}
	if !processorCalled {
		t.Errorf("Ekspektasi processor dipanggil")
	}

	completedJob, _ := memStore.GetJobByID(ctx, job.ID)
	if completedJob.Status != store.JobStatusCompleted {
		t.Errorf("Ekspektasi status COMPLETED, dapat: %s", completedJob.Status)
	}
}

func TestMemoryJobWorker_RetryScheduling(t *testing.T) {
	msgStore, memStore, cleanup := setupTestMemoryWorkerEnv(t)
	defer cleanup()
	ctx := context.Background()

	forumID := "sub_" + uuid.New().String()
	groupID := "grp_" + uuid.New().String()

	job, err := memStore.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	processor := &mockMemoryProcessor{
		processFunc: func(ctx context.Context, j *store.ForumMemoryJob, messageCount int) error {
			return errors.New("simulasi AI rate limit 429")
		},
	}

	worker := NewMemoryJobWorker(memStore, msgStore, 1*time.Minute)
	worker.SetProcessor(processor)

	processed := worker.ProcessOnce()
	if processed != 1 {
		t.Fatalf("Ekspektasi 1 job terproses, dapat: %d", processed)
	}

	// Job gagal pertama kali (Attempt 1 < Max 3) -> harus kembali QUEUED dengan next_retry_at dijadwalkan
	retriedJob, err := memStore.GetJobByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetJobByID gagal: %v", err)
	}
	if retriedJob.Status != store.JobStatusQueued {
		t.Errorf("Ekspektasi status kembali ke QUEUED, dapat: %s", retriedJob.Status)
	}
	if retriedJob.AttemptCount != 1 {
		t.Errorf("Ekspektasi AttemptCount 1, dapat: %d", retriedJob.AttemptCount)
	}
	if retriedJob.LastError != "simulasi AI rate limit 429" {
		t.Errorf("Ekspektasi error tersimpan, dapat: %s", retriedJob.LastError)
	}
	if retriedJob.NextRetryAt == nil {
		t.Errorf("Ekspektasi NextRetryAt terjadwal")
	}
}

func TestMemoryJobWorker_TerminalFailure(t *testing.T) {
	msgStore, memStore, cleanup := setupTestMemoryWorkerEnv(t)
	defer cleanup()
	ctx := context.Background()

	forumID := "sub_" + uuid.New().String()
	groupID := "grp_" + uuid.New().String()

	job, err := memStore.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	// Set attempt_count ke 2 (sehingga klaim berikutnya menjadi attempt 3 = max_attempts)
	_, err = msgStore.DB().Exec(`UPDATE forum_memory_jobs SET attempt_count = 2 WHERE id = ?`, job.ID)
	if err != nil {
		t.Fatalf("Gagal set attempt_count: %v", err)
	}

	processor := &mockMemoryProcessor{
		processFunc: func(ctx context.Context, j *store.ForumMemoryJob, messageCount int) error {
			return errors.New("invalid JSON output from model")
		},
	}

	worker := NewMemoryJobWorker(memStore, msgStore, 1*time.Minute)
	worker.SetProcessor(processor)

	processed := worker.ProcessOnce()
	if processed != 1 {
		t.Fatalf("Ekspektasi 1 job terproses, dapat: %d", processed)
	}

	terminalJob, err := memStore.GetJobByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetJobByID gagal: %v", err)
	}
	if terminalJob.Status != store.JobStatusFailed {
		t.Errorf("Ekspektasi status FAILED, dapat: %s", terminalJob.Status)
	}
	if !terminalJob.IsTerminalFail {
		t.Errorf("Ekspektasi IsTerminalFail = true")
	}
}

func TestMemoryJobWorker_StartStop(t *testing.T) {
	msgStore, memStore, cleanup := setupTestMemoryWorkerEnv(t)
	defer cleanup()

	worker := NewMemoryJobWorker(memStore, msgStore, 100*time.Millisecond)
	worker.Start()
	time.Sleep(50 * time.Millisecond)
	worker.Stop()
}
