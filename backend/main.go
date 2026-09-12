package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/storage"
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
	// Inisialisasi User Store dari SQL DB
	var userStore store.UserStore
	if sqlStore, ok := messageStore.(*store.SQLMessageStore); ok {
		userStore = store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	}

	// Inisialisasi REST Handlers
	var authHandler *api.AuthHandler
	var chatHandler *api.ChatHandler
	if userStore != nil {
		authHandler = api.NewAuthHandler(userStore)
		chatHandler = api.NewChatHandler(userStore, messageStore)
	}

	// Inisialisasi Media Storage & Handler
	mediaStorage, err := storage.NewMediaStorageFromEnv()
	if err != nil {
		log.Printf("⚠️ Gagal inisialisasi media storage: %v", err)
	}
	mediaHandler := api.NewMediaHandler(mediaStorage, messageStore)

	// Inisialisasi Purge Worker untuk membersihkan file media kedaluwarsa (TTL)
	retentionDays := 7
	if envDays := os.Getenv("MEDIA_RETENTION_DAYS"); envDays != "" {
		if val, err := strconv.Atoi(envDays); err == nil && val >= 0 {
			retentionDays = val
		}
	}
	purgeWorker := storage.NewPurgeWorker(mediaStorage, messageStore, retentionDays, 1*time.Hour)
	purgeWorker.Start()
	defer purgeWorker.Stop()

	// Inisialisasi Hub dengan dependency injection
	hub := ws.NewHub(clientStore, messageStore)
	if userStore != nil {
		hub.SetUserStore(userStore)
	}

	// Inisialisasi handler WebSocket
	wsHandler := ws.NewHandler(hub)

	// Setup routing
	mux := http.NewServeMux()

	// Inisialisasi Rate Limiter untuk Auth Endpoint (15 request / menit per IP untuk anti-brute force)
	authLimiter := auth.NewIPRateLimiter(15, 1*time.Minute)

	// Helper CORS Middleware untuk REST API
	corsOrigin := os.Getenv("CORS_ALLOWED_ORIGIN")
	if corsOrigin == "" {
		corsOrigin = "*"
	}

	withCORS := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", corsOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}
			h(w, r)
		}
	}

	// Media Storage & Dynamic Config Routes
	mux.HandleFunc("/api/config", withCORS(mediaHandler.Config))
	mux.HandleFunc("/api/media/upload", withCORS(func(w http.ResponseWriter, r *http.Request) {
		auth.RequireJWT()(http.HandlerFunc(mediaHandler.Upload)).ServeHTTP(w, r)
	}))
	mux.HandleFunc("/api/media/ack", withCORS(func(w http.ResponseWriter, r *http.Request) {
		auth.RequireJWT()(http.HandlerFunc(mediaHandler.AcknowledgeDownload)).ServeHTTP(w, r)
	}))

	// Serving file statis jika menggunakan Local Storage
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = storage.EnsureDir(uploadDir)
	fileServer := http.FileServer(http.Dir(uploadDir))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("Access-Control-Allow-Origin", corsOrigin)
		fileServer.ServeHTTP(w, r)
	})))

	// REST API Routes (Auth) dengan Rate Limiting
	if authHandler != nil {
		mux.HandleFunc("/api/auth/register", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RateLimitMiddleware(authLimiter)(http.HandlerFunc(authHandler.Register)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/login", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RateLimitMiddleware(authLimiter)(http.HandlerFunc(authHandler.Login)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/me", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(authHandler.Me)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/profile", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(authHandler.UpdateProfile)).ServeHTTP(w, r)
		}))
	}

	// REST API Routes (Chat & Users)
	if chatHandler != nil {
		mux.HandleFunc("/api/users/search", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(chatHandler.SearchUsers)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/users/profile", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(chatHandler.GetUserProfile)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/conversations", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(chatHandler.StartDirectChat)).ServeHTTP(w, r)
			} else {
				auth.RequireJWT()(http.HandlerFunc(chatHandler.GetConversations)).ServeHTTP(w, r)
			}
		}))
	}

	// Endpoint WebSocket
	mux.Handle("/ws", wsHandler)

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
