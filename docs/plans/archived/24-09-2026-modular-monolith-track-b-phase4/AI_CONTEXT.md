# AI Context — Track B: Modular Monolith Fase 4 (Group & Forum Service)

- **Target Architecture**: Clean Architecture / Pragmatic Modular Monolith (Transport → Application Service → Domain → Infrastructure).
- **Domain Boundaries**:
  - `internal/group/`: Domain model, repositories, dan Application Services (`GroupService` & `ForumService`).
  - `internal/group/infra/`: Strangler Fig Adapter yang mengimplementasikan `GroupRepository` via existing `SQLGroupStore` & `SQLUserStore`.
  - `internal/group/worker/`: Background worker pemantau masa berlaku forum/subgrup (`TTLWorker`).
  - `internal/api/`: `group_handler.go` sebagai thin HTTP transport.
- **Constraints & Safety Rules**:
  - Zero SQL schema modifications (tidak ada migrasi database atau query destruktif).
  - Backward compatibility penuh dengan API frontend (`/api/groups/...`).
  - Branch dev-only (`dev`).
  - Automated testing gate: `go test -v ./...` dan `npm run build` sebelum konfirmasi penyelesaian.
