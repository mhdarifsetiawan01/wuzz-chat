# Implementation Plan — Milestone 0: Codebase & Hub Prerequisite Stabilization

> 📘 **Master Architecture Reference**: Dokumen ini merupakan turunan eksekusi taktis dari master blueprint kanonikal: [`docs/TENANT_ENGINE_MASTER_PLAN.md`](../../TENANT_ENGINE_MASTER_PLAN.md).

## 1. Background & Technical Problem
Berdasarkan hasil arsitektur audit master plan, WuzzChat saat ini telah beroperasi sebagai Headless Engine mandiri (Track B DDD selesai). Namun sebelum memasuki fase Multi-Tenancy (Milestone 1–3), terdapat 3 kelemahan struktural yang dapat memicu kegagalan sistemik jika tenant diperkenalkan langsung:
1. **Hub `clientsByNick` In-Memory Collision**:
   `Hub` di `internal/ws/hub.go` memetakan klien menggunakan `clientsByNick[strings.ToLower(c.Username)]`. Jika Tenant A dan Tenant B memiliki pengguna bernama `@admin` atau `@budi`, pointer koneksi WebSocket akan saling menimpa.
2. **Identity & Search Leak / Service Bypass**:
   `ChatHandler.SearchUsers` dan `ChatHandler.GetUserProfile` memotong langsung ke `store.UserStore` tanpa melewati Application Service. Akibatnya, logika otorisasi dan penyaringan tenant tidak dapat disematkan secara terpusat.
3. **Ketiadaan Tenant Context Carrier**:
   Belum ada representasi tipe data standar untuk membawa konteks tenant pada `context.Context` Go dan pipeline HTTP.

## 2. Objectives
- Menghapus pemetaan `clientsByNick` dan mengalihkan seluruh lookup unicast real-time murni berbasis `userID` (UUID).
- Menambah kontrak `SearchUsers` dan `GetUserProfile` pada domain `authz` (`AuthService` & `AuthRepository`).
- Mengalihkan handler `SearchUsers` dan `GetUserProfile` pada `chat_handler.go` agar memanggil `AuthService`.
- Menyediakan package `backend/internal/shared/tenant/` dengan tipe `TenantContext` dan fungsi helper context.
- Menjamin seluruh test suite Go (`go test ./...`) dan build Next.js (`npm run build`) 100% PASS tanpa regresi.

## 3. Impacted Files & Packages
1. `backend/internal/ws/hub.go`:
   - Hapus field `clientsByNick map[string]*Client`.
   - Hapus registrasi dan deregistrasi pada `clientsByNick` di `registerClient()` dan `unregisterClient()`.
   - Perbarui method `findClientByIdentifier()` dan `BroadcastRoomUsers()` agar mengandalkan `userClients` (UUID) dan mapping terotentikasi.
2. `backend/internal/ws/hub_test.go` (dan test suites `ws` terkait):
   - Sesuaikan pengujian yang menguji pemanggilan via nickname agar sesuai dengan arsitektur UUID.
3. `backend/internal/authz/repository.go`:
   - Tambahkan method `SearchUsers(ctx context.Context, query, excludeUserID string) ([]UserSummary, error)`.
   - Tambahkan method `GetUserByID(ctx context.Context, userID string) (*UserProfile, error)`.
   - Tambahkan struct entitas `UserSummary` dan `UserProfile` pada `internal/authz/entity.go`.
4. `backend/internal/authz/infra/sql_repository.go`:
   - Implementasikan method baru `SearchUsers` dan `GetUserByID` mendelegasikan ke `store.UserStore`.
5. `backend/internal/authz/service.go`:
   - Tambahkan method use case `SearchUsers(ctx context.Context, query, requesterID string) ([]UserSummary, error)`.
   - Tambahkan method use case `GetUserProfile(ctx context.Context, targetID, username string) (*UserProfile, error)`.
6. `backend/internal/api/chat_handler.go`:
   - Suntikkan dependensi `authSvc *authz.AuthService` (atau via accessor).
   - Refactor `SearchUsers` dan `GetUserProfile` untuk memanggil `h.authSvc.SearchUsers` dan `h.authSvc.GetUserProfile`.
7. `backend/internal/app/wire.go`:
   - Wiring injeksi `authSvc` ke `ChatHandler`.
8. `backend/internal/shared/tenant/context.go` [NEW FILE]:
   - Tipe data `TenantContext`, `ContextKey`, fungsi `WithTenant()`, `FromContext()`, `DefaultTenant()`.
9. `backend/internal/shared/tenant/context_test.go` [NEW FILE]:
   - Unit test untuk injeksi, ekstraksi, dan fallback default context.

## 4. Verification Strategy
- **Unit & Integration Test Backend**:
  - `go test -v ./internal/ws/...`
  - `go test -v ./internal/authz/...`
  - `go test -v ./internal/api/...`
  - `go test -v ./internal/shared/tenant/...`
  - `go test -v ./...` (seluruh suite 100% PASS)
- **Frontend Build Gate**:
  - `npm run build` di direktori `frontend/` (memastikan Turbopack compile & typecheck bersih 0 error).
- **Smoke Check**:
  - Verifikasi tidak ada lagi pemanggilan `h.userStore.SearchUsers` di dalam `internal/api/chat_handler.go`.
