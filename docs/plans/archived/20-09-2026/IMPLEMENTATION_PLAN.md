# Implementation Plan — Backend Performance & Resilience Optimizations

## 🎯 Objectives
Mengoptimalkan 3 area backend berdasarkan hasil load test production:
1. **Milestone 1: Dual-Tier Auth Rate Limiter** — Kombinasi limit IP (100 req/menit) dan limit per-username (15 req/menit) untuk mencegah false-positive pada jaringan kantor/kampus (shared NAT IP) namun tetap 100% aman dari brute-force attack.
2. **Milestone 2: Database Connection Pool Tuning** — Konfigurasi `SetMaxOpenConns`, `SetMaxIdleConns`, `SetConnMaxLifetime`, `SetConnMaxIdleTime` di `backend/internal/store/sql.go`.
3. **Milestone 3: WebSocket Horizontal Scaling Preparation** — Validasi & integrasi Redis Pub/Sub Message Broker dengan WebSocket Hub untuk kesiapan multi-instance.

## 🛠️ Step-by-Step Architecture (Milestone 1: Dual-Tier Rate Limiter)
1. **Refactor `backend/internal/auth/ratelimit.go`**:
   - Definisikan `DualTierRateLimiter` dengan 2 sub-limiter: `IPRateLimiter` (100 req/min) dan `UserRateLimiter` (15 req/min).
   - Buat helper extractor username dari HTTP request body tanpa merusak `r.Body` stream untuk downstream handler (`io.NopCloser`).
   - Sediakan `DualRateLimitMiddleware(limiter *DualTierRateLimiter)`.
2. **Update Unit Test `backend/internal/auth/ratelimit_test.go`**:
   - Test IP rate limit isolation.
   - Test Username rate limit isolation (user A terblokir setelah 15x, user B di IP sama tetap bisa login).
3. **Integrasi di `backend/main.go`**:
   - Pasang `DualTierRateLimiter` pada endpoint `/api/auth/login` dan `/api/auth/register`.
