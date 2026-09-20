# Implementation Progress: Milestone 2 — Job Queue & Expiry Trigger

- [x] **M2.1**: Ekstensi `ExpireSubGroupsBatch` / trigger di `SubGroupTTLWorker` untuk membuat `ForumMemoryJob` otomatis
- [x] **M2.2**: Implementasi `MemoryJobWorker` daemon di `backend/internal/worker/memory_worker.go`
- [x] **M2.3**: Integrasi lifecycle worker di `backend/main.go` (start & graceful shutdown)
- [x] **M2.4**: Unit & Integration Test Suite di `backend/internal/worker/memory_worker_test.go`
- [x] **M2.5**: Full Test Suite Verification (`go test -v ./...` & `npm run build`)
