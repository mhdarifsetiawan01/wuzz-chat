package worker

import (
	"sync/atomic"
	"testing"
	"time"
)

type mockTokenCleaner struct {
	calls int64
}

func (m *mockTokenCleaner) CleanupExpiredTokens() (int64, error) {
	atomic.AddInt64(&m.calls, 1)
	return 2, nil
}

type mockSessionCleaner struct {
	calls int64
}

func (m *mockSessionCleaner) CleanupExpiredSessions() (int64, error) {
	atomic.AddInt64(&m.calls, 1)
	return 3, nil
}

type mockTransferCleaner struct {
	calls int64
}

func (m *mockTransferCleaner) CleanupExpiredSessions() (int64, error) {
	atomic.AddInt64(&m.calls, 1)
	return 1, nil
}

func TestAuthCleanupWorker_RunOnce(t *testing.T) {
	mockToken := &mockTokenCleaner{}
	mockSession := &mockSessionCleaner{}
	mockTransfer := &mockTransferCleaner{}

	worker := NewAuthCleanupWorker(mockToken, mockSession, mockTransfer, CleanerConfig{})
	worker.RunOnce()

	if atomic.LoadInt64(&mockToken.calls) != 1 {
		t.Errorf("expected 1 token cleanup call, got %d", mockToken.calls)
	}
	if atomic.LoadInt64(&mockSession.calls) != 1 {
		t.Errorf("expected 1 session cleanup call, got %d", mockSession.calls)
	}
	if atomic.LoadInt64(&mockTransfer.calls) != 1 {
		t.Errorf("expected 1 transfer cleanup call, got %d", mockTransfer.calls)
	}
}

func TestAuthCleanupWorker_StartStop(t *testing.T) {
	mockToken := &mockTokenCleaner{}
	mockSession := &mockSessionCleaner{}
	mockTransfer := &mockTransferCleaner{}

	cfg := CleanerConfig{
		TokenInterval:    10 * time.Millisecond,
		SessionInterval:  10 * time.Millisecond,
		TransferInterval: 10 * time.Millisecond,
	}

	worker := NewAuthCleanupWorker(mockToken, mockSession, mockTransfer, cfg)
	worker.Start()

	// Biarkan ticker berjalan sejenak
	time.Sleep(35 * time.Millisecond)

	worker.Stop()

	// Pastikan worker telah dipanggil setidaknya 1 kali
	if atomic.LoadInt64(&mockToken.calls) == 0 {
		t.Errorf("expected at least 1 token cleanup call from ticker")
	}
	if atomic.LoadInt64(&mockSession.calls) == 0 {
		t.Errorf("expected at least 1 session cleanup call from ticker")
	}
	if atomic.LoadInt64(&mockTransfer.calls) == 0 {
		t.Errorf("expected at least 1 transfer cleanup call from ticker")
	}

	// Memanggil Stop() berulang kali harus aman
	worker.Stop()
}
