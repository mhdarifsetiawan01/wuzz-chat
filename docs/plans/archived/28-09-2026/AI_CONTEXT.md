# AI Context: M-Mobile-8.29 SQLite Storage Retention Cap, Cache Pruning & Auto-Vacuum

## Workspace Boundaries
- Target Workspace: `mobile/` (React Native Expo)
- Cross-platform verification: `frontend/` (Next.js) & `backend/` (Go)
- Active branch: `dev`

## Active Constraints & Rules
- Do NOT commit before explicit user confirmation ("selesai").
- Do NOT touch `main` branch.
- Automated testing: `npx tsc --noEmit` in `mobile/`, `npm run build` in `frontend/`, `go test ./...` in `backend/`.
- Non-blocking async background pruning: UI thread must never freeze.
- Preserves memory state (`messagesByRoom` up to `MAX_CACHED_MESSAGES_PER_ROOM = 500`) and reverse infinite scroll pagination.
- SQLite pragma auto_vacuum incremental + incremental vacuum executions.
