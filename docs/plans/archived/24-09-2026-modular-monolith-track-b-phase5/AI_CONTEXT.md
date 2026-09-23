# AI Context — Track B Phase 5: Memory Engine Generalization

## Workspace Information
- Target Workspace: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- Active Branch: `dev`
- Language / Tech: Go 1.22+ (Backend), Next.js 15+ / React 19 / TypeScript (Frontend), SQLite / PostgreSQL (Storage)
- Architectural Pattern: Pragmatic Modular Monolith (3-Tier: Transport -> Application Service -> Domain -> Infrastructure) with Strangler Fig Pattern

## Objective
Mengimplementasikan **Track B — Fase 5: Memory Engine Generalization (`ContextSource` Abstraction)**:
1. Memisahkan coupling kaku Memory AI dari entitas Forum/Group ke dalam bounded context baru `internal/memory/`.
2. Mengabstraksikan sumber konten percakapan via interface `ContextSource` (`ForumContextSource`, extensible untuk `DirectContextSource` & `GroupContextSource`).
3. Mengembangkan `MemoryService` (Application Service) untuk orkestrasi use case validasi, approval, penolakan, penyuntingan artefak, dan pembacaan memori terotorisasi.
4. Menjadikan `api/memory_handler.go` sebagai *thin transport*.
5. Menjaga 100% backward-compatibility untuk API frontend Next.js dan suite test yang sudah ada.
