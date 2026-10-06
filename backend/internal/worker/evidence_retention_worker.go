package worker

import (
	"context"
	"log"
	"sync"
	"time"
)

// EvidencePurger menghapus bukti laporan yang melewati masa simpan.
type EvidencePurger interface {
	PurgeExpiredEvidence(ctx context.Context, cutoff time.Time) (int64, error)
}

// EvidenceRetentionWorker menjalankan penghapusan bukti laporan moderasi secara berkala: bukti dan rincian pelapor
// dihapus setelah laporan ditutup lebih lama dari masa simpan, kecuali yang ditahan. Hanya teks bukti yang dibersihkan;
// metadata laporan dan jejak audit tetap ada.
type EvidenceRetentionWorker struct {
	store     EvidencePurger
	retention time.Duration
	interval  time.Duration
	now       func() time.Time

	stopCh  chan struct{}
	wg      sync.WaitGroup
	mu      sync.Mutex
	running bool
}

// NewEvidenceRetentionWorker membuat worker. retention <= 0 berarti tidak ada penghapusan otomatis (Start tidak
// melakukan apa pun). interval bawaan 6 jam.
func NewEvidenceRetentionWorker(store EvidencePurger, retention, interval time.Duration) *EvidenceRetentionWorker {
	if interval <= 0 {
		interval = 6 * time.Hour
	}
	return &EvidenceRetentionWorker{store: store, retention: retention, interval: interval, now: time.Now, stopCh: make(chan struct{})}
}

// RunOnce menjalankan satu putaran pembersihan dan mengembalikan jumlah laporan yang dibersihkan.
func (w *EvidenceRetentionWorker) RunOnce(ctx context.Context) (int64, error) {
	if w == nil || w.store == nil || w.retention <= 0 {
		return 0, nil
	}
	return w.store.PurgeExpiredEvidence(ctx, w.now().Add(-w.retention))
}

func (w *EvidenceRetentionWorker) tick() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	n, err := w.RunOnce(ctx)
	if err != nil {
		log.Printf("⚠️ [EvidenceRetention] gagal membersihkan bukti laporan: %v", err)
		return
	}
	if n > 0 {
		log.Printf("🧹 [EvidenceRetention] bukti %d laporan dihapus (lewat masa simpan %s)", n, w.retention)
	}
}

// Start menjalankan satu putaran segera lalu berulang tiap interval. Aman dipanggil pada nil atau berulang kali.
func (w *EvidenceRetentionWorker) Start() {
	if w == nil || w.retention <= 0 {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.running {
		return
	}
	w.running = true
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		w.tick()
		t := time.NewTicker(w.interval)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				w.tick()
			case <-w.stopCh:
				return
			}
		}
	}()
}

// Stop menghentikan worker dan menunggu putaran yang sedang berjalan selesai.
func (w *EvidenceRetentionWorker) Stop() {
	if w == nil {
		return
	}
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return
	}
	w.running = false
	close(w.stopCh)
	w.mu.Unlock()
	w.wg.Wait()
}
