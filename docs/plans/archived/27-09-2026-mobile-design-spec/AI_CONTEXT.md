# AI Context: Pembuatan mobile/DESIGN.md

## Codebase Boundaries
- Root Workspace: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- Target Directory:
  - `mobile/DESIGN.md` [NEW]
  - `docs/context/MOBILE.md` [UPDATE Reference]
  - `docs/plans/active/` [Implementation Tracking]

## Active Constraints & Rules
- Branch: `dev` (Strict Dev-Only Work)
- Mobile Framework: React Native + TypeScript (Expo SDK 52 Managed Workflow)
- Testing Gate: `npx tsc --noEmit` di `mobile/`, `npm run build` di `frontend/`, `go test ./...` di `backend/`
- Git Gate: No commit/push without explicit confirmation ("selesai")
