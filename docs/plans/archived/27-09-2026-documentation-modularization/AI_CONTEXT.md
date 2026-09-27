# AI Context: Restrukturisasi & Modularisasi Dokumen Konteks (docs/context/)

## Codebase Boundaries
- Root Workspace: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- Target Directories:
  - `PROMPT.md` (Root router primer)
  - `docs/context/` (New directory for domain primers)
  - `docs/PROJECT_STATE.md` (Minor sync of mobile table)
  - `docs/plans/active/` (Implementation tracking)

## Active Branch & Constraints
- Branch: `dev` (Strict Dev-Only Work)
- Server Lifecycle: No live servers needed for documentation restructuring
- Testing Gate: Run `go test ./...` in `backend/` and `npm run build` in `frontend/` to ensure no workspace regressions
- Git Gate: No commits or pushes without explicit user confirmation ("selesai")
