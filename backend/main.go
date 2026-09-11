package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
	"github.com/joho/godotenv"
)

func main() {
	// Muat konfigurasi dari file .env (jika ada)
	if err := godotenv.Load(); err != nil {
		// Log info jika .env tidak ditemukan (normal di production/container)
		log.Printf("ℹ️ File .env tidak ditemukan, membaca konfigurasi dari system environment.")
	}

	// Baca port server
	port := getEnv("PORT", "8080")
	addr := ":" + port

	// Inisialisasi storage layer
	clientStore := store.NewMemoryClientStore()

	// Inisialisasi Message Store fleksibel (SQLite, Postgres/Supabase, atau In-Memory)
	messageStore, err := store.NewMessageStoreFromEnv()
	if err != nil {
		log.Fatalf("❌ Gagal menginisialisasi message store: %v", err)
	}
	defer messageStore.Close()

	// Inisialisasi Hub dengan dependency injection
	hub := ws.NewHub(clientStore, messageStore)

	// Inisialisasi handler
	wsHandler := ws.NewHandler(hub)

	// Setup routing
	mux := http.NewServeMux()

	// Endpoint WebSocket dengan auth middleware chain
	mux.Handle("/ws", auth.Chain(wsHandler, auth.NoOp()))

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","time":"%s"}`, time.Now().UTC().Format(time.RFC3339))
	})

	// Konfigurasi HTTP server dengan timeout yang aman
	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("🚀 Wuzz Chat backend berjalan di ws://localhost%s/ws", addr)
	log.Printf("   Health check: http://localhost%s/health", addr)

	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// getEnv membaca environment variable, dengan fallback ke nilai default.
func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
