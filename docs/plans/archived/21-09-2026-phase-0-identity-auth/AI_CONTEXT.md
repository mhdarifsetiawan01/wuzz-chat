# AI Context — Identity & Auth Phase 0 (Quick Wins)

## Codebase Boundaries
- **Project**: WuzzChat (Golang backend + Next.js frontend)
- **Active Directory**: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- **Active Branch**: `dev`
- **Target Repository**: `mhdarifsetiawan01/wuzz-chat`

## Environment Dependencies & Tools
- Go 1.22+
- SQLite (local dev & automated tests) / PostgreSQL (production)
- `golang-jwt/jwt/v5`
- `golang.org/x/crypto/bcrypt`
- `github.com/google/uuid`

## Active Constraints & Rules
- Branch `main` is strictly protected. Development only in `dev`.
- Non-destructive database migrations only (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- No breaking API changes for existing clients.
- Automated testing (`go test -v ./...` and `npm run build`) before reporting completion.
- No `git commit` until user explicitly says "selesai".
- Kill test servers immediately after use.
- Warn user about Fly.io redeployment requirement for backend changes.
