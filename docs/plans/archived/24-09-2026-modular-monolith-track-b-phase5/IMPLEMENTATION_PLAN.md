# Implementation Plan — Track B Phase 5: Memory Engine Generalization

## 1. Objectives & Architectural Blueprint
Mengubah arsitektur Memory AI dari model yang terikat kaku (*tightly coupled*) pada Forum dan Group menjadi engine mandiri berbasis `ContextSource`.

```
                  ┌───────────────────────────────────────────────┐
                  │          Transport: api.MemoryHandler         │ (Thin HTTP Transport)
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │        Application: memory.MemoryService      │ (Use Cases Orchestration)
                  └───────┬───────────────────────────────┬───────┘
                          │                               │
                          ▼                               ▼
       ┌─────────────────────────────────────┐  ┌────────────────────────────────────┐
       │     Domain: memory.MemoryRepository │  │  Domain: memory.ContextSource      │
       │         (entity.go, repository.go)  │  │         (context_source.go)        │
       └──────────────────┬──────────────────┘  └─────────────────┬──────────────────┘
                          │                                       │
                          ▼                                       ▼
       ┌─────────────────────────────────────┐  ┌────────────────────────────────────┐
       │ Infra: memory/infra.SQLRepository   │  │ Infra: group/infra.ForumSource     │
       │    (Strangler Fig wrap store)       │  │ (queries group & messaging repo)   │
       └─────────────────────────────────────┘  └────────────────────────────────────┘
```

## 2. Planned Atomic Steps
- **Step 1: Domain Entities & ContextSource (`internal/memory/`)**
  - Buat `internal/memory/entity.go`
  - Buat `internal/memory/context_source.go`
  - Buat `internal/memory/repository.go`
  - Buat `internal/memory/infra/sql_repository.go`
- **Step 2: Forum ContextSource Implementation (`internal/group/infra/`)**
  - Buat `internal/group/infra/forum_context_source.go`
- **Step 3: Refactor `MemoryProcessor` ke `ContextSource`**
  - Modifikasi `internal/ai/processor.go` untuk menerima `ContextSource`
  - Verifikasi unit test `internal/ai/service_test.go`
- **Step 4: Memory Application Service & Thin Handler**
  - Buat `internal/memory/service.go` dan `internal/memory/service_test.go`
  - Refactor `internal/api/memory_handler.go` menjadi thin transport
  - Wire ke `backend/main.go`
- **Step 5: Full Regression & Real Client Simulation**
  - Jalankan `go test -v ./...`
  - Jalankan `npm run build`
  - Eksekusi simulasi `test-memory-simulation.mjs`
