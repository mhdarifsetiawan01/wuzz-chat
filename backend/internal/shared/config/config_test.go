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
	if cfg.MediaRetentionDays != 1 {
		t.Errorf("expected MediaRetentionDays 1, got %d", cfg.MediaRetentionDays)
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
	if cfg.Connection.RateLimitPerMinute != 10 {
		t.Errorf("expected Connection.RateLimitPerMinute 10, got %d", cfg.Connection.RateLimitPerMinute)
	}
	if cfg.Connection.DailyLimit != 50 {
		t.Errorf("expected Connection.DailyLimit 50, got %d", cfg.Connection.DailyLimit)
	}
	if cfg.Connection.MaxPendingRequests != 100 {
		t.Errorf("expected Connection.MaxPendingRequests 100, got %d", cfg.Connection.MaxPendingRequests)
	}
	if cfg.Connection.DeclineCooldownHours != 168 {
		t.Errorf("expected Connection.DeclineCooldownHours 168, got %d", cfg.Connection.DeclineCooldownHours)
	}
	if cfg.Connection.PageDefaultLimit != 20 {
		t.Errorf("expected Connection.PageDefaultLimit 20, got %d", cfg.Connection.PageDefaultLimit)
	}
	if cfg.Connection.PageMaxLimit != 50 {
		t.Errorf("expected Connection.PageMaxLimit 50, got %d", cfg.Connection.PageMaxLimit)
	}
	if cfg.Connection.CacheTTL != 10*time.Minute {
		t.Errorf("expected Connection.CacheTTL 10m, got %v", cfg.Connection.CacheTTL)
	}
}

func TestConfig_CustomEnv(t *testing.T) {
	os.Setenv("PORT", "9090")
	os.Setenv("MEDIA_RETENTION_DAYS", "14")
	os.Setenv("AUTH_RATE_LIMIT_IP", "250")
	os.Setenv("AUTH_RATE_LIMIT_USER", "30")
	os.Setenv("MEMORY_WORKER_INTERVAL_SECONDS", "45")
	os.Setenv("MEMORY_JOB_BATCH_SIZE", "10")
	os.Setenv("CONNECTION_RATE_LIMIT_PER_MINUTE", "25")
	os.Setenv("CONNECTION_DAILY_LIMIT", "100")
	os.Setenv("CONNECTION_MAX_PENDING_REQUESTS", "200")
	os.Setenv("CONNECTION_DECLINE_COOLDOWN_HOURS", "72")
	os.Setenv("CONNECTION_PAGE_DEFAULT_LIMIT", "30")
	os.Setenv("CONNECTION_PAGE_MAX_LIMIT", "75")
	os.Setenv("CONNECTION_CACHE_TTL_SECONDS", "300")
	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("MEDIA_RETENTION_DAYS")
		os.Unsetenv("AUTH_RATE_LIMIT_IP")
		os.Unsetenv("AUTH_RATE_LIMIT_USER")
		os.Unsetenv("MEMORY_WORKER_INTERVAL_SECONDS")
		os.Unsetenv("MEMORY_JOB_BATCH_SIZE")
		os.Unsetenv("CONNECTION_RATE_LIMIT_PER_MINUTE")
		os.Unsetenv("CONNECTION_DAILY_LIMIT")
		os.Unsetenv("CONNECTION_MAX_PENDING_REQUESTS")
		os.Unsetenv("CONNECTION_DECLINE_COOLDOWN_HOURS")
		os.Unsetenv("CONNECTION_PAGE_DEFAULT_LIMIT")
		os.Unsetenv("CONNECTION_PAGE_MAX_LIMIT")
		os.Unsetenv("CONNECTION_CACHE_TTL_SECONDS")
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
	if cfg.Connection.RateLimitPerMinute != 25 {
		t.Errorf("expected Connection.RateLimitPerMinute 25, got %d", cfg.Connection.RateLimitPerMinute)
	}
	if cfg.Connection.DailyLimit != 100 {
		t.Errorf("expected Connection.DailyLimit 100, got %d", cfg.Connection.DailyLimit)
	}
	if cfg.Connection.MaxPendingRequests != 200 {
		t.Errorf("expected Connection.MaxPendingRequests 200, got %d", cfg.Connection.MaxPendingRequests)
	}
	if cfg.Connection.DeclineCooldownHours != 72 {
		t.Errorf("expected Connection.DeclineCooldownHours 72, got %d", cfg.Connection.DeclineCooldownHours)
	}
	if cfg.Connection.PageDefaultLimit != 30 {
		t.Errorf("expected Connection.PageDefaultLimit 30, got %d", cfg.Connection.PageDefaultLimit)
	}
	if cfg.Connection.PageMaxLimit != 75 {
		t.Errorf("expected Connection.PageMaxLimit 75, got %d", cfg.Connection.PageMaxLimit)
	}
	if cfg.Connection.CacheTTL != 300*time.Second {
		t.Errorf("expected Connection.CacheTTL 300s, got %v", cfg.Connection.CacheTTL)
	}
}
