# Implementation Progress — Track B: Modular Monolith Fase 4

- [x] **Milestone 1: Domain Entities & Repository Contracts**
  - [x] Buat `backend/internal/group/entity.go`
  - [x] Buat `backend/internal/group/repository.go`
  - [x] Buat `backend/internal/group/infra/sql_repository.go`

- [x] **Milestone 2: Application Services (`GroupService` & `ForumService`)**
  - [x] Definisikan `GroupBroadcaster` & `GroupNotifier` interfaces
  - [x] Implementasikan `GroupService` (CRUD grup & member management)
  - [x] Implementasikan `ForumService` (Subgroup lifecycle & join requests)
  - [x] Implementasikan `backend/internal/group/worker/ttl_worker.go`

- [x] **Milestone 3: Unit Testing Suite**
  - [x] Buat `backend/internal/group/service_test.go`
  - [x] Verifikasi semua unit tests lulus (`go test -v ./internal/group/...`)

- [x] **Milestone 4: Thin Transport Handler Refactoring**
  - [x] Refactor `backend/internal/api/group_handler.go` agar memanggil services
  - [x] Hubungkan wiring di `backend/main.go`
  - [x] Jalankan integration test `api/group_handler_test.go`

- [x] **Milestone 5: Full Regression Testing & Verification**
  - [x] Backend test suite: `go test -v ./...` (100% PASS)
  - [x] Frontend build: `npm run build` (100% PASS)

