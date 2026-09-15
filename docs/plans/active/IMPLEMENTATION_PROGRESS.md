# IMPLEMENTATION_PROGRESS.md

- [x] Task 1: Database Schema update (`key_version`, `active_device_id` di Postgres & SQLite non-destruktif)
- [x] Task 2: Backend User Store (`UpdatePublicKeyWithDevice`, `ForceResetPublicKey`) & Auth Handler (`PUT /api/users/public-key` 409 conflict, `POST /api/users/public-key/reset`)
- [x] Task 3: Backend tests pass (`go test -v ./...`)
- [x] Task 4: Frontend `keyStore.ts` update (`getOrCreateDeviceId`, detect conflict, no silent overwrite)
- [x] Task 5: Frontend `DeviceConflictModal.tsx` & integration in `page.tsx`
- [x] Task 6: Frontend build verification (`npm run build`) & Dual-platform smoke check
- [x] Task 7: Database migration: table `device_transfer_sessions` & `transfer_store.go` (atomic consume transaction)
- [x] Task 8: Backend `transfer_handler.go` & routes (`/api/users/transfer/create`, `/api/users/transfer/consume`) + unit tests
- [x] Task 9: Frontend crypto `lib/crypto/keyTransfer.ts` + install `qrcode` & `@types/qrcode`
- [x] Task 10: Frontend UI: `DeviceTransferModal.tsx` (QR generate + timer + manual token fallback), hook into `ProfileModal.tsx` and `DeviceConflictModal.tsx`, plus `/transfer` deep link page
- [x] Task 11: Verification (Go test pass, Next.js build clean, dual-platform verification) & sync all docs

