package store

import (
	"fmt"
	"log"
	"os"
	"strings"
)

// NewMessageStoreFromEnv membuat MessageStore berdasarkan konfigurasi Environment.
// Mendukung:
// 1. DATABASE_URL (Supabase, Postgres, atau SQLite)
// 2. Variabel individual (DB_DRIVER, DB_HOST, DB_USER, dst)
// 3. Fallback otomatis ke In-Memory jika tidak ada database yang dikonfigurasi.
func NewMessageStoreFromEnv() (MessageStore, error) {
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	dbDriver := strings.ToLower(strings.TrimSpace(os.Getenv("DB_DRIVER")))

	// -------------------------------------------------------------
	// 1. Evaluasi dari DATABASE_URL (Format Connection String)
	// -------------------------------------------------------------
	if databaseURL != "" {
		if strings.HasPrefix(databaseURL, "postgres://") || strings.HasPrefix(databaseURL, "postgresql://") {
			log.Printf("🔌 Menghubungkan ke PostgreSQL / Supabase via DATABASE_URL...")
			return NewSQLMessageStore("postgres", databaseURL)
		}

		if strings.HasPrefix(databaseURL, "sqlite://") {
			path := strings.TrimPrefix(databaseURL, "sqlite://")
			log.Printf("🔌 Menghubungkan ke SQLite (%s) via DATABASE_URL...", path)
			return NewSQLMessageStore("sqlite", path)
		}

		if strings.HasSuffix(databaseURL, ".db") {
			log.Printf("🔌 Menghubungkan ke SQLite file (%s)...", databaseURL)
			return NewSQLMessageStore("sqlite", databaseURL)
		}
	}

	// -------------------------------------------------------------
	// 2. Evaluasi dari Parameter Individual (DB_DRIVER)
	// -------------------------------------------------------------
	switch dbDriver {
	case "postgres", "postgresql":
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5432")
		user := getEnv("DB_USER", "postgres")
		password := getEnv("DB_PASSWORD", "")
		dbName := getEnv("DB_NAME", "wuzzchat")
		sslMode := getEnv("DB_SSLMODE", "disable")

		dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, user, password, dbName, sslMode)

		log.Printf("🔌 Menghubungkan ke PostgreSQL (%s:%s/%s)...", host, port, dbName)
		return NewSQLMessageStore("postgres", dsn)

	case "sqlite":
		dbPath := getEnv("SQLITE_DB_PATH", "wuzz.db")
		log.Printf("🔌 Menghubungkan ke SQLite lokal (%s)...", dbPath)
		return NewSQLMessageStore("sqlite", dbPath)

	case "memory":
		log.Printf("🧠 Menggunakan In-Memory Message Store (DB_DRIVER=memory)")
		return NewMemoryMessageStore(), nil
	}

	// -------------------------------------------------------------
	// 3. Fallback Default: In-Memory
	// -------------------------------------------------------------
	log.Printf("🧠 Tidak ada database terkonfigurasi. Menggunakan In-Memory Store (Pesan tidak dipersist).")
	return NewMemoryMessageStore(), nil
}

func getEnv(key, defaultVal string) string {
	if val := strings.TrimSpace(os.Getenv(key)); val != "" {
		return val
	}
	return defaultVal
}
