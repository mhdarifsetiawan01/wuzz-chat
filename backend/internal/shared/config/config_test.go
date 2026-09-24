package config

import (
	"os"
	"testing"
	"time"
)

func TestConfig_Defaults(t *testing.T) {
	// Bersihkan env untuk memastikan default bekerja
	os.Unsetenv("PORT")
	os.Unsetenv("MEDIA_RETENTION_DAYS")
	os.Unsetenv("AUTH_RATE_LIMIT_IP")
	os.Unsetenv("AUTH_RATE_LIMIT_USER")
	os.Unsetenv("MEMORY_WORKER_INTERVAL_SECONDS")
	os.Unsetenv("MEMORY_JOB_BATCH_SIZE")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Port != "8080" {
		t.Errorf("expected Port '8080', got '%s'", cfg.Port)
	}
	if cfg.MediaRetentionDays != 7 {
		t.Errorf("expected MediaRetentionDays 7, got %d", cfg.MediaRetentionDays)
	}
	if cfg.AuthRateLimitIP != 100 {
		t.Errorf("expected AuthRateLimitIP 100, got %d", cfg.AuthRateLimitIP)
	}
	if cfg.AuthRateLimitUser != 15 {
		t.Errorf("expected AuthRateLimitUser 15, got %d", cfg.AuthRateLimitUser)
	}
	if cfg.MemoryWorkerInterval != 15*time.Second {
		t.Errorf("expected MemoryWorkerInterval 15s, got %v", cfg.MemoryWorkerInterval)
	}
	if cfg.MemoryJobBatchSize != 5 {
		t.Errorf("expected MemoryJobBatchSize 5, got %d", cfg.MemoryJobBatchSize)
	}
}

func TestConfig_CustomEnv(t *testing.T) {
	os.Setenv("PORT", "9090")
	os.Setenv("MEDIA_RETENTION_DAYS", "14")
	os.Setenv("AUTH_RATE_LIMIT_IP", "250")
	os.Setenv("AUTH_RATE_LIMIT_USER", "30")
	os.Setenv("MEMORY_WORKER_INTERVAL_SECONDS", "45")
	os.Setenv("MEMORY_JOB_BATCH_SIZE", "10")
	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("MEDIA_RETENTION_DAYS")
		os.Unsetenv("AUTH_RATE_LIMIT_IP")
		os.Unsetenv("AUTH_RATE_LIMIT_USER")
		os.Unsetenv("MEMORY_WORKER_INTERVAL_SECONDS")
		os.Unsetenv("MEMORY_JOB_BATCH_SIZE")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Port != "9090" {
		t.Errorf("expected Port '9090', got '%s'", cfg.Port)
	}
	if cfg.MediaRetentionDays != 14 {
		t.Errorf("expected MediaRetentionDays 14, got %d", cfg.MediaRetentionDays)
	}
	if cfg.AuthRateLimitIP != 250 {
		t.Errorf("expected AuthRateLimitIP 250, got %d", cfg.AuthRateLimitIP)
	}
	if cfg.AuthRateLimitUser != 30 {
		t.Errorf("expected AuthRateLimitUser 30, got %d", cfg.AuthRateLimitUser)
	}
	if cfg.MemoryWorkerInterval != 45*time.Second {
		t.Errorf("expected MemoryWorkerInterval 45s, got %v", cfg.MemoryWorkerInterval)
	}
	if cfg.MemoryJobBatchSize != 10 {
		t.Errorf("expected MemoryJobBatchSize 10, got %d", cfg.MemoryJobBatchSize)
	}
}
