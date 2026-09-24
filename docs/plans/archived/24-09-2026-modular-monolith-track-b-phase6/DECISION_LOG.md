# Decision Log — Track B: Fase 6

## DEC-01: Shared Config Package (`internal/shared/config`)
- **Status**: Proposed
- **Context**: Environment variables saat ini diparse secara manual dan tersebar di berbagai baris `backend/main.go`.
- **Decision**: Memusatkan pembacaan environment variables ke dalam struct `Config` terpadu dengan default value yang aman dan transparan, sehingga memudahkan pengujian unit dan isolasi konfigurasi.

## DEC-02: Application Struct as Orchestrator Container (`internal/app/wire.go`)
- **Status**: Proposed
- **Context**: `main.go` memiliki 598 baris yang mengawinkan puluhan komponen secara imperatif.
- **Decision**: Memisahkan wiring ke `internal/app/wire.go` dalam bentuk struct `Application` dengan constructor `New(cfg)` yang menginisialisasi komponen dari layer terdalam (Store/Infra) hingga layer terluar (Handlers/Hub).

## DEC-03: Modular Router (`internal/app/router.go`)
- **Status**: Proposed
- **Context**: 50+ HTTP endpoints terdaftar secara linear di `main.go`, mengaburkan batas antar domain.
- **Decision**: Memisahkan registrasi route ke method `setupRouter() http.Handler` di dalam paket `internal/app`, dikelompokkan berdasarkan modul domain fungsional.

## DEC-04: Background Cleaner Worker Encapsulation (`internal/authz/worker`)
- **Status**: Proposed
- **Context**: Terdapat 3 goroutine ticker pembersih token, session, dan transfer session yang dijalankan di `main.go` tanpa mekanisme graceful stop.
- **Decision**: Mengemasnya ke dalam `AuthCleanupWorker` yang memiliki method `Start()` dan `Stop()`, dipanggil bersamaan dengan worker lainnya.

## DEC-05: Standard Library Graceful Shutdown
- **Status**: Proposed
- **Context**: Menghentikan server sebelumnya hanya mengandalkan termination paksa.
- **Decision**: Menggunakan `signal.NotifyContext` dengan `os.Interrupt` dan `syscall.SIGTERM`, serta `http.Server.Shutdown(ctx)` dengan timeout 10 detik untuk memastikan graceful shutdown koneksi WebSocket dan HTTP.
