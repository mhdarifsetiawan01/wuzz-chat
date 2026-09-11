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
)

func main() {
	// Baca konfigurasi dari environment variable, dengan default untuk development.
	port := getEnv("PORT", "8080")
	addr := ":" + port

	// Inisialisasi storage layer (in-memory untuk fase 1).
	// Fase 2: ganti dengan NewRedisClientStore(...) tanpa ubah kode di bawah ini.
	clientStore := store.NewMemoryClientStore()
	messageStore := store.NewMemoryMessageStore()

	// Inisialisasi Hub dengan dependency injection
	hub := ws.NewHub(clientStore, messageStore)

	// Inisialisasi handler
	wsHandler := ws.NewHandler(hub)

	// Setup routing
	mux := http.NewServeMux()

	// Endpoint WebSocket dengan auth middleware chain.
	// Fase 1: NoOp middleware (pass-through).
	// Fase 2: ganti auth.NoOp() dengan auth.JWT(secretKey) tanpa ubah baris lain.
	mux.Handle("/ws", auth.Chain(wsHandler, auth.NoOp()))

	// Health check endpoint — berguna untuk load balancer / Docker healthcheck
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
	log.Printf("   Mode: fase-1 (in-memory, anonim, 1-on-1)")

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
