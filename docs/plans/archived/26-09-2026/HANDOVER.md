# Handover: FCM Push Notification & Android Notification Bar Integration

## Verification Evidence
1. **Backend Tests**: `go test ./...` passed 100% across all packages (including `internal/push` and `TestFCMv1PushProvider_Lifecycle`).
2. **Frontend Build**: `npm run build` compiled and statically generated in Next.js 16.3.5 Turbopack with 0 errors.
3. **Mobile Typecheck**: `npx tsc --noEmit` passed cleanly with 0 TypeScript/lint errors.
4. **Security**: `service-account*.json` and `backend/service-account*.json` protected in `.gitignore`.

## Changes Summary
- [x] Registrasi `google-services.json` dan izin `POST_NOTIFICATIONS` di `mobile/app.json`.
- [x] Trigger real-time Local Notification di `mobile/App.tsx` & `mobile/src/services/notificationService.ts` untuk incoming messages.
- [x] Implementasi FCM HTTP v1 Provider dengan OAuth2 assertion token signing di `backend/internal/push/fcm.go`.
