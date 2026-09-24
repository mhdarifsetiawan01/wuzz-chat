# AI Context — Milestone 5: AI Memory Context Tenant Scoping

## 1. Scope & Module Boundaries
- **Project**: WuzzChat Messaging Engine (Multi-Tenant Evolution)
- **Active Milestone**: Milestone 5 — AI Memory Context Tenant Scoping
- **Target Directories**:
  - `backend/internal/memory/` (Domain-Driven Design AI Memory module)
  - `backend/internal/memory/infra/` (SQL Repository adapter)
  - `backend/internal/store/memory_store.go` (SQL Memory Store & Queue persistence)
  - `backend/internal/store/group_store.go` & `backend/internal/store/sql_group_store.go` (Group metadata & TenantID mapping)
  - `backend/internal/group/infra/forum_context_source.go` (ContextSource implementation)
  - `backend/internal/worker/memory_worker.go` (Background job processor & claim queue)
  - `backend/internal/memory/memory_tenant_isolation_test.go` (New comprehensive isolation test suite)

## 2. Environment & Technical Stack
- Go 1.24+ Modular Monolith
- PostgreSQL (Production / Fly.io) with SQLite (Local dev & test fallback)
- Shared Tenant Context: `github.com/bms-del112/wuzz-chat/internal/shared/tenant`
- Automated test suites: `go test -v ./...` and frontend `npm run build`

## 3. Constraints & Protocols
- **Branch Hygiene**: Active branch is `dev`. Strictly no work on `main`.
- **Commit Gate**: No `git commit` until explicit user confirmation ("selesai").
- **Server Lifecycle**: Any temporary server must be shut down before ending turn.
- **Backend Warning**: Changes to Go backend require Fly.io redeploy notification.
