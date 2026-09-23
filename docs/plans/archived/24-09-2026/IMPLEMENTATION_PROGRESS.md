# Implementation Progress — Track B: Modular Monolith Fase 3

## Checklist Eksekusi Bertahap

### Milestone 3.1: Messaging Domain (Entities, Repositories & SQL Adapter)
- [x] Buat `backend/internal/messaging/entity.go`
- [x] Buat `backend/internal/messaging/repository.go`
- [x] Buat `backend/internal/messaging/infra/sql_repository.go`
- [x] Verifikasi build package `backend/internal/messaging/...` (PASS)

### Milestone 3.2: Message Application Service
- [x] Buat `backend/internal/messaging/service.go`
- [x] Implementasikan use case: Edit, Delete, Forward, Pin, Unpin, GetHistory, Search, UpdateReceipt
- [x] Buat unit test `backend/internal/messaging/service_test.go`
- [x] Verifikasi `go test -v ./internal/messaging/...` (100% PASS)

### Milestone 3.3: WebSocket Hub Decoupling
- [x] Definisikan `RoomAuthorizationChecker` di `backend/internal/ws/hub.go`
- [x] Ganti `h.userStore` dengan `h.roomAuth` di `hub.go` dan `client.go`
- [x] Tambahkan `SetRoomAuth` dan pertahankan `SetUserStore` sebagai backward-compatible bridge
- [x] Verifikasi `go test -v ./internal/ws/...` (100% PASS)

### Milestone 3.4: ChatHandler Thin Transport Refactoring
- [x] Tambahkan injeksi `MessageService` di `backend/internal/api/chat_handler.go`
- [x] Refactor method handler untuk mendelegasikan use case ke `MessageService`
- [x] Verifikasi `go test -v ./internal/api/...` (100% PASS)

### Milestone 3.5: Main Wiring & Quality Audit
- [x] Wire dependensi di `backend/main.go`
- [x] Jalankan `go test -v ./...` (100% PASS)
- [x] Jalankan `npm run build` di frontend (100% PASS)
- [x] Sinkronkan `PROMPT.md`, `ROADMAP.md`, `MODULAR_MONOLITH_DDD.md`, dan `PROGRESS.md`
