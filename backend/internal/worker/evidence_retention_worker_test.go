package worker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type fakePurger struct {
	mu      sync.Mutex
	cutoffs []time.Time
	n       int64
	err     error
}

func (f *fakePurger) PurgeExpiredEvidence(_ context.Context, cutoff time.Time) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cutoffs = append(f.cutoffs, cutoff)
	return f.n, f.err
}

func (f *fakePurger) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.cutoffs)
}

func TestEvidenceRetentionWorker_RunOnceUsesRetentionCutoff(t *testing.T) {
	f := &fakePurger{n: 3}
	w := NewEvidenceRetentionWorker(f, 90*24*time.Hour, time.Hour)
	now := time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }
	n, err := w.RunOnce(context.Background())
	if err != nil || n != 3 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	want := now.Add(-90 * 24 * time.Hour)
	if len(f.cutoffs) != 1 || !f.cutoffs[0].Equal(want) {
		t.Fatalf("cutoff harus now-90 hari: %v want %v", f.cutoffs, want)
	}
}

func TestEvidenceRetentionWorker_DisabledAndNilAreNoOps(t *testing.T) {
	f := &fakePurger{}
	w := NewEvidenceRetentionWorker(f, 0, time.Millisecond) // retensi 0 = mati
	w.Start()
	time.Sleep(20 * time.Millisecond)
	w.Stop()
	if f.calls() != 0 {
		t.Fatalf("retensi 0 tidak boleh membersihkan apa pun, got %d", f.calls())
	}
	if n, err := w.RunOnce(context.Background()); n != 0 || err != nil {
		t.Fatalf("RunOnce saat mati: %d %v", n, err)
	}
	var nilW *EvidenceRetentionWorker
	nilW.Start()
	nilW.Stop()
	if n, err := nilW.RunOnce(context.Background()); n != 0 || err != nil {
		t.Fatal("nil aman")
	}
}

func TestEvidenceRetentionWorker_RunsImmediatelyThenPeriodicallyAndStops(t *testing.T) {
	f := &fakePurger{}
	w := NewEvidenceRetentionWorker(f, time.Hour, 15*time.Millisecond)
	w.Start()
	w.Start() // berulang tidak menggandakan
	deadline := time.Now().Add(2 * time.Second)
	for f.calls() < 3 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if f.calls() < 3 {
		t.Fatalf("harus berjalan segera dan berkala, got %d", f.calls())
	}
	w.Stop()
	after := f.calls()
	time.Sleep(60 * time.Millisecond)
	if f.calls() != after {
		t.Fatal("setelah Stop tidak boleh ada putaran baru")
	}
	w.Stop() // aman dipanggil dua kali
}

func TestEvidenceRetentionWorker_ErrorDoesNotStopLoop(t *testing.T) {
	f := &fakePurger{err: errors.New("db down")}
	w := NewEvidenceRetentionWorker(f, time.Hour, 10*time.Millisecond)
	w.Start()
	defer w.Stop()
	deadline := time.Now().Add(2 * time.Second)
	for f.calls() < 3 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if f.calls() < 3 {
		t.Fatalf("galat tidak boleh menghentikan worker, got %d putaran", f.calls())
	}
}
