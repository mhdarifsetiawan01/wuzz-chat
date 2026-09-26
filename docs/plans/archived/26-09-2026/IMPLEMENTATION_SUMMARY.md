# Implementation Summary: Client-Side Background Decryption Push Notification (WhatsApp-Style E2EE Notif)

- **Objective**: Mengimplementasikan arsitektur push notifikasi gaya WhatsApp/Signal di mana backend mengirim `data-only` silent push (tanpa teks plaintext) dan mobile client mendekripsi pesan secara lokal di background sebelum menampilkan notifikasi ke status bar Android.
- **Status**: PLANNED — Menunggu persetujuan
- **Branch**: `dev`
- **Tanggal Rencana**: 26 September 2026

## 🎯 Tiga Pilar Utama

| Pilar | Komponen | Status |
|-------|----------|--------|
| **1. Backend: Data-Only Silent Push** | `backend/internal/push/fcm.go`, `push.go` | 🔧 Perlu modifikasi |
| **2. Mobile: Background Decryption Handler** | `mobile/src/services/notificationService.ts`, `mobile/src/services/notificationBackgroundTask.ts` (BARU) | 🆕 File baru + modifikasi |
| **3. E2EE Key Sync untuk Perangkat Baru** | `mobile/src/services/secureStorage.ts`, `mobile/src/context/AuthContext.tsx` | 🔧 Perlu modifikasi |

## 📦 Komponen yang Terlibat

### Backend (Go)
- `backend/internal/push/fcm.go`: Hapus field `Notification`, kirim payload sebagai `data-only` dengan semua field sebagai string
- `backend/internal/push/push.go`: `NotificationPayload` tetap; FCM Send hanya gunakan `data` map

### Mobile (React Native + Expo)
- `mobile/src/services/notificationBackgroundTask.ts` (BARU): Background task handler yang dekripsi lokal dan tampilkan local notification
- `mobile/src/services/notificationService.ts`: Registrasi background task handler saat launch
- `mobile/App.tsx`: Registrasi TaskManager background task

## 🔑 Keputusan Arsitektur
- **DEC-018**: FCM `data-only` payload — semua field dikirim via `data` map (string), field `notification` dan `fcmOptions` dihapus total dari FCM message untuk mencegah OS Android auto-display notifikasi server-side
- **DEC-019**: Background Task menggunakan `expo-task-manager` + `expo-notifications` headless handler; tidak perlu dependensi native baru karena sudah ada `expo-notifications: ~57.0.21`
- **DEC-020**: Private key diambil dari `expo-secure-store` di dalam background task context (tersedia sejak Expo SDK 50+, `AFTER_FIRST_UNLOCK` keychain policy)
- **DEC-021**: Fallback "🔒 Pesan Baru" tetap ditampilkan jika private key tidak ada (perangkat baru belum sync kunci)
