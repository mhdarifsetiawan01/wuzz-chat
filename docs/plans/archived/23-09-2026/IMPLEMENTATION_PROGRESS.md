# Progress: Fase 1 — Pisahkan GroupStore dari SQLUserStore

## Status: COMPLETED (Awaiting User Confirmation)

- [x] Audit dependency aktual SQLUserStore implements GroupStore
- [x] Identifikasi semua method yang perlu dipindah (22 method)
- [x] Buat `store/sql_group_store.go` dengan `SQLGroupStore`
- [x] Refactor `store/group_store.go` — hapus SQLUserStore implementations, simpan interface & entity types murni
- [x] Update `main.go` — ganti wiring ke `store.NewSQLGroupStore`
- [x] Update `store/group_store_test.go` — ganti concrete type ke `SQLGroupStore`
- [x] Sesuaikan test suite dependan (`worker`, `ws`, `api`, `ai`) yang sebelumnya mengoper `SQLUserStore` ke interface `GroupStore`
- [x] `go build ./...` → 0 error
- [x] `go test -count=1 ./...` → 100% pass (semua package)
- [x] `frontend: npm run build` → 0 error / clean build

