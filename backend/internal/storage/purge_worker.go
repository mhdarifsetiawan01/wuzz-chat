package storage

import (
	"context"
	"log"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// PurgeWorker menjalankan pembersihan berkala untuk file media yang sudah melampaui batas retensi (TTL).
type PurgeWorker struct {
	storage       MediaStorage
	msgStore      store.MessageStore
	retentionDays int
	interval      time.Duration
	stopCh        chan struct{}
}

// NewPurgeWorker membuat instance baru PurgeWorker.
func NewPurgeWorker(storage MediaStorage, msgStore store.MessageStore, retentionDays int, interval time.Duration) *PurgeWorker {
	if interval <= 0 {
		interval = 1 * time.Hour // Default periksa setiap 1 jam
	}
	return &PurgeWorker{
		storage:       storage,
		msgStore:      msgStore,
		retentionDays: retentionDays,
		interval:      interval,
		stopCh:        make(chan struct{}),
	}
}

// Start menjalankan loop worker di latar belakang.
func (w *PurgeWorker) Start() {
	if w.retentionDays <= 0 {
		log.Printf("ℹ️ [PurgeWorker] Retensi media diset permanen (retentionDays=%d), worker auto-purge nonaktif.", w.retentionDays)
		return
	}

	log.Printf("🧹 [PurgeWorker] Worker pembersih media TTL aktif (Batas: %d hari, Interval periksa: %v)", w.retentionDays, w.interval)

	go func() {
		ticker := time.NewTicker(w.interval)
		defer ticker.Stop()

		// Jalankan sekali saat startup setelah delay singkat
		time.Sleep(10 * time.Second)
		w.PurgeOnce(context.Background())

		for {
			select {
			case <-ticker.C:
				w.PurgeOnce(context.Background())
			case <-w.stopCh:
				log.Println("🛑 [PurgeWorker] Worker dihentikan.")
				return
			}
		}
	}()
}

// Stop menghentikan worker.
func (w *PurgeWorker) Stop() {
	close(w.stopCh)
}

// PurgeOnce mengeksekusi satu siklus pembersihan berkas media kedaluwarsa.
func (w *PurgeWorker) PurgeOnce(ctx context.Context) int {
	if w.retentionDays <= 0 || w.msgStore == nil || w.storage == nil {
		return 0
	}

	expiredMsgs, err := w.msgStore.GetExpiredMediaMessages(w.retentionDays)
	if err != nil {
		log.Printf("⚠️ [PurgeWorker] Gagal mengambil daftar media kedaluwarsa: %v", err)
		return 0
	}

	if len(expiredMsgs) == 0 {
		return 0
	}

	purgedCount := 0
	for _, msg := range expiredMsgs {
		if msg.MediaURL == "" {
			continue
		}

		// Hapus berkas fisik dari storage
		if err := w.storage.Delete(ctx, msg.MediaURL); err != nil {
			log.Printf("⚠️ [PurgeWorker] Gagal menghapus berkas fisik (%s): %v", msg.MediaURL, err)
		} else {
			log.Printf("🗑️ [PurgeWorker] Berkas media kedaluwarsa berhasil dihapus dari storage: %s", msg.MediaURL)
		}

		// Update status di database menjadi 'expired'
		if err := w.msgStore.MarkMediaExpired(msg.ID); err != nil {
			log.Printf("⚠️ [PurgeWorker] Gagal memperbarui status pesan (%s) ke expired: %v", msg.ID, err)
		} else {
			purgedCount++
		}
	}

	log.Printf("✨ [PurgeWorker] Siklus purge selesai: %d berkas media kedaluwarsa diproses.", purgedCount)
	return purgedCount
}
