# AI Context — Frontend Auth Alignment (Phase 0 Synchronization)

## Codebase Boundaries
- **Project**: WuzzChat (Next.js Frontend)
- **Active Directory**: `/home/bms-del112/BMS/personal-project/wuzz-chat/frontend`
- **Active Branch**: `dev`

## Active Constraints & Goals
- Update `apiRequest` in `frontend/lib/api.ts` to distinguish between token revocation (401) and credential validation failures (`verify-password`, `change-password`, `public-key/reset`) so user is not inadvertently auto-logged out.
- Update `forceResetUserE2EE` in `frontend/lib/crypto/keyStore.ts` to accept `password` and send to `POST /api/users/public-key/reset`.
- Update `DeviceConflictModal.tsx` to prompt user for password verification before resetting the device key.
- Add `ChangePasswordModal` / security tab password change in `frontend/app/chat/ProfileModal.tsx`.
- Update test simulation scripts (`test-two-device-simulation.mjs`, etc.) to pass `password`.
- Verify full frontend build (`npm run build`).
- Verify full backend tests (`go test -v ./...`).
