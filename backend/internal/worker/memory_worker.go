package worker

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// MemoryJobProcessor mendefinisikan interface pemrosesan AI untuk memproses konten forum menjadi memori terstruktur.
// Interface ini akan diinjeksi oleh modul AI Service pada Milestone 3.
type MemoryJobProcessor interface {
	ProcessMemoryJob(ctx context.Context, job *store.ForumMemoryJob, messageCount int) error
}

// MemoryJobWorker memantau antrean forum_memory_jobs (status: QUEUED) dan mengeksekusi pemrosesan secara atomik.
type MemoryJobWorker struct {
	memoryStore  store.MemoryStore
	messageStore store.MessageStore
	processor    MemoryJobProcessor
	interval     time.Duration
	batchSize    int
	stopCh       chan struct{}
	wg           sync.WaitGroup
}

// NewMemoryJobWorker membuat instance baru MemoryJobWorker.
func NewMemoryJobWorker(ms store.MemoryStore, msgStore store.MessageStore, interval time.Duration) *MemoryJobWorker {
	if interval <= 0 {
		interval = 15 * time.Second
	}
	return &MemoryJobWorker{
		memoryStore:  ms,
		messageStore: msgStore,
		interval:     interval,
		batchSize:    5,
		stopCh:       make(chan struct{}),
	}
}

// SetProcessor menginjeksi engine pemrosesan AI (M3).
func (w *MemoryJobWorker) SetProcessor(p MemoryJobProcessor) {
	w.processor = p
}

// Start menjalankan goroutine daemon background untuk polling antrean job.
func (w *MemoryJobWorker) Start() {
	log.Printf("⏳ [MemoryJobWorker] Group Memory AI Job Worker aktif (Interval: %v, Batch: %d)", w.interval, w.batchSize)

	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		w.ProcessOnce()

		ticker := time.NewTicker(w.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				w.ProcessOnce()
			case <-w.stopCh:
				log.Println("🛑 [MemoryJobWorker] Worker dihentikan.")
				return
			}
		}
	}()
}

// Stop menghentikan background worker secara aman.
func (w *MemoryJobWorker) Stop() {
	close(w.stopCh)
	w.wg.Wait()
}

// ProcessOnce mengeksekusi satu iterasi pengambilan dan pemrosesan job dari antrean.
func (w *MemoryJobWorker) ProcessOnce() int {
	if w.memoryStore == nil {
		return 0
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	pendingJobs, err := w.memoryStore.GetPendingJobs(ctx, w.batchSize)
	if err != nil {
		log.Printf("⚠️ [MemoryJobWorker] Gagal mengambil pending memory jobs: %v", err)
		return 0
	}
	if len(pendingJobs) == 0 {
		return 0
	}

	processedCount := 0
	for i := range pendingJobs {
		pj := pendingJobs[i]

		// Claim job secara atomik (status QUEUED -> PROCESSING)
		job, err := w.memoryStore.ClaimJob(ctx, pj.ID)
		if err != nil {
			// Job mungkin sudah diambil oleh worker instance lain (multi-node cluster)
			continue
		}

		processedCount++
		w.processSingleJob(ctx, job)
	}

	return processedCount
}

// processSingleJob mengeksekusi pipeline pekerjaan untuk satu ForumMemoryJob.
func (w *MemoryJobWorker) processSingleJob(ctx context.Context, job *store.ForumMemoryJob) {
	log.Printf("🔄 [MemoryJobWorker] Memproses job %s untuk forum %s (Percobaan %d/%d)...",
		job.ID, job.ForumID, job.AttemptCount, job.MaxAttempts)

	// 1. Ambil jumlah pesan percakapan di forum
	messageCount := 0
	if w.messageStore != nil {
		history, err := w.messageStore.GetRoomHistory(job.ForumID, 1000)
		if err == nil {
			messageCount = len(history)
		}
	}

	// 2. Eksekusi prosesor AI jika tersedia
	if w.processor != nil {
		err := w.processor.ProcessMemoryJob(ctx, job, messageCount)
		if err != nil {
			w.handleJobFailure(ctx, job, err)
			return
		}
	} else {
		// M2 Baseline (sebelum M3 AI processor dihubungkan):
		// Menandai job selesai dengan mencatat messageCount
		log.Printf("ℹ️ [MemoryJobWorker] M2 Baseline (No AI Processor): Menyelesaikan job %s dengan %d pesan", job.ID, messageCount)
		if err := w.memoryStore.CompleteJob(ctx, job.ID, messageCount); err != nil {
			log.Printf("⚠️ [MemoryJobWorker] Gagal menyelesaikan baseline job %s: %v", job.ID, err)
			return
		}
	}

	log.Printf("✅ [MemoryJobWorker] Sukses memproses memory job %s untuk forum %s", job.ID, job.ForumID)
}

// handleJobFailure mengelola retry scheduler dan status terminal kegagalan job.
func (w *MemoryJobWorker) handleJobFailure(ctx context.Context, job *store.ForumMemoryJob, err error) {
	log.Printf("❌ [MemoryJobWorker] Job %s gagal: %v", job.ID, err)

	isTerminal := job.AttemptCount >= job.MaxAttempts
	var nextRetry *time.Time

	if !isTerminal {
		var delay time.Duration
		switch job.AttemptCount {
		case 1:
			delay = 30 * time.Second
		case 2:
			delay = 2 * time.Minute
		default:
			delay = 8 * time.Minute
		}
		t := time.Now().UTC().Add(delay)
		nextRetry = &t
		log.Printf("🔁 [MemoryJobWorker] Menjadwalkan retry job %s pada %v", job.ID, t)
	} else {
		log.Printf("🚫 [MemoryJobWorker] Job %s mencapai batas maksimal percobaan (%d), ditandai terminal fail",
			job.ID, job.MaxAttempts)
	}

	if failErr := w.memoryStore.FailJob(ctx, job.ID, err.Error(), isTerminal, nextRetry); failErr != nil {
		log.Printf("⚠️ [MemoryJobWorker] Gagal update fail state job %s: %v", job.ID, failErr)
	}
}
