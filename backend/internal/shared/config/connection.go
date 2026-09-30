package config

import "time"

// ConfigConnection mendefinisikan batasan operasional domain User Connections & Private Profile Shield.
// Seluruh batasan operasional dibungkus rapi dalam struct ini dan dapat dioverride via Environment Variables.
type ConfigConnection struct {
	RateLimitPerMinute   int           // CONNECTION_RATE_LIMIT_PER_MINUTE (default 10)
	DailyLimit           int           // CONNECTION_DAILY_LIMIT (default 50)
	MaxPendingRequests   int           // CONNECTION_MAX_PENDING_REQUESTS (default 100)
	DeclineCooldownHours int           // CONNECTION_DECLINE_COOLDOWN_HOURS (default 168 = 7 hari)
	PageDefaultLimit     int           // CONNECTION_PAGE_DEFAULT_LIMIT (default 20)
	PageMaxLimit         int           // CONNECTION_PAGE_MAX_LIMIT (default 50)
	CacheTTL             time.Duration // CONNECTION_CACHE_TTL_SECONDS (default 600s = 10 menit)
}

// LoadConnectionConfig membaca parameter konfigurasi koneksi pertemanan dari environment variables.
func LoadConnectionConfig() ConfigConnection {
	return ConfigConnection{
		RateLimitPerMinute:   getEnvInt("CONNECTION_RATE_LIMIT_PER_MINUTE", 10),
		DailyLimit:           getEnvInt("CONNECTION_DAILY_LIMIT", 50),
		MaxPendingRequests:   getEnvInt("CONNECTION_MAX_PENDING_REQUESTS", 100),
		DeclineCooldownHours: getEnvInt("CONNECTION_DECLINE_COOLDOWN_HOURS", 168),
		PageDefaultLimit:     getEnvInt("CONNECTION_PAGE_DEFAULT_LIMIT", 20),
		PageMaxLimit:         getEnvInt("CONNECTION_PAGE_MAX_LIMIT", 50),
		CacheTTL:             getEnvDurationSeconds("CONNECTION_CACHE_TTL_SECONDS", 10*time.Minute),
	}
}
