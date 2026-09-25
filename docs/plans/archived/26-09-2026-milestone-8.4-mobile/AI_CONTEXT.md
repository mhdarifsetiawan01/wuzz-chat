# AI Context — Milestone M-Mobile-8.4: Push Notification System & Background Sync

## 1. Lingkungan & Batasan Workspace
- **Repository**: `wuzz-chat`
- **Sub-Modul Target**: `mobile/` (React Native / Expo SDK 57 / TypeScript)
- **Branch Aktif**: `dev` (STRICT: Dilarang menyentuh branch `main`)
- **Backend API**: Go REST & WebSocket Server (`POST /api/notifications/subscribe`, `POST /api/notifications/unsubscribe`)
- **Protokol Push**: Expo Push Notification Service / Native FCM & APNs endpoint routing

## 2. Dependensi Target
- `expo-notifications`: Penanganan push token, runtime permission, notification response listeners, badge management, foreground banner suppression.
- `expo-device`: Validasi apakah perangkat adalah physical device (karena push token membutuhkan physical device, bukan simulator/emulator).

## 3. Batasan Teknis & Keamanan (Zero-Knowledge)
- Server backend WuzzChat bersifat Zero-Knowledge (E2EE: `e2ee:v1:...`). Backend mengirimkan payload aman dengan fallback text `🔒 Pesan Baru (Terenkripsi)`.
- Token subscription disimpan secara terenkripsi di `secureStorage`.
- Setiap panggilan REST API menggunakan `apiClient` dengan timeout `AbortController` (15 detik).
- Foreground Suppression: Jika user sedang berada di dalam room obrolan yang sama dengan notifikasi masuk, banner pop-up diredam (`shouldShowAlert: false`) agar tidak mengganggu interaksi ketik/baca chat.
