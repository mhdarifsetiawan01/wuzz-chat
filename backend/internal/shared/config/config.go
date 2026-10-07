package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config menampung seluruh konfigurasi runtime backend Wuzz Chat.
// Didesain terpusat dan berstruktur rapi agar mudah dibaca dan dipahami
// oleh developer pemula maupun senior.
type Config struct {
	// TURN/STUN untuk panggilan suara (kredensial sementara via GET /api/calls/ice-servers).
	// TURNSecret kosong = TURN nonaktif (klien hanya menerima STUN).
	TURNSecret        string
	TURNURLs          string // daftar URL dipisah koma, mis. "turn:43.157.227.115:3478?transport=udp,turn:43.157.227.115:3478?transport=tcp"
	STUNURLs          string
	TURNCredentialTTL time.Duration

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

	// User Connections & Private Profile Shield (Milestone M-Mobile-10)
	Connection ConfigConnection

	// Client Version Gatekeeper (Force Update Protection)
	MinMobileBuild int
	PlayStoreURL   string
	AppStoreURL    string

	// Info pembaruan opsional (banner "Pembaruan tersedia"); 0 = tidak ada info build terbaru
	LatestMobileBuild   int
	LatestMobileVersion string
	APKDownloadURL      string // channel "apk" (sideload); kosong -> fallback PlayStoreURL
	MobileReleaseNotes  string

	// GoogleOAuthClientIDs adalah daftar OAuth client ID (Android, iOS, Web) yang diterima sebagai audience ID token
	// Google. Kosong = login Google nonaktif (endpoint membalas 503 GOOGLE_NOT_CONFIGURED).
	GoogleOAuthClientIDs []string

	// GoogleLinkDeadline adalah batas waktu pengumuman agar akun lama menautkan akun Google (env GOOGLE_LINK_DEADLINE).
	// Zero = tidak ada batas waktu: server tidak mengumumkan kewajiban apa pun. Hanya mengatur pengumuman di klien;
	// pembekuan akun setelah batas waktu adalah fase terpisah.
	GoogleLinkDeadline time.Time

	// GoogleLinkFreeze menyalakan pembekuan akun yang belum menautkan Google setelah GoogleLinkDeadline lewat
	// (env GOOGLE_LINK_FREEZE=true). Default MATI: saklar terpisah dari tenggat sebagai kill switch. Pembekuan tidak
	// menghapus data dan berakhir begitu Google ditautkan.
	GoogleLinkFreeze bool

	// GoogleLinkFreezeExempt adalah daftar putih username yang TIDAK dibekukan walau belum menautkan Google
	// (env GOOGLE_LINK_FREEZE_EXEMPT, CSV, tidak peka huruf besar/kecil). Untuk akun yang memang tidak bisa memakai Google,
	// mis. akun demo peninjau Play Store. Kosong = tidak ada pengecualian. Berlaku hanya bila pembekuan aktif.
	GoogleLinkFreezeExempt []string

	// ModerationNotify adalah daftar saluran pemberitahuan laporan baru (env MODERATION_NOTIFY, CSV; saat ini: telegram).
	// Kosong = tanpa pemberitahuan. Token dan chat id TIDAK pernah dicatat di log.
	ModerationNotify []string
	TelegramBotToken string
	TelegramChatID   string
	// ReportEvidenceRetentionDays adalah masa simpan teks bukti dan rincian pelapor setelah laporan ditutup (env
	// REPORT_EVIDENCE_RETENTION_DAYS, bawaan 90). 0 atau negatif = tidak dihapus otomatis.
	ReportEvidenceRetentionDays int
	// ModerationAdminURL adalah alamat dasar halaman moderator yang ditautkan di pemberitahuan.
	ModerationAdminURL string
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
		MediaRetentionDays: getEnvInt("MEDIA_RETENTION_DAYS", 1), // 24 jam (1 hari) untuk multi-device media sharing grace period

		AuthRateLimitIP:   getEnvInt("AUTH_RATE_LIMIT_IP", 100),
		AuthRateLimitUser: getEnvInt("AUTH_RATE_LIMIT_USER", 15),

		MemoryWorkerInterval:    getEnvDurationSeconds("MEMORY_WORKER_INTERVAL_SECONDS", 15*time.Second),
		MemoryJobBatchSize:      getEnvInt("MEMORY_JOB_BATCH_SIZE", 5),
		SubGroupWorkerInterval:  15 * time.Minute,
		PurgeWorkerInterval:     1 * time.Hour,
		TokenCleanupInterval:    1 * time.Hour,
		SessionCleanupInterval:  1 * time.Hour,
		TransferCleanupInterval: 10 * time.Minute,

		Connection: LoadConnectionConfig(),

		TURNSecret:        getEnv("TURN_SECRET", ""),
		TURNURLs:          getEnv("TURN_URLS", ""),
		STUNURLs:          getEnv("STUN_URLS", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"),
		TURNCredentialTTL: getEnvDurationSeconds("TURN_CREDENTIAL_TTL_SECONDS", 10*time.Minute),

		MinMobileBuild: getEnvInt("MIN_MOBILE_BUILD", 1),
		PlayStoreURL:   getEnv("PLAY_STORE_URL", "https://play.google.com/store/apps/details?id=com.wuzzchat.mobile"),
		AppStoreURL:    getEnv("APP_STORE_URL", "https://apps.apple.com/app/wuzz-chat/id000000000"),

		LatestMobileBuild:   getEnvInt("LATEST_MOBILE_BUILD", 0),
		LatestMobileVersion: getEnv("LATEST_MOBILE_VERSION", ""),
		APKDownloadURL:      getEnv("APK_DOWNLOAD_URL", ""),
		MobileReleaseNotes:  getEnv("MOBILE_RELEASE_NOTES", ""),

		GoogleOAuthClientIDs: splitCSV(getEnv("GOOGLE_OAUTH_CLIENT_IDS", "")),
		GoogleLinkFreeze:     strings.EqualFold(strings.TrimSpace(os.Getenv("GOOGLE_LINK_FREEZE")), "true"),

		ModerationNotify:   splitCSV(getEnv("MODERATION_NOTIFY", "")),
		TelegramBotToken:   strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN")),
		TelegramChatID:     strings.TrimSpace(os.Getenv("TELEGRAM_CHAT_ID")),
		ModerationAdminURL: getEnv("MODERATION_ADMIN_URL", "https://chat.wuzzhub.id/admin"),

		ReportEvidenceRetentionDays: getEnvInt("REPORT_EVIDENCE_RETENTION_DAYS", 90),
	}

	for _, name := range strings.Split(os.Getenv("GOOGLE_LINK_FREEZE_EXEMPT"), ",") {
		if name = strings.ToLower(strings.TrimSpace(name)); name != "" {
			cfg.GoogleLinkFreezeExempt = append(cfg.GoogleLinkFreezeExempt, name)
		}
	}

	if raw := strings.TrimSpace(os.Getenv("GOOGLE_LINK_DEADLINE")); raw != "" {
		if deadline, err := ParseDeadline(raw); err != nil {
			// Nilai salah tidak boleh menggagalkan start server: fitur pengumuman dimatikan dan dicatat.
			log.Printf("⚠️ GOOGLE_LINK_DEADLINE=%q tidak valid (%v); pengumuman batas waktu Google dinonaktifkan", raw, err)
		} else {
			cfg.GoogleLinkDeadline = deadline
		}
	}

	return cfg, nil
}

// jakarta dipakai untuk tanggal tanpa jam: batas waktu "2026-12-31" berarti akhir hari itu menurut WIB, bukan UTC.
var jakarta = time.FixedZone("WIB", 7*60*60)

// ParseDeadline membaca batas waktu dari "YYYY-MM-DD" (berlaku sampai 23:59:59 WIB hari itu) atau RFC3339 penuh.
func ParseDeadline(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if t, err := time.ParseInLocation("2006-01-02", raw, jakarta); err == nil {
		return t.Add(24*time.Hour - time.Second), nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("gunakan format YYYY-MM-DD atau RFC3339")
}

// splitCSV memecah string dipisah koma menjadi daftar tanpa elemen kosong.
func splitCSV(v string) []string {
	var out []string
	for _, p := range strings.Split(v, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
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
