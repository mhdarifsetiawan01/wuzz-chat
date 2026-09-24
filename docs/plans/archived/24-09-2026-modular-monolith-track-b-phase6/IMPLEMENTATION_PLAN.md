# Implementation Plan: Track B — Fase 6 (Cleanup & Slim Entrypoint Wiring)

## 1. Overview
Fase 6 adalah tahap final dari Transformasi Modular Monolith & DDD Engine (Track B). Tujuannya adalah merapikan entrypoint `backend/main.go` yang sebelumnya memuat 598 baris kode campuran (config, wiring, goroutine background, HTTP router, server loop) menjadi arsitektur yang bersih, modular, dan sangat mudah dipahami oleh programmer junior sekalipun.

## 2. Architecture Decisions
- **DEC-01 (Shared Config Package)**: Buat `backend/internal/shared/config/config.go` dengan struct `Config` terpadu untuk memuat seluruh environment variables dengan default value yang aman dan transparan.
- **DEC-02 (Centralized App Container & Wiring)**: Buat `backend/internal/app/wire.go` (`Application` struct) yang menampung komponen aplikasi (stores, broker, services, workers, hub, http.Server) dan mengorkestrasi dependency injection secara sekuensial.
- **DEC-03 (Separated Router Module)**: Buat `backend/internal/app/router.go` untuk memetakan seluruh route HTTP mux per domain fungsional (Auth, Media, Direct/Group Chat, Groups, Memory AI, Push, WebSocket, Health).
- **DEC-04 (Encapsulated Background Auth Cleanup Worker)**: Buat `backend/internal/authz/worker/cleaner_worker.go` dengan interface lifecycle `Start()` dan `Stop()`, menggantikan goroutine `go func() { ticker... }` yang berceceran di `main.go`.
- **DEC-05 (Idiomatic Graceful Shutdown)**: Gunakan `signal.NotifyContext` dengan `os.Interrupt` dan `syscall.SIGTERM`, serta `server.Shutdown(ctx)` untuk memastikan koneksi HTTP dan WebSocket tertutup bersih saat server dimatikan.
- **DEC-06 (Dockerfile & Build Preservation)**: Tetap pertahankan `backend/main.go` sebagai binary entrypoint agar perintah `go run main.go`, `go build ... main.go`, dan Dockerfile build tidak mengalami breaking changes.

## 3. Task Breakdown (Vertical Slices)

### Task 1: Sentralisasi Konfigurasi (`internal/shared/config/`)
- [ ] Buat file `backend/internal/shared/config/config.go`
- [ ] Definisikan struct `Config` (Server, Auth, Media, RateLimit, MemoryWorker, Broker)
- [ ] Implementasikan `Load() (*Config, error)` dengan fallback default
- [ ] Tulis unit test `backend/internal/shared/config/config_test.go`
- **Verifikasi**: `go test -v ./internal/shared/config/...` PASS.

### Task 2: Sentralisasi Background Cleaner Worker (`internal/authz/worker/`)
- [ ] Buat file `backend/internal/authz/worker/cleaner_worker.go`
- [ ] Implementasikan `AuthCleanupWorker` yang mengelola ticker cleanup untuk token expired, session expired, dan transfer session expired
- [ ] Sediakan method `Start()` dan `Stop()` menggunakan `chan struct{}`
- [ ] Tulis unit test `backend/internal/authz/worker/cleaner_worker_test.go`
- **Verifikasi**: `go test -v ./internal/authz/worker/...` PASS.

### Task 3: Application Container & Dependency Wiring (`internal/app/wire.go`)
- [ ] Buat file `backend/internal/app/wire.go`
- [ ] Definisikan struct `Application`
- [ ] Implementasikan constructor `New(cfg *config.Config) (*Application, error)` dengan 7 tahap wiring berurutan:
  1. Storage Layer (ClientStore, MessageStore, SQL Stores)
  2. Infrastructure Layer (MessageBroker, CORS, PushService, MediaStorage)
  3. Domain Repositories & Adapters (AuthRepo, MessagingRepo, GroupRepo, MemoryRepo, ContextSource)
  4. Application Services (AuthService, MessagingService, GroupService, ForumService, MemoryService)
  5. Background Workers (SubGroupTTLWorker, PurgeWorker, MemoryJobWorker, AuthCleanupWorker)
  6. Transport Handlers (AuthHandler, ChatHandler, GroupHandler, MemoryHandler, MediaHandler, etc.)
  7. WebSocket Hub & Handlers
- [ ] Implementasikan lifecycle methods: `Run() error`, `Shutdown(ctx context.Context) error`, dan `Close() error`.

### Task 4: Pemisahan Router Registration (`internal/app/router.go`)
- [ ] Buat file `backend/internal/app/router.go`
- [ ] Implementasikan `setupRouter() http.Handler` di dalam `Application`
- [ ] Pindahkan 50+ route HTTP mux dengan pengelompokan rapi dan middleware CORS / JWT / RateLimit yang jelas.

### Task 5: Refactoring Slim Entrypoint (`backend/main.go`)
- [ ] Rampingkan `backend/main.go` menjadi file bootstrap tipis (< 60 baris)
- [ ] Pasang `config.Load()`, `app.New(cfg)`, `application.Run()`, serta graceful shutdown `signal.NotifyContext`.

### Task 6: Comprehensive Automated Verification & Quality Gate
- [ ] Jalankan automated backend testing: `go test -v ./...`
- [ ] Jalankan automated frontend verification: `npm run build`
- [ ] Verifikasi kelulusan kompilasi build binary: `go build -o /dev/null main.go`
- [ ] Pastikan tidak ada server yang tertinggal berjalan (`fuser -k`).

## 4. Risks & Mitigations
| Risk | Severity | Mitigation |
|---|---|---|
| Mismatch route path atau HTTP method saat memindahkan router | 🟡 Medium | Salin dan verifikasi satu per satu mapping route, jalankan seluruh test suite |
| Lifecycle background worker bocor atau tidak berhenti saat shutdown | 🟢 Low | Gunakan pattern `chan struct{}` dan `defer worker.Stop()` di `Application.Close()` |
| Dockerfile build gagal | 🟢 Low | `main.go` tetap berada di root `backend/` sehingga `go build ... main.go` di Dockerfile tetap valid |
