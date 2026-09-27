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
- **Keyboard Resilience**: Gunakan `KeyboardAvoidingView` dengan kalkulasi dynamic safe-area insets agar input bar terangkat presisi tepat di atas virtual keyboard.

---

## 📂 3. Peta Direktori Klien Mobile (`mobile/`)

```text
mobile/
├── App.tsx                     # Entrypoint, Navigation Container, Global Modals
├── app.json                    # Konfigurasi Expo & Android Permissions (Camera, Audio, Notifications)
├── google-services.json        # Kredensial client Firebase FCM Android
├── src/
│   ├── api/
│   │   ├── client.ts           # Axios REST client (User-Agent: WuzzChat-Mobile/1.0, X-Device-Platform: android)
│   │   └── types.ts            # Type definitions API & error response
│   ├── context/
│   │   ├── AuthContext.tsx     # Session management, Trusted Device E2EE state, login/logout
│   │   └── ChatContext.tsx     # Message timeline, active room, unread badges
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
