# AI_CONTEXT.md — Active Implementation Context

- **Current Repository**: WuzzChat Engine (`wuzz-chat`)
- **Active Branch**: `dev`
- **Active Goal**: Milestone 4: Realtime & Cluster Envelope Tenant Isolation (sesuai `docs/TENANT_ENGINE_MASTER_PLAN.md` Bagian 6)
- **Primary Tech Stack**: Go 1.22+, Gorilla WebSocket, Redis Pub/Sub (`broker.MessageBroker`), SQLite/PostgreSQL, Next.js 14 (Frontend)
- **Deployment Target**: Fly.io (`chat.wuzzhub.id` & `wuzz-chat-backend.fly.dev`)
- **Target Files**:
  - `backend/internal/ws/client.go`
  - `backend/internal/ws/handler.go`
  - `backend/internal/ws/message.go`
  - `backend/internal/ws/hub.go`
  - `backend/internal/ws/hub_tenant_isolation_test.go`
- **Active Protocols**:
  - `implementation-protocol` (Active tracking in `docs/plans/active/`, wait for user approval)
  - `token-optimization-guard` (Targeted line-range reads, diff-chunk edits)
  - `Server Lifecycle Rule` (Kill test servers before responding)
  - `Protected Branch Rule` (Never commit directly to `main`, work strictly on `dev`, wait for "selesai" for dev commit)
  - `Mandatory Post-Task Automated Testing` (`go test -v ./...` & `npm run build`)
  - `Fly.io Deployment Warning Rule` (Warn user on backend changes)
