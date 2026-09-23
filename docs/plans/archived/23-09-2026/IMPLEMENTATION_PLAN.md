# Fase 1: Pisahkan GroupStore dari SQLUserStore

## Objective
Membangun domain boundary pertama yang jelas antara Identity/Auth dan Group dengan memisahkan implementasi `GroupStore` dari `SQLUserStore`.

## Scope
- Buat `store.SQLGroupStore` baru yang mengimplementasikan `store.GroupStore`
- `SQLUserStore` tidak lagi implements `GroupStore`
- Tidak ada perubahan schema database
- Tidak ada perubahan pada Memory Engine
- Tidak ada perubahan pada WebSocket Hub
- Semua test harus tetap pass

## Target Files

### [NEW] `backend/internal/store/sql_group_store.go`
- Struct `SQLGroupStore { db *sql.DB; driverName string }`
- Mengimplementasikan seluruh `GroupStore` interface
- Copy method dari `group_store.go` yang saat ini ada di `*SQLUserStore`
- Helper internal: `touchConversation`, `IsParentMember`, `groupGroupID`

### [MODIFY] `backend/internal/store/group_store.go`
- Hapus semua `func (s *SQLUserStore)` implementations
- Tambahkan `NewSQLGroupStore(db, driverName)` constructor
- Pertahankan semua interface types dan error vars

### [MODIFY] `backend/main.go`
- Line 62: `groupStore = sqlUserStore` → `groupStore = store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())`

### [MODIFY] `backend/internal/store/group_store_test.go`
- Ubah test setup: `setupTestGroupStore` returns `*SQLGroupStore` bukan `*SQLUserStore`
- Metode test tidak berubah behavior — hanya perubahan tipe concrete

### [NO CHANGE] Semua test lain, handlers, workers, ai processor

## Verification
- `go build ./...` — 0 error
- `go test ./internal/store/... -v` — semua pass
- `go test ./internal/api/... -v` — semua pass
