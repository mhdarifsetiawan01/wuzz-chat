# 📱 Mobile Progress Log — Wuzz Chat

Dokumen ini mencatat seluruh riwayat pengerjaan, status kapabilitas, dan rencana pengembangan pada layer **Mobile App (React Native Expo)** di direktori `mobile/`.

---

## 📊 Status Ringkasan
- **Framework**: React Native + TypeScript (Expo SDK 52 Managed Workflow)
- **Status Build**: Standalone Release APK **SUCCESSFUL & TERUJI DI HP FISIK VIA USB** ✅
- **Kriptografi Client**: Native E2EE (NIST P-256 ECDH + AES-256-GCM) 100% Interoperabel dengan Web ✅
- **Panggilan Suara**: WebRTC 1-on-1 Voice Calling P2P + Audio Session Manager SELESAI ✅
- **Push Notification**: FCM v1 Silent Data-Only + Zero-Knowledge Client Background Decryption SELESAI ✅
- **Pola Keamanan**: Trusted Device Pattern di Android Keystore & Isolasi Kunci Multi-User SELESAI ✅

---

## 🏆 Riwayat Fitur & Milestone yang Telah Selesai

### 1. Fondasi Klien Mobile & Real-Time Chat (M-Mobile-1 s/d M-Mobile-3)
- [x] **M-Mobile-1: Auth Layer & Mobile Shell**: Login/Register, SecureStore, tema WhatsApp Aurora Dark Mode.
- [x] **M-Mobile-2: Chat Room & Realtime Messaging**: Fullscreen timeline, WebSocket connection state bar, sticky room header, centang status pengiriman 3-tahap (`🕒`, `✓`, `✓✓`, `✓✓` biru).
- [x] **M-Mobile-3: Contact Search & Start New Conversation**: Pencarian kontak debounced, FAB (+ Chat), inisiasi obrolan langsung (Direct Message).

### 2. Kriptografi E2EE, Media & Audio Messaging (M-Mobile-4 s/d M-Mobile-7)
- [x] **M-Mobile-4: E2EE Mobile Integration**: NIST P-256 ECDH + HKDF-SHA256 + AES-256-GCM, auto-dekripsi chat list snippet, interoperabilitas penuh dengan Web Crypto API.
- [x] **M-Mobile-5: Media Attachments & Sharing**: Kamera, galeri foto, staged image preview, modal fullscreen viewer, download file auto-ACK.
- [x] **M-Mobile-6: Quoted Reply & Swipe-to-Reply**: Gesture geser pesan untuk membalas (*swipe-to-reply*), banner kutipan di atas input bar, pill reaksi emoji cepat.
- [x] **M-Mobile-7: Voice Notes & Audio Messaging**: Perekaman suara WhatsApp-style (`expo-audio`), waveform scrubber dinamis 24-bar, playback speed toggle (1x / 1.5x / 2x), single active audio player.

### 3. Komunikasi Grup, Identitas & WebRTC Voice Calling (M-Mobile-8 s/d M-Mobile-8.12)
- [x] **M-Mobile-8: Group Chat, Sub-Groups & Mentions**: Dukungan room `grp_*` dan `sub_*`, bypass fail-closed pada pesan grup (server-relayed TLS), deterministic sender nickname color, penanganan mention `@username`.
- [x] **M-Mobile-8.5: Contact Profile & Verified Identity**: Safety Number 30-digit deterministic fingerprint, `ContactInfoModal`, centang biru `VerifiedBadge`, pure JS `QRCodeView`.
- [x] **M-Mobile-8.10: QR Code E2EE Device Transfer**: In-app live camera scanner (`CameraView`), atomic single-use consume di database server, pemindahan kunci antar-perangkat secara aman.
- [x] **M-Mobile-8.11 & 8.12: WebRTC 1-on-1 Voice Calling**: Signaling via WebSocket (`call_offer`, `call_answer`, `ice_candidate`), STUN/TURN, normalisasi SDP DTLS RFC compliance (`setup:actpass`), `IncomingCallModal` & `ActiveCallOverlay`, manajemen rute audio Loudspeaker vs Earpiece, vibration feedback.

### 4. Zero-Knowledge Background Decryption & FCM v1 Push (Terbaru)
- [x] **Silent Data-Only Push**: Payload FCM v1 dikirim tanpa blok OS notification, memuat ciphertext dan public key pengirim dengan prioritas `HIGH`.
- [x] **Background Task Decryptor (`notificationBackgroundTask.ts`)**: Task `WUZZ_BACKGROUND_NOTIFICATION_DECRYPT` via `expo-task-manager` mengambil private key dari Keystore, menghitung secret ECDH di background HP saat layar mati/terkunci, mendekripsi pesan, dan memposting notifikasi lokal ke status bar Android.
- [x] **Penyimpanan Identitas Lokal**: Menyimpan `wuzz_current_user_id` di SecureStore agar task background non-React menemukan keypair yang tepat.

### 5. Trusted Device Pattern & Sinkronisasi Multi-Device (Terbaru)
- [x] **Trusted Device pada Normal Logout**: Kunci E2EE lokal tidak dihapus saat logout biasa. Login ulang di perangkat yang sama langsung masuk tanpa modal scan QR atau reset kunci berulang kali.
- [x] **Isolasi Multi-User**: Penyimpanan kunci privat & publik berawalan `wuzz_e2ee_priv_${userId}` dan `wuzz_e2ee_pub_${userId}` untuk mencegah konflik jika beberapa user bergantian login di HP yang sama.
- [x] **Deteksi User-Agent & Handshake Header**: Mengirim header `User-Agent: WuzzChat-Mobile/1.0 (Android; Mobile; React-Native)` dan parameter WebSocket `platform=android` sehingga perangkat terdeteksi dengan icon `📱` ramah di server dan panel web.
- [x] **Multi-Device Quota Override Confirmation**: Dialog konfirmasi ramah saat kuota 2 perangkat tercapai untuk menimpa (*override*) sesi lama.
- [x] **Keyboard Resilience**: Layout form login dan chat input bar terdorong secara mulus tanpa menutupi area ketik saat virtual keyboard Android muncul.

### 6. Desain Sistem & Spesifikasi Antarmuka Mobile (27 September 2026)
- [x] **M-Mobile-8.13: Mobile Design Specification (`mobile/DESIGN.md`)**:
  - Penetapan standar kanonikal antarmuka React Native berbasis tema *Aurora Glassmorphic Dark Mode* (`#090d16` base).
  - Skema warna JS object (`colors.ts`), token spacing, radius, dan multi-platform elevation & shadow.
  - Aturan tata letak *WhatsApp Single-Screen Flow* (Screen 1: HomeScreen ⇄ Screen 2: ChatScreen) dengan penanganan hardware back button & safe area insets.
  - Standar ergonomi sentuh (target sentuh minimal 44 × 44 dp), gestur swipe-to-reply, dan virtual keyboard resilience (`softwareKeyboardLayoutMode: "resize"`).
  - Spesifikasi blueprint komponen utama: `MessageBubble`, `ChatInputBar`, `VoiceNotePlayer`, dan `BottomSheetCard`.
- [x] **M-Mobile-8.14: Penyelarasan Halaman Home (`RecentChatsScreen.tsx`) dengan `mobile/DESIGN.md` (27 September 2026)**:
  - Implementasi Debounced Search Bar (250ms) dengan fitur pencarian real-time pada nama obrolan, kontak, username partisipan, dan cuplikan pesan terakhir, dilengkapi tombol clear (✕).
  - Implementasi Filter Tabs (Pill Chips): "Semua", "Belum Dibaca" (dengan badge unread), dan "Grup" (dengan tag hitungan grup).
  - Penataan ulang Header menjadi lebih bersih dan ergonomis: tombol transfer perangkat (💻) dan notifikasi (🔔) dengan touch target min 40–44dp, serta penyederhanaan aksi profil pengguna via dialog akun & logout.
  - Integrasi dynamic safe area insets (`useSafeAreaInsets()`) pada header dan posisi FAB, serta proteksi padding bawah FlatList.
  - Contextual Empty States responsif terhadap pencarian dan filter aktif.

---

- [x] **M-Mobile-8.15: Conversation Global Context & SWR Cache Layer (27 September 2026)**:
  - Implementasi `ConversationContext.tsx` untuk mengelola state daftar percakapan global di memori aplikasi (`conversations`, `isLoading`, `isRefreshing`, `error`).
  - Pola Stale-While-Revalidate (SWR): render instan 0ms saat kembali dari `ChatScreen` ke `RecentChatsScreen` tanpa memunculkan spinner "Memuat obrolan...".
  - Logika dekripsi snippet E2EE on-the-fly (`decryptSnippet`) dan caching peer public key terpusat di dalam context.
  - Listener WebSocket `message` tersentralisasi di context untuk memicu `refreshConversations(true)` secara senyap di background.
  - Optimistic pinning update (`updateConversationPin`) dengan auto re-sorting dan rollback jika API gagal.
  - Integrasi `<ConversationProvider>` di `mobile/App.tsx` dan refactor `RecentChatsScreen.tsx` untuk mengonsumsi `useConversations()`.

---

- [x] **M-Mobile-8.16: Native Stack Navigation & Aurora Action Bottom Sheet (27 September 2026)**:
  - Migrasi seluruh stack navigasi mobile ke `@react-navigation/native-stack` (`createNativeStackNavigator`) di `mobile/src/navigation/`.
  - Arsitektur stack modular & scalable (`RootStackParamList`, `navigationRef`, `AppNavigator`) yang dinamis dan mudah diekstensikan dengan route baru.
  - Animasi transisi native 60fps (`slide_from_right`) dan native gesture swipe-to-back tanpa unmounting komponen.
  - Implementasi komponen reusable `BottomSheetModal` & `ActionMenuItem` (`mobile/src/components/BottomSheetModal.tsx`) dengan animasi smooth spring slide-up, swipe-down to dismiss (`PanResponder`), dan token styling Aurora Dark Mode.
  - Penyatuan header menu di `RecentChatsScreen.tsx`: tombol menu `⋮` & Avatar profil membuka Action Bottom Sheet (Buat Grup Baru, Tautkan Perangkat, Profil E2EE, Notifikasi, dan Keluar Akun).
  - Integrasi listener state navigasi otomatis untuk sinkronisasi `activeRoomId` ke push notification foreground suppression service.

- [x] **M-Mobile-8.17: Room Messages SWR Cache & Timeline In-Memory State + Reverse Infinite Scroll (27 September 2026)**:
  - Implementasi `MessageContext.tsx` untuk mengelola state pesan di memori global (`messagesByRoom: Record<string, Message[]>`).
  - Pola Stale-While-Revalidate (SWR): render instan 0ms saat user membuka ruang obrolan `ChatScreen` tanpa layar kosong / spinner blocking.
  - Listener WebSocket sentral (`message`, `history`, `ack`, `receipt`, `reaction`, `message_deleted`, `delete_message`, `message_edited`, `message_pinned`, `message_unpinned`) aktif di background.
  - Rekonsiliasi E2EE: menjaga teks plaintext yang sudah didekripsi sebelumnya saat sync riwayat baru tiba dari server (`DEC-015`).
  - Fitur **Load Older Messages / Reverse Infinite Scroll**:
    - Penarikan riwayat lama mundur via cursor timestamp (`before`) dan limit 50 pesan (`GET /api/messages`).
    - Deteksi otomatis saat user scroll mendekati atas (`contentOffset.y <= 40`) serta tombol manual `↑ Muat Pesan Terdahulu` di `ListHeaderComponent`.
    - Guard `isPrependingRef` pada `onContentSizeChange` untuk mencegah loncatan scroll ke bawah saat pesan lama disisipkan di atas.

- [x] **M-Mobile-8.19: Aurora Glassmorphic Bottom Tab Navigation & Multi-Tab Screens (27 September 2026)**:
  - Install `@react-navigation/bottom-tabs` v7.19.2.
  - Implementasi `MainTabNavigator.tsx` dengan custom Aurora Glassmorphic tab bar: glassmorphic `bgSurface`, `borderSubtle`, safe-area insets, active pill `tintAccent20`, label aktif `accentPrimary`, label non-aktif `textMuted`.
  - **Live Unread Badge** pada tab Obrolan terhubung ke `useConversations()` — badge real-time tanpa refresh.
  - Arsitektur **Stack-Over-Tab**: `MainTabs` sebagai root entry di `AppNavigator`. Screen `Chat`, `NewChat`, `NewGroup`, `GroupInfo` tetap di Root Stack — slide ATAS tab bar secara natural.
  - `CompositeNavigationProp` pada `ChatsTabScreen` agar tab screen bisa navigate ke Root Stack dengan type-safe.
  - Buat `CallsHistoryScreen.tsx`: riwayat panggilan WebRTC (masuk / keluar / tak terjawab), timestamp relatif, FAB inisiasi panggilan baru.
  - Buat `SettingsScreen.tsx`: avatar 56dp initials + online dot, nama + `@username`, badge E2EE Terenkripsi, menu Perangkat Tertaut, Kunci E2EE, Notifikasi, Keluar Akun (dengan konfirmasi aman).
  - Verifikasi: `npx tsc --noEmit` -> **0 errors** dan `./gradlew assembleRelease` -> **BUILD SUCCESSFUL**.

- [x] **Fix: E2EE Auto-Decryption on Key Availability in ConversationContext (27 September 2026)**:
  - Mengatasi masalah race condition tampilan preview pesan terkunci ("🔒 Pesan terenkripsi") saat cold start aplikasi mobile.
  - Menambahkan auto-reprocess hook di `ConversationContext.tsx` untuk mendekripsi ulang daftar obrolan lokal seketika kunci privat E2EE siap dari SecureStorage tanpa memerlukan reload/refresh manual.

- [x] **M-Mobile-8.18: Offline-First SQLite Storage, Anti-Blink Guard & Reverse Scroll Hardening (27 September 2026)**:
  - Implementasi persistent storage offline `sqliteStorage.ts` dengan WAL Mode (`PRAGMA journal_mode = WAL`) dan indeks performa tinggi.
  - Skema tabel lokal `local_conversations` dan `local_messages` terisolasi per `user_id`.
  - Cache-first hydration pada `ConversationContext.tsx` dan `MessageContext.tsx` untuk rendering instan (< 50ms) saat aplikasi dibuka setelah cold-start / di-kill dari background.
  - Anti-Blink Decryption Guard pada daftar obrolan lokal dan pemutus infinite re-render loop pada perangkat hasil transfer QR (`messagesByRoomRef`).
  - Normalisasi safe reaction (`normalizeReactions`) untuk mencegah fatal exception saat JSON string reactions diterima dari server.
  - WhatsApp-style floating scroll-to-bottom button (FAB) `↓` saat scroll > 300px dengan counter pesan baru dan guard posisi scroll (`maintainVisibleContentPosition`).
  - Verifikasi: `npx tsc --noEmit` -> 0 error, `go test ./...` -> 100% PASS, dan `./gradlew assembleRelease` -> BUILD SUCCESSFUL.

- [x] **M-Mobile-8.20: CallsHistoryScreen — Integrasi Riwayat Panggilan Real & Dialer (27 September 2026)**:
  - Implementasi tabel `local_call_logs` di SQLite lokal (`sqliteStorage.ts`) dengan indeks `(user_id, created_at DESC)` dan helper CRUD `saveCallRecord`, `getCallHistory`, `clearCallHistory`, `deleteCallRecord`, serta integrasi `clearUserCache(userId)`.
  - Integrasi otomatis lifecycle panggilan WebRTC di `CallContext.tsx`: pencatatan otomatis panggilan masuk (`incoming`), panggilan keluar (`outgoing`), dan tak terjawab (`missed`) dengan penghitungan durasi aktif dan Single-Invocation Guard (`loggedCallIdRef`).
  - Fitur Auto-Resolve Room ID pada `startCall` untuk panggilan langsung via `peerId` dengan membuat/mengambil `room_id` resmi via `startDirectChat(peerId)`.
  - Pembaruan UI `CallsHistoryScreen.tsx`: hapus mock data, integrasi real SQLite call history, pull-to-refresh (`RefreshControl`), empty state informatif, dialog konfirmasi panggilan balik, tombol callback 📞, dan aksi long-press hapus log panggilan.
  - FAB bulat membuka BottomSheetModal Dialer & Contact Picker dengan pencarian debounced `/api/users/search` dan daftar kontak obrolan aktif.
  - Perbaikan soft keyboard layout clamping pada `BottomSheetModal.tsx` (`paddingTop: insets.top + spacing.lg`, `maxHeight: '100%'`, `flexShrink: 1`) untuk mencegah overflow melewati status bar.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `./gradlew assembleRelease` -> **BUILD SUCCESSFUL**, dan instalasi sukses via `adb install -r`.

- [x] **M-Mobile-8.22: Instant 0ms Group Chat Rendering via SWR & SQLite Local Hydration (28 September 2026)**:
  - Mengeliminasi full-screen blocking spinner `isVerifyingGroup` saat membuka grup obrolan yang sudah dikenal keanggotaannya (`isKnownGroupMember`).
  - Linimasa obrolan grup kini langsung tampil seketika (0ms) dari memori dan database SQLite lokal (`hydrateRoomFromLocalDB`).
  - Menjalankan sinkronisasi `getGroupDetails` dan WebSocket `joinRoom` di latar belakang secara non-blocking.
  - Memperkuat ketahanan offline: jika jaringan lambat atau terputus, pengguna tetap bisa membaca riwayat pesan offline tanpa interupsi `Alert.alert` atau `onBack()`.
  - Proteksi otorisasi DEC-012 (Preview grup publik) dan DEC-013 (403 Forbidden Shield) tetap aktif 100% untuk link grup luar/unjoined.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors** dan `go test ./...` -> **100% PASS**.

- [x] **M-Mobile-8.21: SettingsScreen — Modals & Interactive Settings + Direct Call Activation (28 September 2026)**:
  - Menggantikan seluruh placeholder `Alert.alert('Fitur ini segera hadir')` di `SettingsScreen.tsx` dengan modal interaktif berstandar Aurora Glassmorphic Dark Mode:
    - **Perangkat Tertaut**: Terhubung langsung ke `DeviceTransferModal` (share QR, camera scan, dan token input manual).
    - **Kunci & Keamanan E2EE**: Implementasi `E2EEKeyModal.tsx` dengan hardware Keystore status, spesifikasi kriptografi, fingerprint 8-blok dengan salin clipboard, dan QR code identitas profil.
    - **Penyimpanan & Data**: Section baru dan modal `StorageSettingsModal.tsx` dengan kalkulasi kapasitas lokal SQLite dan media, serta tombol bersihkan cache pesan & media yang aman.
    - **Notifikasi & Suara**: Terhubung langsung ke `NotificationSettingsModal`.
    - **Edit Profil**: Implementasi `EditProfileModal.tsx` untuk mengubah Display Name via API `PUT /api/auth/profile` dan `updateCurrentUser` di `AuthContext`.
  - Menghubungkan tombol panggilan suara (📞) di `ContactInfoModal.tsx` langsung ke `useCall().startCall(...)` dengan room binding dari `ChatScreen.tsx`, mengeliminasi placeholder alert terakhir di aplikasi mobile.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `go test ./...` -> **100% PASS**, `./gradlew assembleRelease` -> **BUILD SUCCESSFUL**, dan instalasi sukses via `adb install -r`.
- [x] **M-Mobile-8.23: Audit & Perbaikan Fitur 'Cari Pesan dalam Obrolan' (In-Chat Search Hardening) (28 September 2026)**:
  - Mengubah arsitektur pencarian dari server-side REST API yang selalu gagal (karena database backend hanya menyimpan ciphertext E2EE) menjadi pencarian instan sisi klien (*0ms client-side in-memory search*) pada pesan terdekripsi `messages`, mendukung pencarian isi pesan (`m.content`) dan nama berkas (`m.file_name`).
  - Menstabilkan layout bilah pencarian: `searchNavCol` kini selalu terpasang dengan lebar tetap sehingga kotak input `TextInput` tidak bergeser saat mengetik, menghilangkan keyboard flicker, kursor melompat, dan dropped keystrokes pada Android.
  - Memperbaiki tombol panah navigasi pencarian `▲` dan `▼`:
    - Mengaktifkan tombol saat hasil pencarian = 1 (`disabled={searchResults.length === 0}`) sehingga pengguna tetap dapat melompat ke pesan yang dicari.
    - Menggunakan referensi sinkron `currentSearchIndexRef` dan `searchResultsRef` untuk mencegah stale closure saat tombol ditekan cepat berulang kali.
    - Menghilangkan race condition `onContentSizeChange` yang sebelumnya memicu `scrollToEnd()` dan menarik scroll kembali ke bawah saat tombol `▲` ditekan.
    - Mengimplementasikan 2-step retry pada `onScrollToIndexFailed` di FlatList dengan `info.averageItemLength` dan delay pengukuran untuk menjamin scroll tepat sasaran.
  - Integrasi listener tombol fisik Android `BackHandler` untuk menutup bilah pencarian sebelum keluar dari room obrolan.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `./gradlew assembleRelease` -> **BUILD SUCCESSFUL**, dan instalasi sukses via `adb install -r`.

- [x] **M-Mobile-8.24: Modifikasi Identitas Aplikasi 'WuzzChat' & Android Adaptive Icons (28 September 2026)**:
  - Mengubah nama aplikasi saat terinstal di perangkat HP menjadi `WuzzChat` (tanpa spasi) secara konsisten pada `app.json` dan native Android `strings.xml`.
  - Mengadopsi ikon aplikasi resmi (latar belakang biru pekat `#0462E8`, double chat bubble putih berbentuk W, dan aksen petir kuning di tengah).
  - Skalasi presisi foreground adaptif di dalam safe zone 66dp (~61.1%) agar logo tidak terpotong oleh launcher bulat (Pixel) maupun squircle (Samsung OneUI).
  - Generate 6 asset bundle Expo di `mobile/assets/` (`icon.png`, `android-icon-*.png`, `favicon.png`, `splash-icon.png`) dan 25 file `.webp` native di `mobile/android/app/src/main/res/mipmap-*` (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) serta `splashscreen_logo.png` di `drawable-*`.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `./gradlew assembleRelease` -> **BUILD SUCCESSFUL in 15s**, dan instalasi sukses via `adb install -r`.

- [x] **M-Mobile-8.25: Universal Mobile Keyboard Resilience & Multi-Android Version Support (28 September 2026)**:
  - Menyelesaikan masalah keyboard virtual yang menutupi tombol login di `LoginScreen` dan input pesan `ChatInputBar` di `ChatScreen` pada Android 15 & 16.
  - Mengimplementasikan listener insets native `WindowInsetsCompat.Type.ime()` di `MainActivity.kt` dengan guard versi OS `Build.VERSION.SDK_INT >= 35`.
  - Mempertahankan perilaku native `adjustResize` pada Android 10 (API 29) s/d Android 14 (API 34) untuk mencegah *double padding*.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `go test ./...` -> **100% PASS**, `npm run build` -> **0 errors**, `./gradlew assembleRelease` -> **BUILD SUCCESSFUL in 1m 18s**, dan instalasi sukses via `adb install -r`.

- [x] **M-Mobile-8.26: Optimasi Biner Release APK & AAB Android (R8, Resource Shrinking & ABI Splits) (28 September 2026)**:
  - Memangkas ukuran APK rilis secara drastis dari **151 MB** menjadi **47 MB (-68.8%)** untuk `app-arm64-v8a-release.apk` dan **35 MB (-76.8%)** untuk `app-armeabi-v7a-release.apk`.
  - Mengaktifkan R8 code minification (`android.enableMinifyInReleaseBuilds=true`) memangkas ukuran uncompressed DEX sebesar **58.6%** (dari 38.37 MB ke 15.89 MB) dan mengurangi multidex dari 4 ke 3 file.
  - Mengaktifkan resource shrinking (`android.enableShrinkResourcesInReleaseBuilds=true`) untuk membuang aset dan XML yang tidak terpakai.
  - Menerapkan ABI Splits terpisah untuk arsitektur fisik (`arm64-v8a` dan `armeabi-v7a`) serta membuang bloat library native emulator Intel x86/x86_64 (~74 MB).
  - Menambahkan keep-rules ProGuard untuk WebRTC, Expo Modules, dan JNI native methods.
  - Mengintegrasikan Expo Config Plugin `mobile/plugins/withAndroidReleaseOptimization.js` agar konfigurasi persisten terhadap `npx expo prebuild`.
  - Mendukung build bundle resmi Google Play Store (`./gradlew bundleRelease`) yang otomatis menghasilkan 1 file `app-release.aab` utuh (50 MB).
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `./gradlew assembleRelease` -> **BUILD SUCCESSFUL**, `./gradlew bundleRelease` -> **BUILD SUCCESSFUL**.

---

## Fokus Berikutnya (What's Next)
- [ ] **M-Mobile-8.23: SQLite Storage Retention Cap, Cache Pruning & Auto-Vacuum**:
  - Implementasi retention cap (maksimal 500–1.000 pesan per room di SQLite lokal).
  - Mekanisme auto-pruning pesan usang saat sinkronisasi riwayat baru tiba dari server.
  - Penambahan `PRAGMA auto_vacuum = INCREMENTAL;` pada inisialisasi database SQLite untuk mengembalikan ruang disk yang dibersihkan ke sistem operasi.
- [ ] **M-Mobile-8.24: Media Gallery Viewer & Group Media Lifecycle** (tab galeri media per chat & interactive pinch-to-zoom viewer).
- [ ] Pengujian build native iOS via Xcode / CocoaPods.

