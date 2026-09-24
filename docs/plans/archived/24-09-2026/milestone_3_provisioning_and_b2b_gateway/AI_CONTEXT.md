# AI_CONTEXT.md — Active Implementation Context

- **Current Repository**: WuzzChat Engine (`wuzz-chat`)
- **Active Branch**: `dev`
- **Active Goal**: Milestone 3: External Provisioning & B2B Auth Gateway (sesuai `docs/TENANT_ENGINE_MASTER_PLAN.md` Bagian 5)
- **Primary Tech Stack**: Go 1.22+, PostgreSQL & SQLite (dual-driver), Gorilla WebSocket, golang-jwt/v5, Next.js 14 (Frontend)
- **Deployment Target**: Fly.io (`chat.wuzzhub.id` & `wuzz-chat-backend.fly.dev`)
- **Active Protocols**:
  - `implementation-protocol` (Active tracking in `docs/plans/active/`, wait for user approval)
  - `token-optimization-guard` (Targeted line-range reads, diff-chunk edits)
  - `database-safety-and-protection` (Additive schema only, no drops/truncates)
  - `Server Lifecycle Rule` (Kill test servers before responding)
  - `Protected Branch Rule` (Never commit directly to `main`, wait for "selesai" for dev commit)
