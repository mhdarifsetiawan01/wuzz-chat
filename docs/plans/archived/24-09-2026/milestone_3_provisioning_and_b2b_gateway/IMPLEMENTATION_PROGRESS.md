# IMPLEMENTATION_PROGRESS.md — Milestone 3 Task Checklist

## Tasks Breakdown
- [x] **Task 1: Additive Schema & SQL Migration**
  - [x] Tambah kolom `external_user_id` & index `idx_users_tenant_ext` pada tabel `users` di `sql.go`.
  - [x] Tambah pembuatan tabel `exchange_tokens` & index di `sql.go`.
- [x] **Task 2: Domain Entity, JWT Claims, & Repository Extensions**
  - [x] Tambah struct `ExchangeToken` di `internal/tenant/entity.go`.
  - [x] Perluas `UserClaims` dengan `DeviceID` dan buat helper JWT di `internal/auth/jwt.go`.
  - [x] Tambah method atomic `CreateExchangeToken` & `ConsumeExchangeToken` di `internal/tenant/repository.go` & `infra/sql_repository.go`.
  - [x] Tambah method `GetByExternalIDWithContext` & `UpsertExternalUserWithContext` di `internal/store/user_store.go`.
- [x] **Task 3: Service Layer (JIT Provisioning & Token Exchange)**
  - [x] Implementasikan `ProvisionUserAndToken` dan `ExchangeToken` di `internal/tenant/service.go`.
  - [x] Hubungkan Level 2 Multi-Device & Session registry saat token exchange.
- [x] **Task 4: B2B Middleware & HTTP Endpoints**
  - [x] Buat `B2BAuthGuard` di `internal/api/b2b_middleware.go`.
  - [x] Buat `ProvisioningHandler` di `internal/api/provisioning_handler.go`.
  - [x] Daftarkan endpoint `POST /api/v1/auth/provision-token` & `POST /api/v1/auth/exchange` di `internal/app/router.go`.
- [x] **Task 5: Automated Testing & Verification**
  - [x] Buat test suite komprehensif di `backend/internal/tenant/provisioning_test.go`.
  - [x] Jalankan `go test ./...` di `backend/` (100% pass across all packages).
  - [x] Jalankan `npm run build` di `frontend/` (0 errors, Next.js build success).
  - [x] Pastikan tidak ada server yang tertinggal running (`fuser -k <port>/tcp`).
