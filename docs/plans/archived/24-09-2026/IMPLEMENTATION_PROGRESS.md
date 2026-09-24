# Implementation Progress — Milestone 0: Prerequisite Stabilization

## Active Task Checklist

### Task 0.1: Tenant Context Carrier Abstraction
- [x] Buat package `backend/internal/shared/tenant/context.go`.
- [x] Implementasikan struct `TenantContext`, `WithTenant(ctx, tenantID)`, `FromContext(ctx)`, `DefaultTenant()`.
- [x] Buat unit test `backend/internal/shared/tenant/context_test.go` untuk coverage 100%.

### Task 0.2: Hub In-Memory UUID Purification
- [x] Hapus field `clientsByNick map[string]*Client` dari struct `Hub` di `backend/internal/ws/hub.go`.
- [x] Hapus inisialisasi, registrasi, dan deregistrasi `clientsByNick` di lifecycle Hub.
- [x] Perbarui method pencarian klien dan unicast agar murni menggunakan `h.userClients[userID]` (UUID) atau identifier terotentikasi.
- [x] Jalankan `go test -v ./internal/ws/...` dan perbarui test suite jika ada yang masih mereferensikan nickname mapping.

### Task 0.3: Identity & User Lookup Encapsulation di Domain `authz`
- [x] Definisikan struct `UserSummary` dan `UserProfile` di `backend/internal/authz/entity.go`.
- [x] Tambahkan method `SearchUsers` dan `GetUserProfile` pada interface `AuthRepository` di `backend/internal/authz/repository.go`.
- [x] Implementasikan method tersebut pada adapter SQL `backend/internal/authz/infra/sql_repository.go`.
- [x] Tambahkan use case `SearchUsers` dan `GetUserProfile` pada `backend/internal/authz/service.go`.
- [x] Tambahkan unit test pada `backend/internal/authz/service_test.go`.

### Task 0.4: ChatHandler Refactor & Wire Injection
- [x] Tambahkan dependensi `authSvc *authz.AuthService` pada `ChatHandler` di `backend/internal/api/chat_handler.go`.
- [x] Refactor `SearchUsers(w, r)` untuk memanggil `h.authSvc.SearchUsers(r.Context(), query, claims.UserID)`.
- [x] Refactor `GetUserProfile(w, r)` untuk memanggil `h.authSvc.GetUserProfile(r.Context(), userID, username)`.
- [x] Update dependency injection di `backend/internal/app/wire.go` (`NewChatHandlerWithService`).
- [x] Jalankan unit test `backend/internal/api/...`.

### Task 0.5: Automated Verification & Documentation Synchronization
- [x] Jalankan `go test -v ./...` di direktori `backend/` (Wajib 100% PASS).
- [x] Jalankan `npm run build` di direktori `frontend/` (Wajib 0 error Turbopack / TypeScript).
- [x] Sinkronkan `docs/plans/active/HANDOVER.md` dan `docs/PROGRESS.md`.
