package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/app"
	"github.com/bms-del112/wuzz-chat/internal/shared/config"
)

// main adalah bootstrap entrypoint aplikasi backend Wuzz Chat.
// Didesain ramping (slim entrypoint) sesuai kaidah Modular Monolith & DDD:
// Memisahkan konfigurasi ke internal/shared/config, orkestrasi wiring ke internal/app/wire.go,
// serta menerapkan standar graceful shutdown Go idiomatic.
func main() {
	// 1. Muat konfigurasi terpusat (membaca file .env dan OS environment)
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("❌ Gagal memuat konfigurasi: %v", err)
	}

	// 2. Inisialisasi container Application (wiring stores, services, workers, dan handlers)
	application, err := app.New(cfg)
	if err != nil {
		log.Fatalf("❌ Gagal menginisialisasi aplikasi: %v", err)
	}
	defer application.Close()

	// 3. Setup context untuk mendengarkan sinyal OS (Graceful Shutdown)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 4. Jalankan server di goroutine terpisah
	go func() {
		if err := application.Run(); err != nil {
			log.Fatalf("❌ Server error: %v", err)
		}
	}()

	// 5. Tunggu sinyal interupsi OS untuk shutdown bersih
	<-ctx.Done()
	log.Println("🛑 Menerima sinyal shutdown, mematikan server secara graceful...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := application.Shutdown(shutdownCtx); err != nil {
		log.Printf("⚠️ Graceful shutdown error: %v", err)
	}
	log.Println("✅ Server berhenti dengan aman.")
}
