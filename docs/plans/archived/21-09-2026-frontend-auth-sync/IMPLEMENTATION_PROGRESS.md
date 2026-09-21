# Implementation Progress — Frontend Auth Alignment

- [x] Task 1: Update `frontend/lib/api.ts` (Safe 401 handling untuk `verify-password`, `change-password`, dan `public-key/reset`)
- [x] Task 2: Update `frontend/lib/crypto/keyStore.ts` (`forceResetUserE2EE` menerima & mengirim password)
- [x] Task 3: Update `frontend/app/chat/DeviceConflictModal.tsx` & `page.tsx` (Password prompt sebelum reset)
- [x] Task 4: Integrasikan form Ganti Password ke tab Security di `ProfileModal.tsx`
- [x] Task 5: Update simulation scripts (`test-two-device-simulation.mjs`, `test-android-pwa-simulation.mjs`, dll)
- [x] Task 6: Verifikasi otomatis (`npm run build` & `go test -v ./...`)

