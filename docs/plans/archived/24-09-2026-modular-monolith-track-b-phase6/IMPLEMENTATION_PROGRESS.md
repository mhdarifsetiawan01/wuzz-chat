# Implementation Progress — Track B: Fase 6

- [x] **Task 1: Sentralisasi Konfigurasi (`internal/shared/config`)**
  - [x] Implementasikan `Config` struct dan `Load()` di `backend/internal/shared/config/config.go`
  - [x] Tulis unit tests di `backend/internal/shared/config/config_test.go`
  - [x] Verifikasi `go test ./internal/shared/config/...` PASS

- [x] **Task 2: Sentralisasi Background Cleaner Worker (`internal/authz/worker`)**
  - [x] Implementasikan `AuthCleanupWorker` di `backend/internal/authz/worker/cleaner_worker.go`
  - [x] Tulis unit tests di `backend/internal/authz/worker/cleaner_worker_test.go`
  - [x] Verifikasi `go test ./internal/authz/worker/...` PASS

- [x] **Task 3: Application Container & Dependency Wiring (`internal/app/wire.go`)**
  - [x] Buat struct `Application` beserta constructor `New(cfg)` di `backend/internal/app/wire.go`
  - [x] Implementasikan lifecycle methods: `Run()`, `Shutdown()`, `Close()`
  - [x] Tulis unit test di `backend/internal/app/app_test.go`
  - [x] Verifikasi `go test ./internal/app/...` PASS

- [x] **Task 4: Pemisahan Router Registration (`internal/app/router.go`)**
  - [x] Pindahkan registrasi mux ke `setupRouter()` di `backend/internal/app/router.go`
  - [x] Rapikan per domain fungsional dengan middleware CORS dan auth

- [x] **Task 5: Refactoring Slim Entrypoint (`backend/main.go`)**
  - [x] Pangkas `backend/main.go` menjadi file bootstrap tipis (< 60 baris) dengan graceful shutdown
  - [x] Verifikasi `go build -o /dev/null main.go` PASS

- [x] **Task 6: Verification & Quality Gate**
  - [x] Eksekusi `go test -count=1 ./...` di backend (100% PASS seluruh package)
  - [x] Eksekusi `npm run build` di frontend (100% PASS, 8/8 routes prerendered)
  - [x] Pastikan tidak ada port server yang tertinggal berjalan (`fuser -k`)
