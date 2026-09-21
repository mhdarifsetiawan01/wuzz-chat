# AI Context — Phase 1: Session Foundation & Remote Logout

## Boundary & Target Repository
- Repository: `wuzz-chat` (Monorepo)
- Active Branch: `dev`
- Scope: Backend Golang (`internal/store`, `internal/auth`, `internal/api`, `main.go`) & Frontend Next.js (`frontend/app/chat/ProfileModal.tsx`)

## Technical Constraints & Global Rules
- **Branch Protection**: Strict work on `dev` only. Never touch `main`.
- **Database Non-Destruction**: Add `sessions` table without dropping or modifying existing tables.
- **Server Lifecycle**: Any temporary verification server must be killed (`fuser -k <port>/tcp`).
- **Dual-Platform & Design System**: Responsive UI on mobile & desktop, compliance with `DESIGN.md` tokens.
- **Verification Gate**: `npm run build` and `go test -v ./...` mandatory before requesting user sign-off.
