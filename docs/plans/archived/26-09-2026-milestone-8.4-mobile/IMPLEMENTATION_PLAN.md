# Implementation Plan — Milestone M-Mobile-8.4: Push Notification System & Background Sync

## 1. Tujuan
Membangun arsitektur push notification yang andal, aman, hemat baterai, dan ramah privasi (Zero-Knowledge) pada klien mobile WuzzChat menggunakan Expo Notifications, terintegrasi penuh dengan Go Backend WebSocket & Push Service (`/api/notifications/subscribe` & `/api/notifications/unsubscribe`).

---

## 2. File yang Dibuat & Dimodifikasi

### File Baru:
1. `mobile/src/api/notifications.ts`:
   - Endpoint client untuk `subscribe(payload)`, `unsubscribe(payload)`, dan `getVapidPublicKey()`.
   - Menggunakan `apiClient` dengan timeout `AbortController` (15 detik).
2. `mobile/src/services/notificationService.ts`:
   - Engine terpadu: `registerForPushNotificationsAsync()`, `subscribeDevice()`, `unsubscribeDevice()`, `setupForegroundHandler()`, `setBadgeCount()`, `clearBadge()`, `scheduleLocalNotification()`.
   - Android Notification Channels setup (sound, vibration pattern, priority high).
   - Guard simulator vs physical device dengan `expo-device`.
3. `mobile/src/components/NotificationSettingsModal.tsx`:
   - Modal WhatsApp-style untuk mengatur preferensi notifikasi (Toggle Push Notifikasi, Pratinjau Pesan, Test Kirim Notifikasi Lokal, Cek Izin Sistem OS).

### File Dimodifikasi:
1. `mobile/package.json`:
   - Menambahkan dependensi `expo-notifications` dan `expo-device`.
2. `mobile/app.json`:
   - Menambahkan konfigurasi plugin `expo-notifications` (icon, color, permissions) untuk iOS & Android.
3. `mobile/src/services/secureStorage.ts`:
   - Menambahkan key `PUSH_TOKEN` dan `NOTIFICATIONS_ENABLED` beserta getter/setter/deleter.
4. `mobile/src/services/index.ts`:
   - Export `notificationService`.
5. `mobile/src/api/index.ts`:
   - Export `notificationsApi`.
6. `mobile/src/context/AuthContext.tsx`:
   - Integrasi auto-subscribe push token saat login berhasil atau saat sesi tersimpan di-restore.
   - Integrasi auto-unsubscribe ke backend saat `logout()` atau saat event `SESSION_REPLACED` dipicu.
7. `mobile/App.tsx`:
   - Inisialisasi notification channels dan response listener (`addNotificationResponseReceivedListener`).
   - Penanganan deep linking saat notifikasi di-tap (navigasi langsung ke `ChatScreen` dengan ID room tujuan).
   - Pengaturan `activeRoomId` tracker pada foreground notification handler agar tidak menampilkan banner pop-up saat user berada di dalam room yang sama.
8. `mobile/src/screens/RecentChatsScreen.tsx`:
   - Tombol ikon lonceng/pengaturan notifikasi pada header untuk membuka `NotificationSettingsModal`.

---

## 3. Detail Arsitektur Teknis

### A. Lifecycle Registrasi Push Token
```text
[App Start / Login]
       │
       ▼
[Check isDevice & OS Permission (expo-notifications)]
       │
   Izin Diberikan?
   ├── YA ──► [Ambil Expo Push Token / Native Token]
   │               │
   │               ▼
   │          [Simpan di secureStorage]
   │               │
   │               ▼
   │          [POST /api/notifications/subscribe]
   │          Payload: { platform: 'android' | 'ios', endpoint: token }
   │
   └── TIDAK ─► [Tandai status di storage: disabled / denied]
```

### B. Lifecycle Unsubscribe & Session Clean-Up
```text
[User Logout ATAU SESSION_REPLACED Event]
       │
       ▼
[Ambil stored push token dari secureStorage]
       │
       ▼
[POST /api/notifications/unsubscribe]
Payload: { endpoint: token } (dengan AbortController 15s)
       │
       ▼
[Hapus push token dari secureStorage]
```

### C. Foreground Banner Suppression
- Saat aplikasi di foreground dan menerima notifikasi:
  - Cek `data.room_id`.
  - Jika `data.room_id === currentActiveRoomId` ➔ `shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false`.
  - Jika `data.room_id !== currentActiveRoomId` ➔ `shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true`.

### D. Zero-Knowledge Safe Presentation
- Notifikasi membawa data aman dari backend:
  - `title`: Pengirim / Grup.
  - `body`: `🔒 Pesan Baru (Terenkripsi)` jika terenkripsi E2EE, atau cuplikan media/teks yang aman.
  - Saat notifikasi di-tap, aplikasi membuka room yang bersangkutan dan me-render pesan asli yang didekripsi di dalam `ChatScreen` menggunakan E2EE keypair lokal.

---

## 4. Strategi Pengujian & Verifikasi
1. **Typecheck & Linter Gate**:
   - Jalankan `npx tsc --noEmit` di subdirektori `mobile/` untuk memastikan 0 error tipe TypeScript.
2. **Unit / Integration Verification**:
   - Pastikan endpoint `subscribe` dan `unsubscribe` menghasilkan JSON payload yang sesuai spesifikasi Go backend.
   - Uji penanganan error jaringan dengan timeout `AbortController`.
   - Uji penanganan fallback di simulator (mock token / graceful bypass jika bukan physical device).
3. **Automated Verification Backend**:
   - Jalankan `go test -v ./internal/push/...` di `backend/` untuk membuktikan backward compatibility server backend.
