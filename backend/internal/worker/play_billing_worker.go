package worker

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/playbilling"
)

// PlaySweeper menjalankan satu putaran sapuan pembelian Play.
type PlaySweeper interface {
	Sweep(ctx context.Context) (playbilling.SweepResult, error)
}

// PlayBillingWorker mencoba ulang konsumsi pembelian Star yang tertunda dan membalik pembelian yang dibatalkan
// Google Play (voided) secara berkala (V2 Tahap 2b, docs/plans/backlog/STARS_PLAY_BILLING.md bagian 4-5).
type PlayBillingWorker struct {
	sweeper  PlaySweeper
	interval time.Duration

	stopCh  chan struct{}
	wg      sync.WaitGroup
	mu      sync.Mutex
	running bool
}

// NewPlayBillingWorker membuat worker; interval bawaan 1 jam.
func NewPlayBillingWorker(sweeper PlaySweeper, interval time.Duration) *PlayBillingWorker {
	if interval <= 0 {
		interval = time.Hour
	}
	return &PlayBillingWorker{sweeper: sweeper, interval: interval, stopCh: make(chan struct{})}
}

func (w *PlayBillingWorker) tick() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	r, err := w.sweeper.Sweep(ctx)
	if err != nil {
		log.Printf("⚠️ [PlayBilling] sapuan gagal: %v", err)
		return
	}
	if r.Consumed > 0 || r.Voided > 0 {
		log.Printf("⭐ [PlayBilling] sapuan: %d dikonsumsi, %d dibalik (voided)", r.Consumed, r.Voided)
	}
}

// Start menjalankan satu putaran segera lalu berulang tiap interval. Aman dipanggil pada nil atau berulang kali.
func (w *PlayBillingWorker) Start() {
	if w == nil || w.sweeper == nil {
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

// Stop menghentikan worker dan menunggu putaran berjalan selesai. Aman dipanggil pada nil.
func (w *PlayBillingWorker) Stop() {
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
