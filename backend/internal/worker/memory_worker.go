package worker

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
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
	tenantID     string
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

// SetBatchSize mengatur jumlah job yang diambil dalam 1 batch kueri antrean.
func (w *MemoryJobWorker) SetBatchSize(batchSize int) {
	if batchSize > 0 {
		w.batchSize = batchSize
	}
}

// SetTenantID mengatur tenant_id khusus untuk worker ini (opsional).
func (w *MemoryJobWorker) SetTenantID(tenantID string) {
	w.tenantID = tenantID
}

// SetProcessor menginjeksi engine pemrosesan AI (M3).
func (w *MemoryJobWorker) SetProcessor(p MemoryJobProcessor) {
	w.processor = p
}

// Start menjalankan goroutine daemon background untuk polling antrean job.
func (w *MemoryJobWorker) Start() {
	log.Printf("⏳ [MemoryJobWorker] Group Memory AI Job Worker aktif (Interval: %v, Batch: %d, Tenant: '%s')", w.interval, w.batchSize, w.tenantID)

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

	if w.tenantID != "" {
		ctx = tenantshared.WithTenant(ctx, w.tenantID)
	}

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

		// Claim job secara atomik (status QUEUED -> PROCESSING) dengan context tenant job
		jobCtx := ctx
		if pj.TenantID != "" {
			jobCtx = tenantshared.WithTenant(ctx, pj.TenantID)
		}
		job, err := w.memoryStore.ClaimJob(jobCtx, pj.ID)
		if err != nil {
			// Job mungkin sudah diambil oleh worker instance lain (multi-node cluster)
			continue
		}

		processedCount++
		w.processSingleJob(jobCtx, job)
	}

	return processedCount
}

// processSingleJob mengeksekusi pipeline pekerjaan untuk satu ForumMemoryJob.
func (w *MemoryJobWorker) processSingleJob(ctx context.Context, job *store.ForumMemoryJob) {
	jobTenant := job.TenantID
	if jobTenant == "" {
		jobTenant = "default"
	}
	jobCtx := tenantshared.WithTenant(ctx, jobTenant)

	log.Printf("🔄 [MemoryJobWorker] Memproses job %s (Tenant: %s) untuk forum %s (Percobaan %d/%d)...",
		job.ID, jobTenant, job.ForumID, job.AttemptCount, job.MaxAttempts)

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
		err := w.processor.ProcessMemoryJob(jobCtx, job, messageCount)
		if err != nil {
			w.handleJobFailure(jobCtx, job, err)
			return
		}
	} else {
		// M2 Baseline (sebelum M3 AI processor dihubungkan):
		// Menandai job selesai dengan mencatat messageCount
		log.Printf("ℹ️ [MemoryJobWorker] M2 Baseline (No AI Processor): Menyelesaikan job %s dengan %d pesan", job.ID, messageCount)
		if err := w.memoryStore.CompleteJob(jobCtx, job.ID, messageCount); err != nil {
			log.Printf("⚠️ [MemoryJobWorker] Gagal menyelesaikan baseline job %s: %v", job.ID, err)
			return
		}
	}

	log.Printf("✅ [MemoryJobWorker] Sukses memproses memory job %s untuk forum %s", job.ID, job.ForumID)
}

// handleJobFailure mengelola retry scheduler dan status terminal kegagalan job.
func (w *MemoryJobWorker) handleJobFailure(ctx context.Context, job *store.ForumMemoryJob, err error) {
	isTerminal := job.AttemptCount >= job.MaxAttempts

	// Cek error terminal non-retryable (misal: API key salah / 401 / 403 / unrecoverable auth)
	errLower := strings.ToLower(err.Error())
	if strings.Contains(errLower, "authentication failed") ||
		strings.Contains(errLower, "invalid api key") ||
		strings.Contains(errLower, "status 401") ||
		strings.Contains(errLower, "status 403") {
		isTerminal = true
		log.Printf("🚫 [MemoryJobWorker] Job %s mengalami error autentikasi terminal (401/403). Tidak akan di-retry.", job.ID)
	}
	var nextRetry *time.Time

	if !isTerminal {
		var delay time.Duration
		switch job.AttemptCount {
		case 1:
			delay = getWorkerDelayEnv("MEMORY_RETRY_DELAY_1", 30*time.Second)
		case 2:
			delay = getWorkerDelayEnv("MEMORY_RETRY_DELAY_2", 2*time.Minute)
		default:
			delay = getWorkerDelayEnv("MEMORY_RETRY_DELAY_3", 8*time.Minute)
		}
		t := time.Now().UTC().Add(delay)
		nextRetry = &t
		log.Printf("🔁 [MemoryJobWorker] Menjadwalkan retry job %s pada %v (Jeda: %v)", job.ID, t, delay)
	} else {
		log.Printf("🚫 [MemoryJobWorker] Job %s mencapai batas maksimal percobaan (%d), ditandai terminal fail",
			job.ID, job.MaxAttempts)
	}

	if failErr := w.memoryStore.FailJob(ctx, job.ID, err.Error(), isTerminal, nextRetry); failErr != nil {
		log.Printf("⚠️ [MemoryJobWorker] Gagal update fail state job %s: %v", job.ID, failErr)
	}
}

// getWorkerDelayEnv membaca konfigurasi jeda waktu retry dari environment variable (dalam detik atau string duration).
func getWorkerDelayEnv(key string, fallback time.Duration) time.Duration {
	if val := strings.TrimSpace(os.Getenv(key)); val != "" {
		if sec, err := strconv.Atoi(val); err == nil && sec > 0 {
			return time.Duration(sec) * time.Second
		}
		if d, err := time.ParseDuration(val); err == nil && d > 0 {
			return d
		}
	}
	return fallback
}
