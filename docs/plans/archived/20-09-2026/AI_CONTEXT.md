# AI Context — Milestone 8.13: E2EE Device Transfer Auto-Dismiss & Immediate Backend Kick

## 🎯 Scope & Boundaries
- **Project**: Wuzz Chat
- **Active Branch**: `dev`
- **Milestone**: 8.13 — E2EE Device Transfer Auto-Dismiss, Immediate Backend WebSocket Kick & Z-Index Modal Hierarchy
- **Target Subsystems**:
  - `backend/internal/ws/hub.go` & `backend/internal/api/transfer_handler.go` (Immediate single-device kick on transfer consume)
  - `backend/main.go` (Dependency injection Hub -> TransferHandler)
  - `frontend/lib/ws-client.ts` (Global event dispatch `wuzz:session_replaced`)
  - `frontend/app/chat/DeviceTransferModal.tsx` (Auto-dismiss & success feedback on transfer completion)
  - `frontend/app/chat/DeviceConflictModal.tsx` (`var(--z-modal-top)` hierarchy fix)
  - `frontend/app/chat/ProfileModal.tsx` & `frontend/app/chat/page.tsx` (Modal lifecycle synchronization)

## 🛡️ Active Constraints
1. Work MUST strictly remain on branch `dev`.
2. Do NOT commit without explicit user confirmation ("selesai").
3. Do NOT leave server running in background.
4. Test thoroughly via `go test ./...` and `npm run build`.
5. Warn about Fly.io backend deployment requirements for backend changes.
