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
	queue         store.MediaPurgeQueue
}

const (
	// queueBatchSize/queueMaxBatches membatasi kerja antrean per siklus agar database dan storage tidak terbebani.
	queueBatchSize  = 100
	queueMaxBatches = 10
	// queueMaxAttempts: setelah sekian kali gagal berkas dibuang dari antrean dan dicatat di log.
	queueMaxAttempts = 10
)

// SetQueue menyambungkan antrean penghapusan berkas yatim (mis. dari hapus akun). Panggil sebelum Start.
func (w *PurgeWorker) SetQueue(q store.MediaPurgeQueue) {
	w.queue = q
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
	if w.retentionDays <= 0 && w.queue == nil {
		log.Printf("ℹ️ [PurgeWorker] Retensi media diset permanen (retentionDays=%d), worker auto-purge nonaktif.", w.retentionDays)
		return
	}

	log.Printf("🧹 [PurgeWorker] Worker pembersih media TTL aktif (Batas: %d hari, Interval periksa: %v)", w.retentionDays, w.interval)

	go func() {
		ticker := time.NewTicker(w.interval)
		defer ticker.Stop()

		// Jalankan sekali saat startup setelah delay singkat
		time.Sleep(10 * time.Second)
		w.runCycle(context.Background())

		for {
			select {
			case <-ticker.C:
				w.runCycle(context.Background())
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

// runCycle menjalankan satu siklus: berkas kedaluwarsa lalu antrean berkas yatim.
func (w *PurgeWorker) runCycle(ctx context.Context) {
	w.PurgeOnce(ctx)
	w.DrainQueue(ctx)
}

// DrainQueue menghapus berkas fisik dari antrean (dibatasi per siklus) dan mengembalikan jumlah yang terhapus.
// Berkas yang gagal dijadwalkan ulang dengan jeda bertambah, lalu dibuang dari antrean setelah queueMaxAttempts.
func (w *PurgeWorker) DrainQueue(ctx context.Context) int {
	if w.queue == nil || w.storage == nil {
		return 0
	}
	done := 0
	for i := 0; i < queueMaxBatches; i++ {
		urls, err := w.queue.ClaimDue(ctx, queueBatchSize)
		if err != nil {
			log.Printf("⚠️ [PurgeWorker] Gagal membaca antrean hapus media: %v", err)
			return done
		}
		if len(urls) == 0 {
			return done
		}
		for _, u := range urls {
			if err := w.storage.Delete(ctx, u); err != nil {
				gaveUp, ferr := w.queue.Fail(ctx, u, queueMaxAttempts)
				if ferr != nil {
					log.Printf("⚠️ [PurgeWorker] Gagal menjadwalkan ulang berkas antrean (%s): %v", u, ferr)
				}
				if gaveUp {
					log.Printf("❌ [PurgeWorker] Menyerah menghapus berkas %s setelah %d percobaan: %v", u, queueMaxAttempts, err)
				}
				continue
			}
			if err := w.queue.Complete(ctx, u); err != nil {
				log.Printf("⚠️ [PurgeWorker] Berkas terhapus tapi gagal dibuang dari antrean (%s): %v", u, err)
				continue
			}
			done++
		}
		if len(urls) < queueBatchSize {
			return done
		}
	}
	return done
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
