// Package worker mengelola background workers untuk domain grup dan forum.
package worker

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/group"
)

// SubGroupTTLWorker memantau dan memperbarui status subgrup yang telah mencapai batas expires_at
// menjadi 'expired' serta memicu pembuatan antrean ForumMemoryJob untuk Group Memory AI.
type SubGroupTTLWorker struct {
	repo        group.GroupRepository
	memoryStore group.MemoryJobCreator
	interval    time.Duration
	stopCh      chan struct{}
	wg          sync.WaitGroup
}

// NewSubGroupTTLWorker membuat instance baru SubGroupTTLWorker.
func NewSubGroupTTLWorker(repo group.GroupRepository, interval time.Duration) *SubGroupTTLWorker {
	if interval <= 0 {
		interval = 15 * time.Minute
	}
	return &SubGroupTTLWorker{
		repo:     repo,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

// SetMemoryStore menginjeksi MemoryJobCreator ke SubGroupTTLWorker.
func (w *SubGroupTTLWorker) SetMemoryStore(ms group.MemoryJobCreator) {
	w.memoryStore = ms
}

// Start menjalankan background goroutine untuk pemeriksaan TTL berkala secara non-blocking.
func (w *SubGroupTTLWorker) Start() {
	log.Printf("⏳ [SubGroupTTLWorker] Worker auto-expire subgrup aktif (Interval: %v)", w.interval)

	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		w.ExpireOnce()

		ticker := time.NewTicker(w.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				w.ExpireOnce()
			case <-w.stopCh:
				log.Println("🛑 [SubGroupTTLWorker] Worker dihentikan.")
				return
			}
		}
	}()
}

// Stop menghentikan background worker secara graceful.
func (w *SubGroupTTLWorker) Stop() {
	close(w.stopCh)
	w.wg.Wait()
}

// ExpireOnce mengeksekusi satu siklus scanning dan updating status subgrup yang kedaluwarsa,
// serta memicu pembuatan ForumMemoryJob untuk subgrup yang baru saja kedaluwarsa.
func (w *SubGroupTTLWorker) ExpireOnce() int {
	if w.repo == nil {
		return 0
	}
	expiredItems, err := w.repo.ExpireSubGroupsBatchDetailed()
	if err != nil {
		log.Printf("⚠️ [SubGroupTTLWorker] Gagal memproses batch expire subgrup: %v", err)
		return 0
	}
	affected := len(expiredItems)
	if affected > 0 {
		log.Printf("🔒 [SubGroupTTLWorker] Berhasil mengunci %d subgrup yang telah kedaluwarsa (status: 'expired')", affected)

		// Pemicu otomatis pembuatan ForumMemoryJob untuk Group Memory AI
		if w.memoryStore != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			for _, item := range expiredItems {
				job, err := w.memoryStore.CreateJob(ctx, item.ID, item.ParentID)
				if err != nil {
					log.Printf("ℹ️ [SubGroupTTLWorker] Skip buat memory job forum %s: %v", item.ID, err)
				} else if job != nil {
					log.Printf("🧠 [SubGroupTTLWorker] Berhasil membuat ForumMemoryJob (ID: %s) untuk forum %s", job.ID, item.ID)
				}
			}
		}
	}
	return affected
}
