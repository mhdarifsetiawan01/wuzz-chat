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

### D. Single-Screen Navigation, Modal Architecture & Design Compliance
- **Hardware BackHandler**: Intersepsi tombol Back fisik Android untuk menutup modal, bottom sheet, atau kembali dari ruang obrolan ke daftar chat (`activeRoomId = ''`).
- **Keyboard Resilience**:
  - Android 15 (API 35) & Android 16 (API 36+): KAV pada seluruh modal dialog wajib `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`.
  - Sticky header di layar obrolan wajib berada di luar KAV agar tidak terdorong naik saat keyboard muncul di Android lama.
- **Standar Sistem Desain & Kontras Mobile**:
  - Seluruh perancangan UI/UX wajib mematuhi token dan kaidah di [`mobile/DESIGN.md`](../../mobile/DESIGN.md).
  - **Kontras Teks Tombol (Anti White-on-White)**: Tombol berlatar terang (`variant="secondary"`) wajib menggunakan teks gelap `colors.textPrimary` (`#0f172a`), dilarang menggunakan teks putih.
  - **Bottom Sheet Flush Alignment**: Seluruh modal tipe bottom sheet wajib menyertakan `statusBarTranslucent={true}`, KAV sebagai overlay terluar (`flex: 1, justifyContent: 'flex-end'`), backdrop `StyleSheet.absoluteFill`, kartu menempel rapat di dasar layar (`bottom: 0`) dengan padding aman `Math.max(insets.bottom, spacing.lg)`, dan form scrollable ber-`flexShrink: 1` (dilarang celah mengambang / floating gap).

### E. State Manajemen & Optimistic Cache Layer (Stale-While-Revalidate)
- **Conversation State Isolation**: Daftar percakapan dikelola secara global melalui `ConversationContext` (Milestone M-Mobile-8.15) dengan pola SWR. Data lokal di memori di-render seketika (0ms) saat user kembali dari ruang obrolan, mengeliminasi blocking spinner ("Memuat obrolan...").
- **WebSocket Centralized Ingestion**: Event `message` dari server diserap terpusat di context untuk memperbarui cuplikan pesan dan unread badge secara background.

### F. Kebijakan Retensi Penyimpanan Lokal SQLite (Storage Retention & Pruning Roadmap)
- **RAM vs Disk Separation**: Batas memori aktif `MAX_CACHED_MESSAGES_PER_ROOM = 500` dan hidrasi awal 50 pesan (`LIMIT 50`) mencegah lonjakan penggunaan RAM ponsel.
- **Rencana Capping & Auto-Pruning Disk**: Membatasi persistensi maksimal 500–1.000 pesan terbaru per room di SQLite lokal. Pesan yang lebih lama dari batas cap otomatis di-prune saat sinkronisasi riwayat baru, dengan fallback pagination REST API saat user scroll ke atas.
- **Isolasi Media Binary**: SQLite hanya menyimpan pointer string (`media_url` dan `local_media_uri`). File fisik (gambar, video, voice note) disimpan di filesystem cache terpisah dan tidak membebani ukuran database.
- **Fitur Pembersih Cache & Vacuum**: Rencana penambahan tombol *"Bersihkan Cache Pesan"* dan *"Bersihkan Cache Media"* di `SettingsScreen` (M-Mobile-8.21) serta pemanfaatan `PRAGMA auto_vacuum = INCREMENTAL;` untuk mengembalikan ruang kosong ke OS.

### G. Community Social Feed & Viral Share Loop (Milestone M-Mobile-9)
- **SWR FeedContext & Local SQLite Persistensi**: Linimasa postingan dikelola melalui `FeedContext.tsx` dengan SQLite cache lokal (`local_feed_posts`) untuk cold start < 50ms dan rolling cap 50 posts per tab ("⏱️ Terbaru" & "🎲 Jelajah").
- **Optimistic Interactions**: Like instan 0ms dengan locking per-post (`likeInFlightRef`) dan rollback otomatis jika gagal. Thread komentar ber-pagination kursor waktu (`PostCommentsModal.tsx`).
- **Viral Share Loop**: Meneruskan postingan (`SharePostToChatModal.tsx`) ke 1–5 ruang obrolan via WebSocket. Isi pesan berupa teks terbaca + baris penanda `wuzzchat://post/<id>` (`utils/feedShare.ts`). Klien baru merender penanda itu sebagai `SharedPostCard` di `MessageBubble` (thumbnail & status dari `GET /api/feed/:id`, di-cache; 404 → "Postingan sudah dihapus"), ketuk membuka `PostReader`. Klien lama hanya melihat teks biasa.

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
│   │   ├── feed.ts             # API client untuk Community Social Feed
│   │   ├── messages.ts         # API client riwayat obrolan & direct chat
│   │   └── types.ts            # Type definitions API, User, Feed, & Error response
│   ├── context/
│   │   ├── AuthContext.tsx         # Session management, Trusted Device E2EE state, login/logout
│   │   ├── ConversationContext.tsx # Global conversations cache, SWR, unread counts (M-Mobile-8.15)
│   │   ├── MessageContext.tsx      # In-memory timeline message cache & reverse scroll pagination
│   │   ├── FeedContext.tsx         # Community Social Feed SWR cache & like/comment sync
│   │   ├── CallContext.tsx         # WebRTC voice call peer connection & audio manager
│   │   └── DeviceContext.tsx       # Device identification & platform state
│   ├── navigation/
│   │   ├── AppNavigator.tsx        # Native Stack Navigator (slide_from_right)
│   │   └── MainTabNavigator.tsx    # Glassmorphic Bottom Tab (Obrolan, Feed, Panggilan, Pengaturan)
│   ├── screens/
│   │   ├── LoginScreen.tsx         # Login UI & Multi-device override confirmation
│   │   ├── RegisterScreen.tsx      # Pendaftaran akun baru
│   │   ├── RecentChatsScreen.tsx   # Fullscreen chat list, debounced search, pill filters, FAB (+ Chat)
│   │   ├── ChatScreen.tsx          # Fullscreen active chat room, timeline, voice notes, attachments
│   │   ├── FeedScreen.tsx          # Community Social Feed timeline (Terbaru & Jelajah)
│   │   ├── CallsHistoryScreen.tsx  # Riwayat panggilan WebRTC tersimpan di SQLite & dialer
│   │   ├── SettingsScreen.tsx      # Pengaturan akun, E2EE keys, perangkat tertaut, cache storage
│   │   └── UserProfileScreen.tsx   # Profil publik modular, avatar, bio, medsos, & E2EE fingerprint
│   ├── components/
│   │   ├── ChatInputBar.tsx        # Input teks, tombol mic voice note, panel media picker
│   │   ├── MessageBubble.tsx       # Bubble chat mobile, receipts centang, quote view
│   │   ├── CreatePostModal.tsx     # Modal buat postingan feed komunitas (teks, media, char counter)
│   │   ├── PostCommentsModal.tsx   # Modal thread komentar feed dengan cursor-based infinite scroll
│   │   ├── SharePostToChatModal.tsx# Modal bagikan postingan feed ke obrolan chat
│   │   ├── MediaViewerModal.tsx    # Penampil media fullscreen interaktif (pinch-to-zoom, pan 2D)
│   │   ├── IncomingCallModal.tsx   # Dialog panggilan masuk Aurora Dark Mode
│   │   └── ActiveCallOverlay.tsx   # Overlay panggilan aktif, mute mic, timer
│   └── services/
│       ├── websocket.ts            # WebSocket service dengan reconnect backoff deterministik
│       ├── webrtcService.ts        # WebRTC voice call peer connection & audio manager
│       ├── sqliteStorage.ts        # Persistensi lokal SQLite (WAL Mode) isolasi per user
│       ├── secureStorage.ts        # Wrapper hardware Keystore / Keychain
│       ├── notificationService.ts  # Registrasi token FCM & foreground handler
│       └── notificationBackgroundTask.ts # Zero-knowledge background push decryptor
```

---

## 🧪 4. Testing & Build Klien Mobile

1. **Typecheck & Linter**:
   ```bash
   cd mobile && npx tsc --noEmit
   ```
2. **Build Standalone Release APK (ABI Splits ~47 MB & ~35 MB)**:
   ```bash
   cd mobile/android && ./gradlew assembleRelease
   ```
   *Output APK berlokasi di*: `mobile/android/app/build/outputs/apk/release/`
   - `app-arm64-v8a-release.apk` (47 MB — untuk 95%+ smartphone modern)
   - `app-armeabi-v7a-release.apk` (35 MB — cadangan HP lawas 32-bit)
3. **Build Android App Bundle untuk Google Play Store (Single .aab ~50 MB)**:
   ```bash
   cd mobile/android && ./gradlew bundleRelease
   ```
   *Output AAB*: `mobile/android/app/build/outputs/bundle/release/app-release.aab`
4. **Instalasi USB Debugging ke HP Fisik Modern**:
   ```bash
   adb install -r mobile/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk
   ```
