# Implementation Progress — Milestone M-Mobile-8.4: Push Notification System & Background Sync

## Checklist Tugas Atomik

### Fase 1: Persiapan Dependensi & Konfigurasi Ekosistem
- [x] T1.1: Install dependensi `expo-notifications` dan `expo-device` di subdirektori `mobile/`.
- [x] T1.2: Perbarui `mobile/app.json` dengan konfigurasi plugin notifikasi Expo (icon, notification color, permissions).

### Fase 2: Service Layer & API Integration
- [x] T2.1: Buat `mobile/src/api/notifications.ts` untuk endpoint `POST /api/notifications/subscribe`, `POST /api/notifications/unsubscribe`, dan `GET /api/notifications/vapid-public-key` dengan timeout `AbortController` (15s).
- [x] T2.2: Tambahkan storage keys & helpers (`PUSH_TOKEN`, `NOTIFICATIONS_ENABLED`) di `mobile/src/services/secureStorage.ts`.
- [x] T2.3: Bangun `mobile/src/services/notificationService.ts` (request permission, token fetching, Android notification channels, badge counter synchronization, local test notification).

### Fase 3: Auth Lifecycle & Session Clean-Up Integration
- [x] T3.1: Integrasikan push subscription di `mobile/src/context/AuthContext.tsx` saat login berhasil dan auto-restore session.
- [x] T3.2: Integrasikan push unsubscription di `mobile/src/context/AuthContext.tsx` saat user logout dan saat event `SESSION_REPLACED`.

### Fase 4: Foreground Handling, Deep Linking & UI Navigation
- [x] T4.1: Integrasikan `setNotificationHandler` dinamis dengan `activeRoomId` suppression di `mobile/App.tsx`.
- [x] T4.2: Pasang `addNotificationResponseReceivedListener` dan penanganan cold-start launch via `getLastNotificationResponseAsync` di `mobile/App.tsx` untuk navigasi instan ke target DM / Group Chat.
- [x] T4.3: Buat komponen `mobile/src/components/NotificationSettingsModal.tsx` dan tambahkan tombol pengaturan di `mobile/src/screens/RecentChatsScreen.tsx`.

### Fase 5: Verifikasi Kualitas & Automated Testing Gate
- [x] T5.1: Eksekusi `npx tsc --noEmit` di subdirektori `mobile/` dan pastikan 0 error TypeScript.
- [x] T5.2: Eksekusi `go test -v ./internal/push/...` di subdirektori `backend/` untuk memastikan kompatibilitas backend.
- [x] T5.3: Lakukan review menyeluruh (Clean Architecture, error handling, token hygiene).
