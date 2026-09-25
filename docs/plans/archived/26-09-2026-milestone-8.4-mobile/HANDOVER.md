# Handover Document — Active Workspace

## Status
- **Milestone**: M-Mobile-8.4: Push Notification System & Background Sync (Expo / FCM / APNs)
- **Status**: Implementasi & Pengujian Berhasil Lolos 100% — Menunggu Konfirmasi Selesai dari Pengguna (Phase 1)

## Bukti Hasil Pengujian
1. **Typecheck & Linter Gate (Mobile)**:
   - Command: `npx tsc --noEmit` di `mobile/`
   - Status: **EXIT 0 (PASS)** — 0 error TypeScript.
2. **Automated Unit & Integration Test Suite (Backend)**:
   - Command: `go test -v ./internal/push/...` & `go test ./...` di `backend/`
   - Status: **EXIT 0 (PASS)** — Seluruh pengujian internal push, FCM routing, dan VAPID lolos 100%.

## Daftar File yang Diubah & Dibuat
- `mobile/package.json` & `mobile/app.json`: Penambahan `expo-notifications` dan `expo-device`.
- `mobile/src/api/notifications.ts`: API endpoints untuk subscribe/unsubscribe push token.
- `mobile/src/api/index.ts`: Export `notificationsApi`.
- `mobile/src/services/secureStorage.ts`: Penambahan keys & helpers push token & notification preference.
- `mobile/src/services/notificationService.ts`: Engine terpadu notifikasi (Android channels, dynamic foreground suppression, badge count, permissions).
- `mobile/src/services/index.ts`: Export `notificationService`.
- `mobile/src/context/AuthContext.tsx`: Auto-subscribe & auto-unsubscribe pada lifecycle login, restore, logout, dan `SESSION_REPLACED`.
- `mobile/src/components/NotificationSettingsModal.tsx`: Modal preferensi notifikasi WhatsApp-style.
- `mobile/src/components/index.ts`: Export `NotificationSettingsModal`.
- `mobile/src/screens/RecentChatsScreen.tsx`: Tombol header 🔔 dan integrasi modal notifikasi.
- `mobile/App.tsx`: Active room ID synchronization (foreground suppression) dan notification tap response / cold-start listener.
