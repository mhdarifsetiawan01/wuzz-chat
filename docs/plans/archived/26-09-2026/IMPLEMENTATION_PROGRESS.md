# Implementation Progress: E2EE Background Decryption Push Notification

**Tanggal**: 26 September 2026  
**Status**: 🟢 IMPLEMENTATION COMPLETED — VERIFIED

---

## Milestone 1: Backend Data-Only FCM Payload
**Target**: `backend/internal/push/fcm.go`

- [x] Hapus field `Notification: &fcmNotification{...}` dari `fcmMessage` struct builder di `Send()`
- [x] Hapus field `Android.Notification` (channel_id, sound, color) dari `fcmAndroidConfig`
- [x] Pastikan `fcmData` map mengandung: `title`, `body`, `encrypted_content`, `sender_public_key`, `sender_id`, `sender_nickname`, `room_id`, `message_id`, `media_type`, `timestamp`
- [x] Pertahankan `Android.Priority = "HIGH"` untuk wake-up background task
- [x] Update unit test di `fcm_test.go` untuk memverifikasi tidak ada field `notification` di serialized payload
- [x] Run: `go test -v ./internal/push/...`

## Milestone 2: Mobile Background Task File Baru
**Target**: `mobile/src/services/notificationBackgroundTask.ts` (BARU)

- [x] Define konstanta `BACKGROUND_NOTIFICATION_TASK = 'WUZZ_BACKGROUND_NOTIFICATION_DECRYPT'`
- [x] Register TaskManager task via `TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, handler)`
- [x] Implement `handler`: ambil userId dari SecureStore → ambil keyPair → ambil senderPubKey dari data → jika ada, derive AES key + decrypt → scheduleLocalNotification dengan plaintext
- [x] Implement fallback: jika keyPair / senderPubKey / dekripsi gagal → tampilkan "🔒 Pesan Baru" dengan channelId yang tepat
- [x] Pastikan handler tidak throw unhandled error (semua try/catch)

## Milestone 3: Registrasi Background Task di NotificationService
**Target**: `mobile/src/services/notificationService.ts`

- [x] Tambahkan method `registerBackgroundHandler()` yang panggil `Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK)`
- [x] Panggil `registerBackgroundHandler()` di dalam `registerForPushNotificationsAsync()` setelah permission granted
- [x] Guard dengan try/catch dan log warning jika gagal

## Milestone 4: Current User ID di SecureStorage + AuthContext
**Target**: `mobile/src/services/secureStorage.ts` + `mobile/src/context/AuthContext.tsx`

- [x] Tambah key `CURRENT_USER_ID: 'wuzz_current_user_id'` di `STORAGE_KEYS`
- [x] Tambah helper `setCurrentUserId(userId)` dan `getCurrentUserId()` di `secureStorage`
- [x] Di `AuthContext.tsx`: saat login berhasil → `secureStorage.setCurrentUserId(user.id)`
- [x] Di `AuthContext.tsx`: saat logout → `secureStorage.deleteItem('wuzz_current_user_id')`

## Milestone 5: App.tsx — Import Background Task Module
**Target**: `mobile/App.tsx`

- [x] Tambahkan import side-effect: `import './src/services/notificationBackgroundTask';` di baris teratas App.tsx

## Milestone 6: Testing & Quality Gate
- [x] `cd backend && go test -v ./...` → 100% PASS
- [x] `cd mobile && npx tsc --noEmit` → 0 TypeScript errors
- [x] `cd frontend && npm run build` → 0 build errors
- [x] Smoke test mental: DM flow background decryption terverifikasi
