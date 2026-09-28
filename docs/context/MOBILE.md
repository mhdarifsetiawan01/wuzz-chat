# 📱 Mobile Domain Context Primer — Wuzz Chat

Dokumen ini adalah acuan konteks utama untuk pengembangan aplikasi mobile (**React Native / Android & iOS**) di direktori `mobile/`.

---

## 🛠️ 1. Tech Stack & Environment
- **Framework**: React Native + TypeScript (Expo Managed Workflow & Prebuild)
- **Runtime Native**: Android (Gradle 8+, JDK 17) & iOS (CocoaPods)
- **Secure Storage**: `expo-secure-store` (Android Hardware Keystore / iOS Keychain)
- **Kriptografi E2EE**: Pure JS / WebCrypto compatible (ECDH NIST P-256 + HKDF + AES-256-GCM)
- **Audio & Media**: `expo-audio`, `expo-file-system`, `expo-camera` (`CameraView`)
- **WebRTC**: React Native WebRTC (`react-native-webrtc`) untuk 1-on-1 Voice Calling
- **Notifikasi**: `expo-notifications`, `expo-task-manager`, Firebase Cloud Messaging (FCM v1)

---

## 🏛️ 2. Pola Arsitektur Kritis Klien Mobile

### A. Pola Trusted Device & Key Isolation (Penyimpanan Kunci E2EE)
- **Normal Logout**: Kunci E2EE lokal **TIDAK DIHAPUS** dari SecureStore saat user menekan logout biasa (`clearSession`).
- **Login Kembali**: Saat user yang sama login kembali di HP tersebut, aplikasi memverifikasi kunci ke server via `PUT /api/users/public-key`. Jika cocok (HTTP 200), aplikasi langsung masuk ke beranda obrolan tanpa modal scan QR atau reset kunci berulang kali.
- **Isolasi Multi-User**: Kunci disimpan per pengguna dengan prefix unik:
  - Private Key: `wuzz_e2ee_priv_${userId}`
  - Public Key: `wuzz_e2ee_pub_${userId}`
  Mencegah tumpang tindih kunci jika beberapa user bergantian login di HP yang sama.
- **Konflik Kunci (HTTP 409)**: Jika akun login di perangkat baru yang belum memiliki kunci, tampilkan dialog konfirmasi reset (`KeyConflictModal`) atau arahkan untuk scan QR transfer kunci dari perangkat lama.

### B. Push Notifikasi: Zero-Knowledge Background Decryption
- **Backend Silent Data-Only Push**: Server mengirim payload FCM v1 murni berupa data dictionary (`encrypted_content`, `sender_public_key`, `room_id`) tanpa blok OS notification.
- **Client Background Task (`notificationBackgroundTask.ts`)**:
  - Didaftarkan melalui `expo-task-manager` (`WUZZ_BACKGROUND_NOTIFICATION_DECRYPT`).
  - Saat push tiba saat aplikasi di-minimize/background, task otomatis mengambil private key dari Keystore, menghitung secret ECDH secara lokal, mendekripsi teks pesan, dan memposting notifikasi lokal ke status bar Android.
  - Server tidak pernah mengetahui isi teks yang ditampilkan di status bar.

### C. WebRTC 1-on-1 Voice Calling (`mobile/src/services/webrtcService.ts`)
- **Signaling over WebSocket**: Menangani event `call_offer`, `call_answer`, `ice_candidate`, `call_reject`, `call_end`, `call_busy`.
- **SDP Sanitization**: Normalisasi SDP DTLS RFC compliant (`setup:actpass` / `setup:active`) untuk mencegah kegagalan negosiasi media antar Android dan Browser.
- **Audio Routing**: Manajemen switch rute audio antara Loudspeaker dan Earpiece telepon.

### D. Single-Screen Navigation & Keyboard Handling
- **Hardware BackHandler**: Intersepsi tombol Back fisik Android untuk menutup modal, bottom sheet, atau kembali dari ruang obrolan ke daftar chat (`activeRoomId = ''`).
- **Keyboard Resilience**:
  - Android 15 (API 35) & Android 16 (API 36+): Listener `WindowInsetsCompat.Type.ime()` di `MainActivity.kt` mengangkat padding dasar root view dinamis saat keyboard muncul, mengatasi hilangnya `adjustResize` otomatis akibat mandatory edge-to-edge.
  - Android 10 (API 29) s/d Android 14 (API 34): `adjustResize` native di `AndroidManifest.xml` tetap berjalan tanpa listener tambahan untuk mencegah *double padding*.
- **Standar Sistem Desain Mobile**: Seluruh perancangan UI/UX wajib mematuhi token dan kaidah di [`mobile/DESIGN.md`](../../mobile/DESIGN.md) (touch target min 44dp, Aurora Dark Mode palette, shadows & elevation).

### E. State Manajemen & Optimistic Cache Layer (Stale-While-Revalidate)
- **Conversation State Isolation**: Daftar percakapan dikelola secara global melalui `ConversationContext` (Milestone M-Mobile-8.15) dengan pola SWR. Data lokal di memori di-render seketika (0ms) saat user kembali dari ruang obrolan, mengeliminasi blocking spinner ("Memuat obrolan...").
- **WebSocket Centralized Ingestion**: Event `message` dari server diserap terpusat di context untuk memperbarui cuplikan pesan dan unread badge secara background.

### F. Kebijakan Retensi Penyimpanan Lokal SQLite (Storage Retention & Pruning Roadmap)
- **RAM vs Disk Separation**: Batas memori aktif `MAX_CACHED_MESSAGES_PER_ROOM = 500` dan hidrasi awal 50 pesan (`LIMIT 50`) mencegah lonjakan penggunaan RAM ponsel.
- **Rencana Capping & Auto-Pruning Disk**: Membatasi persistensi maksimal 500–1.000 pesan terbaru per room di SQLite lokal. Pesan yang lebih lama dari batas cap otomatis di-prune saat sinkronisasi riwayat baru, dengan fallback pagination REST API saat user scroll ke atas.
- **Isolasi Media Binary**: SQLite hanya menyimpan pointer string (`media_url` dan `local_media_uri`). File fisik (gambar, video, voice note) disimpan di filesystem cache terpisah dan tidak membebani ukuran database.
- **Fitur Pembersih Cache & Vacuum**: Rencana penambahan tombol *"Bersihkan Cache Pesan"* dan *"Bersihkan Cache Media"* di `SettingsScreen` (M-Mobile-8.21) serta pemanfaatan `PRAGMA auto_vacuum = INCREMENTAL;` untuk mengembalikan ruang kosong ke OS.

---

## 📂 3. Peta Direktori Klien Mobile (`mobile/`)

```text
mobile/
├── DESIGN.md                   # Standar resmi sistem desain mobile (Aurora Dark Mode)
├── App.tsx                     # Entrypoint, Navigation Container, Global Modals
├── app.json                    # Konfigurasi Expo & Android Permissions (Camera, Audio, Notifications)
├── google-services.json        # Kredensial client Firebase FCM Android
├── src/
│   ├── api/
│   │   ├── client.ts           # Axios REST client (User-Agent: WuzzChat-Mobile/1.0, X-Device-Platform: android)
│   │   └── types.ts            # Type definitions API & error response
│   ├── context/
│   │   ├── AuthContext.tsx         # Session management, Trusted Device E2EE state, login/logout
│   │   ├── ConversationContext.tsx # Global conversations cache, SWR, unread counts (M-Mobile-8.15)
│   │   ├── CallContext.tsx         # WebRTC voice call peer connection & audio manager
│   │   └── DeviceContext.tsx       # Device identification & platform state
│   ├── screens/
│   │   ├── LoginScreen.tsx     # Login/Register UI & Multi-device override confirmation
│   │   ├── HomeScreen.tsx      # Fullscreen chat list, search, floating action button (+ Chat)
│   │   └── ChatScreen.tsx      # Fullscreen active chat room, timeline, voice notes, attachments
│   ├── components/
│   │   ├── ChatInputBar.tsx    # Input teks, tombol mic voice note, panel media picker
│   │   ├── MessageBubble.tsx   # Bubble chat mobile, receipts centang, quote view
│   │   ├── IncomingCallModal.tsx # Dialog panggilan masuk Aurora Dark Mode
│   │   └── ActiveCallOverlay.tsx # Overlay panggilan aktif, mute mic, timer
│   └── services/
│       ├── websocket.ts        # WebSocket service dengan reconnect backoff deterministik
│       ├── webrtcService.ts    # WebRTC voice call peer connection & audio manager
│       ├── secureStorage.ts    # Wrapper hardware Keystore / Keychain
│       ├── notificationService.ts # Registrasi token FCM & foreground handler
│       └── notificationBackgroundTask.ts # Zero-knowledge background push decryptor
```

---

## 🧪 4. Testing & Build Klien Mobile

1. **Typecheck & Linter**:
   ```bash
   cd mobile && npx tsc --noEmit
   ```
2. **Build Standalone Release APK**:
   ```bash
   cd mobile/android && ./gradlew assembleRelease
   ```
   *Output APK berlokasi di*: `mobile/android/app/build/outputs/apk/release/app-release.apk`
3. **Instalasi USB Debugging ke HP Fisik**:
   ```bash
   adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
   ```
