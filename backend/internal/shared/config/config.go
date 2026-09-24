package config

import (
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config menampung seluruh konfigurasi runtime backend Wuzz Chat.
// Didesain terpusat dan berstruktur rapi agar mudah dibaca dan dipahami
// oleh developer pemula maupun senior.
type Config struct {
	// Server & Network
	Port               string
	CORSAllowedOrigins string
	JWTSecret          string

	// Media Storage & Uploads
	UploadDir          string
	MediaRetentionDays int

	// Rate Limiting (Dual-Tier Anti-Abuse)
	AuthRateLimitIP   int
	AuthRateLimitUser int

	// Background Worker Intervals & Batch
	MemoryWorkerInterval    time.Duration
	MemoryJobBatchSize      int
	SubGroupWorkerInterval  time.Duration
	PurgeWorkerInterval     time.Duration
	TokenCleanupInterval    time.Duration
	SessionCleanupInterval  time.Duration
	TransferCleanupInterval time.Duration
}

// Load membaca konfigurasi dari file .env (jika tersedia) dan variabel lingkungan sistem (OS Environment).
// Setiap parameter memiliki nilai default yang aman jika tidak dispesifikasikan di environment.
func Load() (*Config, error) {
	// Muat konfigurasi dari file .env (jika ada di direktori kerja)
	if err := godotenv.Load(); err != nil {
		log.Printf("ℹ️ File .env tidak ditemukan, membaca konfigurasi dari system environment.")
	}

	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		CORSAllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "*"),
		JWTSecret:          getEnv("JWT_SECRET", "your_super_secret_jwt_key_wuzz_chat_2026"),

		UploadDir:          getEnv("UPLOAD_DIR", "./uploads"),
		MediaRetentionDays: getEnvInt("MEDIA_RETENTION_DAYS", 7),

		AuthRateLimitIP:   getEnvInt("AUTH_RATE_LIMIT_IP", 100),
		AuthRateLimitUser: getEnvInt("AUTH_RATE_LIMIT_USER", 15),

		MemoryWorkerInterval:    getEnvDurationSeconds("MEMORY_WORKER_INTERVAL_SECONDS", 15*time.Second),
		MemoryJobBatchSize:      getEnvInt("MEMORY_JOB_BATCH_SIZE", 5),
		SubGroupWorkerInterval:  15 * time.Minute,
		PurgeWorkerInterval:     1 * time.Hour,
		TokenCleanupInterval:    1 * time.Hour,
		SessionCleanupInterval:  1 * time.Hour,
		TransferCleanupInterval: 10 * time.Minute,
	}

	return cfg, nil
}

// getEnv membaca environment variable string dengan fallback ke default.
func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// getEnvInt membaca environment variable integer dengan fallback ke default.
func getEnvInt(key string, defaultVal int) int {
	if valStr := os.Getenv(key); valStr != "" {
		if val, err := strconv.Atoi(valStr); err == nil && val >= 0 {
			return val
		}
	}
	return defaultVal
}

// getEnvDurationSeconds membaca integer detik dari env dan mengonversi ke time.Duration.
func getEnvDurationSeconds(key string, defaultVal time.Duration) time.Duration {
	if valStr := os.Getenv(key); valStr != "" {
		if val, err := strconv.Atoi(valStr); err == nil && val > 0 {
			return time.Duration(val) * time.Second
		}
	}
	return defaultVal
}
