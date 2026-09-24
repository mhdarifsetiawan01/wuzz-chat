package worker

import (
	"log"
	"sync"
	"time"
)

// TokenCleaner mendefinisikan kontrak pembersihan token kedaluwarsa.
type TokenCleaner interface {
	CleanupExpiredTokens() (int64, error)
}

// SessionCleaner mendefinisikan kontrak pembersihan sesi login kedaluwarsa.
type SessionCleaner interface {
	CleanupExpiredSessions() (int64, error)
}

// TransferCleaner mendefinisikan kontrak pembersihan sesi transfer QR kedaluwarsa.
type TransferCleaner interface {
	CleanupExpiredSessions() (int64, error)
}

// CleanerConfig memuat pengaturan interval pembersihan background.
type CleanerConfig struct {
	TokenInterval    time.Duration
	SessionInterval  time.Duration
	TransferInterval time.Duration
}

// AuthCleanupWorker mengelola siklus hidup background goroutines untuk membersihkan
// data kedaluwarsa secara berkala: token revoked, login sessions, dan transfer QR sessions.
// Menggantikan goroutine terpisah yang sebelumnya tersebar di main.go.
type AuthCleanupWorker struct {
	tokenStore    TokenCleaner
	sessionStore  SessionCleaner
	transferStore TransferCleaner
	config        CleanerConfig

	stopCh  chan struct{}
	wg      sync.WaitGroup
	mu      sync.Mutex
	running bool
}

// NewAuthCleanupWorker membuat instance baru dari AuthCleanupWorker.
func NewAuthCleanupWorker(
	token TokenCleaner,
	session SessionCleaner,
	transfer TransferCleaner,
	cfg CleanerConfig,
) *AuthCleanupWorker {
	if cfg.TokenInterval <= 0 {
		cfg.TokenInterval = 1 * time.Hour
	}
	if cfg.SessionInterval <= 0 {
		cfg.SessionInterval = 1 * time.Hour
	}
	if cfg.TransferInterval <= 0 {
		cfg.TransferInterval = 10 * time.Minute
	}

	return &AuthCleanupWorker{
		tokenStore:    token,
		sessionStore:  session,
		transferStore: transfer,
		config:        cfg,
		stopCh:        make(chan struct{}),
	}
}

// Start memulai background goroutines pembersihan berkala.
func (w *AuthCleanupWorker) Start() {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.running {
		return
	}
	w.running = true
	w.stopCh = make(chan struct{})

	// 1. Worker Pembersih Sesi Transfer QR (Setiap 10 Menit default)
	if w.transferStore != nil {
		w.wg.Add(1)
		go func() {
			defer w.wg.Done()
			ticker := time.NewTicker(w.config.TransferInterval)
			defer ticker.Stop()

			for {
				select {
				case <-ticker.C:
					if _, err := w.transferStore.CleanupExpiredSessions(); err != nil {
						log.Printf("⚠️ Gagal membersihkan sesi transfer kedaluwarsa: %v", err)
					}
				case <-w.stopCh:
					return
				}
			}
		}()
	}

	// 2. Worker Pembersih Token Ter-revoke (Setiap 1 Jam default)
	if w.tokenStore != nil {
		w.wg.Add(1)
		go func() {
			defer w.wg.Done()
			ticker := time.NewTicker(w.config.TokenInterval)
			defer ticker.Stop()

			for {
				select {
				case <-ticker.C:
					if cleaned, err := w.tokenStore.CleanupExpiredTokens(); err != nil {
						log.Printf("⚠️ Gagal membersihkan token kedaluwarsa: %v", err)
					} else if cleaned > 0 {
						log.Printf("🧹 Berhasil membersihkan %d token kedaluwarsa", cleaned)
					}
				case <-w.stopCh:
					return
				}
			}
		}()
	}

	// 3. Worker Pembersih Sesi Login Kedaluwarsa (Setiap 1 Jam default)
	if w.sessionStore != nil {
		w.wg.Add(1)
		go func() {
			defer w.wg.Done()
			ticker := time.NewTicker(w.config.SessionInterval)
			defer ticker.Stop()

			for {
				select {
				case <-ticker.C:
					if cleaned, err := w.sessionStore.CleanupExpiredSessions(); err != nil {
						log.Printf("⚠️ Gagal membersihkan sesi login kedaluwarsa: %v", err)
					} else if cleaned > 0 {
						log.Printf("🧹 Berhasil membersihkan %d sesi login kedaluwarsa", cleaned)
					}
				case <-w.stopCh:
					return
				}
			}
		}()
	}
}

// Stop menghentikan seluruh background goroutines secara anggun (graceful).
func (w *AuthCleanupWorker) Stop() {
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

// RunOnce mengeksekusi satu kali siklus pembersihan langsung (berguna untuk testing atau manual trigger).
func (w *AuthCleanupWorker) RunOnce() {
	if w.transferStore != nil {
		_, _ = w.transferStore.CleanupExpiredSessions()
	}
	if w.tokenStore != nil {
		_, _ = w.tokenStore.CleanupExpiredTokens()
	}
	if w.sessionStore != nil {
		_, _ = w.sessionStore.CleanupExpiredSessions()
	}
}
