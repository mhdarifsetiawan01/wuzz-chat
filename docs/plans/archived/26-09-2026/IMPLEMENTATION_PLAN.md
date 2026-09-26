# Implementation Plan: FCM Push Notification & Android Notification Bar Integration

## 1. Objectives
1. Mengamankan file credentials (`service-account.json`) di `.gitignore`.
2. Menghubungkan `google-services.json` dan menambahkan izin `POST_NOTIFICATIONS` di `mobile/app.json`.
3. Mengoptimalkan registrasi push token di `mobile/src/services/notificationService.ts` untuk mengambil native FCM device token.
4. Menambahkan trigger Local Notification pada `RecentChatsScreen.tsx` dan `App.tsx` saat pesan baru diterima dari WebSocket untuk room yang sedang tidak dibuka.
5. Mengimplementasikan FCM HTTP v1 Provider di Go Backend (`backend/internal/push/`) untuk mengirim push notifikasi resmi Google saat penerima offline.
6. Verifikasi pengujian otomatis (`go test ./...` dan `npm run build`).

## 2. Target Files
- `/.gitignore` & `/mobile/.gitignore`
- `/mobile/app.json`
- `/mobile/src/services/notificationService.ts`
- `/mobile/src/screens/RecentChatsScreen.tsx`
- `/backend/internal/push/push.go`
- `/backend/internal/push/fcm.go` (FCM HTTP v1 implementation)
- `/backend/internal/push/fcm_test.go`
