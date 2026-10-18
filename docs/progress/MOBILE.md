# 📱 Mobile Progress Log — Wuzz Chat

### Perangkat Tertaut — tahap pertama (18 Oktober 2026)

- `LinkedDevicesModal`, API perangkat, dan controller ditambahkan: daftar aktif, identitas perangkat ini, konfirmasi keluarkan perangkat lain, retry/refresh, serta akses transfer kunci pengirim.
- Request terikat token pembuka dan dibatalkan saat modal ditutup; hasil sesi lama diabaikan. Operasi diserialkan tanpa sukses optimistis pada kegagalan jaringan.
- Typecheck dan 40/40 berkas tes unit mobile lulus; backend/build frontend lulus. Pemeriksaan race backend lulus pada pengulangan setelah timeout tes tenant pada percobaan pertama. Uji UI di HP, dua perangkat, tema gelap, dan iOS belum dilakukan. Belum dibangun APK baru atau deploy backend.

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
- [x] **BUG FIX (30-Sep-2026): WebRTC "Halo-Halo Tanpa Suara" — 3 Root Cause Kritis Diperbaiki**:
  - **Fix A** (`notificationBackgroundTask.ts`): SDP offer kini selalu diteruskan ke notif lokal `call_incoming`. Sebelumnya `sdp` hilang → `createAnswer("")` → fallback SDP dummy → P2P audio gagal.
  - **Fix B** (`CallContext.tsx`): `joinRoom()` dipanggil **sebelum** `createAnswer()` agar ICE candidates dari caller tidak hilang selama WS reconnect di background.
  - **Fix C** (`CallContext.tsx` + `callAudioManager.ts`): `WebRTCAudioSession` kini menerima `onRemoteStream` callback → `activateRemoteAudioStream()` → remote audio track terhubung ke native audio output.

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
- [x] **M-Mobile-8.27: Mobile Instant Unread Reset & Return-to-Home Sync (28 September 2026)**:
  - Menyelesaikan masalah unread badge yang tidak langsung hilang saat room obrolan dibuka atau saat pengguna kembali ke Home (`RecentChatsScreen`).
  - Menambahkan method `markConversationAsRead` dan `activeRoomId` guard di `ConversationContext.tsx` untuk 0ms optimistic reset.
  - Menambahkan fungsi persistensi `updateStoredConversationUnread` di `sqliteStorage.ts` dan fungsi REST fallback `updateReceipt` di `messages.ts`.
  - Mengintegrasikan `useFocusEffect` di `RecentChatsScreen.tsx` untuk background revalidation otomatis.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.
- [x] **M-Mobile-8.28: Android Status Bar Notification Icon, Instant Decrypt & Anti-Loop Sync (28 September 2026)**:
  - Mengganti template logo default Expo pada Small Icon status bar dengan siluet resmi WuzzChat monokromatik (`mobile/assets/notification-icon.png` dan 5 varian native `drawable-*/notification_icon.png`).
  - Menyelaraskan warna aksen notifikasi (`notification_icon_color` & channel lights) menjadi `#0462E8` (biru WuzzChat).
  - Menyelesaikan bug pesan tertahan di status `Pesan terenkripsi (sedang menyinkronkan kunci...)` saat chat dibuka via notifikasi bar melalui fungsi `extractDMPeerId` yang menangani format multi-tenant `dm_<tenant>_<userA>_<userB>`.
  - Memperkaya `handleTargetNavigation` di `App.tsx` dan `extractTargetRoom` di `notificationService.ts` untuk menyertakan `peer_id` dan `peer_public_key` secara langsung.
  - Menyelesaikan bug auto-redirect looping saat menekan tombol `← Back` ke Home via `handledResponseIdentifiers` Set dan penggunaan `conversationsRef`/`userRef` di `App.tsx`.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.

- [x] **M-Mobile-8.29: SQLite Storage Retention Cap, Cache Pruning & Auto-Vacuum (28 September 2026)**:
  - Mengonfigurasi `PRAGMA auto_vacuum = INCREMENTAL;` pada inisialisasi SQLite database dan eksekusi `PRAGMA incremental_vacuum;` (dengan fallback aman ke `VACUUM;`) untuk mengembalikan ruang disk kosong fisik ke OS Android/iOS.
  - Menerapkan batasan retensi lokal `MAX_LOCAL_MESSAGES_PER_ROOM = 500` dan query pruning efisien `pruneRoomMessages` di `mobile/src/services/sqliteStorage.ts`.
  - Mengintegrasikan pembersihan auto-pruning secara asinkron/non-blocking saat penyimpanan pesan batch (`saveStoredMessages`), hidrasi room obrolan dari SQLite (`hydrateRoomFromLocalDB`), serta sinkronisasi riwayat pesan di `MessageContext.tsx` tanpa memblokir UI thread dan menjaga reverse infinite scroll pagination.
  - Memperbarui `StorageSettingsModal.tsx` dengan kartu informasi kebijakan retensi 500 pesan per room dan memastikan tombol *"Bersihkan Cache Pesan"* menjalankan pembersihan dan incremental vacuum secara tuntas.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.

---

- [x] **M-Mobile-8.30: Interactive Media Viewer (Pinch-to-Zoom) & Room Media Gallery (28 September 2026)**:
  - Mengembangkan komponen penampil media interaktif fullscreen `MediaViewerModal.tsx` dengan dukungan **Pinch-to-Zoom** (skala dinamis hingga 4x), **Pan 2D** mulus, **Double-Tap Zoom Toggle** (1x <-> 2.5x), **Swipe-Down to Dismiss** dengan spring back physics, **Cinematic Mode** (fade header/footer pada tap tunggal), serta lembar aksi native share (`Share.share`).
  - Mengintegrasikan pembukaan `MediaViewerModal` secara instan dari tap thumbnail gambar di `MessageBubble.tsx` dengan fallback visual graceful saat gambar masih diunduh atau gagal dimuat.
  - Mengimplementasikan query khusus `getRoomMediaMessages(userId, roomId, mediaType?)` di `mobile/src/services/sqliteStorage.ts` beserta penambahan indeks `idx_msg_user_room_media` untuk retrieval media dan berkas secara efisien terurut `created_at DESC`.
  - Mengembangkan modal galeri media percakapan `ChatMediaGalleryModal.tsx` dengan tab **Media (Foto & Video)** dalam format 3-column grid dan tab **Dokumen / Berkas** dalam format list informatif (nama berkas, ukuran, tanggal, dan aksi share).
  - Menyediakan akses terpadu ke galeri media percakapan dari tombol header obrolan `🖼️` di `ChatScreen.tsx`, kartu navigasi di profil kontak `ContactInfoModal.tsx`, dan kartu aksi di profil grup `GroupInfoScreen.tsx`.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.

- [x] **M-Mobile-8.31: Fix Force Close on Document Tab in ChatMediaGalleryModal (numColumns Invariant Violation) (29 September 2026)**:
  - Menyelesaikan bug kritis *force close* saat tab **Dokumen** diklik ketika terdapat item dokumen lampiran (`fileList.length > 0`).
  - Mengidentifikasi akar masalah pada rekonsiliasi FlatList React Native: tab Media (3 kolom) dan Dokumen (1 kolom) berada di conditional slot JSX yang sama tanpa `key` unik, memicu fatal runtime error `Invariant Violation: Changing numColumns on the fly is not supported`.
  - Menambahkan key pembeda eksplisit `key="gallery-media-grid"` dan `key="gallery-files-list"` pada masing-masing FlatList agar React melakukan remounting bersih tanpa konflik kolom.
  - Memperkuat `keyExtractor` dengan fallback `media_${index}` dan `file_${index}` serta memvalidasi `formatFileSize` dan `formatDate` (handling `isNaN` sebelum `toLocaleDateString`).
  - Menjadikan seluruh card dokumen dapat disentuh (`TouchableOpacity`) untuk mempermudah pembagian dan pembukaan berkas.
- [x] **M-Mobile-8.32: Multi-Device WebRTC Calling & Call Reject Teardown Shield (30 September 2026)**:
  - Menyelesaikan bug pemutusan panggilan tak terduga saat akun penerima login di 2 perangkat: ketika User B mengangkat di Device 1 lalu Device 2 menolak/menutup panggilan, sesi panggilan Device 1 ikut terputus.
  - Memperbaiki filtering `broadcastLocal` di backend Go agar event `call_answer` tetap diteruskan ke perangkat sekunder Callee, sehingga Device 2 seketika berhenti berdering, membersihkan push notification (`notificationService.dismissNotification`), dan menutup modal panggilan masuk secara otomatis.
  - Menambahkan guard pada backend Go (`hub.go`): jika panggilan di suatu room sudah berstatus `"answered"`, backend mengabaikan sinyal `call_reject` terlambat dari perangkat sekunder sehingga sesi panggilan aktif tidak dihapus dan sinyal tolak tidak disebarkan ke anggota room.
  - Memperkuat listener `call_reject` pada mobile (`CallContext.tsx`) dan web frontend (`page.tsx`) dengan guard `if (current.status === 'connected') return;` untuk memproteksi panggilan yang sedang aktif terhubung dari sinyal penolakan terlambat.
  - Menambahkan automated unit test Go `TestHub_MultiDeviceCallRejectAfterAnswer` di `backend/internal/ws/hub_test.go`.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.
- [x] **M-Mobile-8.33: Fix Unmount on Auth Error to Preserve Device Limit Modal & Login State (30 September 2026)**:
  - Mengatasi bug kritis di mana dialog modal batas kuota perangkat (`DeviceLimitModal` HTTP 409) dan pesan error kredensial tidak muncul saat login gagal di mobile.
  - Mengidentifikasi akar masalah: fungsi `login()` dan `register()` di `mobile/src/context/AuthContext.tsx` memanggil `setIsLoading(true)` pada context global. Hal ini menyebabkan `App.tsx` merender splash screen dan meng-unmount `LoginScreen`.
  - Ketika server merespons dengan HTTP 409 (`DEVICE_LIMIT_REACHED`) atau 401, `setIsLoading(false)` dipanggil di blok `finally`, menyebabkan `App.tsx` me-mount komponen `LoginScreen` baru dari awal dengan state bersih (`isDeviceLimitModalOpen: false`, input kosong), sehingga dialog popup tidak pernah muncul.
  - Memperbaiki `AuthContext.tsx` dengan menghapus mutasi `setIsLoading` global di dalam `login()` dan `register()`, membatasi `isLoading` hanya untuk proses pemeriksaan sesi awal (*cold start*). `LoginScreen` dan `RegisterScreen` mengelola status loading tombol secara lokal tanpa memicu unmount tree.
  - Re-bundle & compile ulang release APK (`./gradlew assembleRelease`) dan instalasi langsung ke perangkat Android fisik via `adb install -r`.
- [x] **M-Mobile-8.34: Fix WebRTC Call Log Resolution, Callback Dialer & Consecutive Grouping (30 September 2026)**:
  - Menyelesaikan bug panggilan tidak masuk saat dipanggil balik dari tab **Panggilan / Log Panggilan** (`CallsHistoryScreen.tsx`):
    - Memperbaiki `handleVoiceCall` di `ChatScreen.tsx` yang sebelumnya menggunakan fallback `conversation.id` (Room ID) untuk `peerId`, sehingga catatan riwayat panggilan menyimpan Room ID alih-alih User ID kontak yang sah.
    - Menambahkan kolom `room_id TEXT` pada skema tabel SQLite `local_call_logs` dan `LocalCallRecord` di `sqliteStorage.ts` dengan migrasi otomatis non-destruktif (`ALTER TABLE local_call_logs ADD COLUMN room_id TEXT`).
    - Menyimpan `room_id: session.room` pada `recordCallLog` dan menambahkan proteksi `ensureConnected(4000)` serta pendaftaran `websocketClient.joinRoom(targetRoomId)` pada `startCall` di `CallContext.tsx`.
    - Memperbaiki `handleInitiateCall` di `CallsHistoryScreen.tsx` agar mencari `conversations` yang ada untuk mendapatkan `room_id` dan `peer_id` kontak yang valid, dilengkapi *backward-compatible recovery* jika log lama mencatat Room ID.
  - Implementasi *Consecutive Call Grouping* (agregasi panggilan beruntun bergaya WhatsApp):
    - Mengelompokkan panggilan beruntun ke/dari kontak yang sama dengan tipe yang sama menjadi 1 baris di UI dengan badge counter (misal: `Budi Santoso (5)`), menampilkan timestamp dan durasi terkini.
    - Aksi hapus log (long press) membersihkan seluruh entri terkait dalam grup tersebut.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `go test ./...` -> **100% PASS**, `npm run build` -> **0 errors**, dan `./gradlew assembleRelease` -> **BUILD SUCCESSFUL**.
- [x] **M-Mobile-8.35: Virtual Keyboard Resilience, Sticky Header Isolation & Modal Soft-Input Standardization (Android 11–16+ & iOS) (30 September 2026)**:
  - Menyelesaikan dua bug kritis tampilan saat keyboard virtual terbuka di perangkat Android lama (Android 11) dan Android baru (Android 16 API 36):
    1. **Android 11 Header Push-Up**: Pada layar obrolan (`ChatScreen.tsx`), header sebelumnya berada di dalam `KeyboardAvoidingView` sehingga saat keyboard muncul dengan mode soft-input bawaan, seluruh header terdorong naik dan hilang dari layar. Diperbaiki dengan mengisolasi header sticky di luar KAV.
    2. **Android 16 Modal Form Covered**: Pada form buat postingan (`CreatePostModal.tsx`) dan modal-modal lain, arsitektur edge-to-edge Android 16 mengabaikan resize pada sub-window modal jika KAV menggunakan `behavior={undefined}`. Diperbaiki dengan menstandarisasi KAV modal ke `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`.
  - Menstandarisasi konfigurasi window soft input mode:
    - Mengganti `android:windowSoftInputMode="adjustPan"` menjadi `adjustResize` di `mobile/android/app/src/main/AndroidManifest.xml`.
    - Menambahkan `"softwareKeyboardLayoutMode": "resize"` di `mobile/app.json`.
  - Menerapkan standardisasi `behavior='height'` pada seluruh dialog modal ber-input (`PostCommentsModal.tsx`, `CreateSubGroupModal.tsx`, `EditProfileModal.tsx`, `KeyConflictModal.tsx`).
  - Mengkodifikasikan aturan baku ini ke dalam Single Source of Truth sistem desain di [mobile/DESIGN.md](../../mobile/DESIGN.md) dan aturan workspace agen di [.agents/AGENTS.md](../../.agents/AGENTS.md).
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**.
- [x] **BUG FIX (30-Sep-2026): Kontras Teks Tombol Sekunder Modal & Bottom Sheet EditProfileModal Mepet Bawah**:
  - **Button Secondary Contrast** (`mobile/src/components/Button.tsx`): Menyetel `getTextColor()` untuk `variant === 'secondary'` ke `colors.textPrimary` (`#0f172a`), menyelesaikan masalah teks tidak terbaca (putih di atas putih) pada `KeyConflictModal` (Reset Kunci Baru, Batal/Keluar), `EditProfileModal` (Batal), `E2EEKeyModal`, dan `StorageSettingsModal`.
  - **EditProfileModal Bottom Sheet Flush** (`mobile/src/components/EditProfileModal.tsx`): Menambahkan `statusBarTranslucent` pada Modal, menjadikan KAV sebagai overlay wrapper utama (`flex: 1, justifyContent: 'flex-end'`) dengan backdrop transparan, mengunci kartu modal agar menempel rapat di tepi bawah layar (`bottom: 0`) dengan safe-area padding `Math.max(insets.bottom, spacing.lg)`, dan `formScroll: { flexShrink: 1 }`.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.

---

### Milestone M-Mobile-9.1: Fondasi Profil & Identitas Publik Mobile Fleksibel & Multi-Tenant (SELESAI - 30/09/2026)
- **Status**: ✅ **Selesai (Completed & Verified)**.
- **Implementasi**:
  - Backend: Kolom `bio`, `role`, dan `metadata JSONB/TEXT` di `users` dengan auto-migration non-destruktif. Struct `User` dan query `UserStore` mendukung pembacaan dan update metadata fleksibel dengan isolasi `tenant_id`. Endpoint `PUT /api/auth/profile` diperbarui untuk menerima field profil publik.
  - Mobile Contracts & Image Picker: Perluasan tipe `User`, `SocialLinks`, `UserPrivacySettings`, `UserMetadata`, serta integrasi `expo-image-picker` di mobile untuk upload avatar native via `mediaApi.uploadMedia()`.
  - Modular UI (`UserProfileScreen.tsx`): Komponen layar profil publik modular dengan Avatar 96px, `VerifiedBadge`, role, bio, kartu lokasi & website, grid medsos interaktif (IG, YT, LinkedIn, TikTok), kartu E2EE fingerprint, dan action button pesan/panggilan berbasis policy privasi.
  - Form Pengeditan Profil (`EditProfileModal.tsx` & `SettingsScreen.tsx`): Form lengkap dengan preview avatar, indikator upload, validasi karakter bio, link sosmed, dan konfigurasi privasi DM/panggilan.
- **Verifikasi**: `npx tsc --noEmit` -> **0 errors**, `go test ./...` -> **100% PASS**, `npm run build` -> **0 errors**.

---

### Milestone M-Mobile-9.2: Spesifikasi Domain, Skema DB & Backend Go Engine (SELESAI - 30/09/2026)
- **Status**: ✅ **Selesai (Completed & Verified)**.
- **Implementasi**:
  - Penyusunan spesifikasi domain DDD lengkap di [`docs/domains/COMMUNITY_FEED.md`](../domains/COMMUNITY_FEED.md).
  - Skema tabel relasional `feed_posts`, `feed_likes`, `feed_comments` dengan isolasi `tenant_id` dan indexing performa tinggi.
  - REST API Go di `backend/internal/api/`: `GET /api/feed`, `POST /api/feed`, `POST /api/feed/:id/like`, `GET /api/feed/:id/comments`, `POST /api/feed/:id/comments`, `DELETE /api/feed/:id`.
  - Kontrol otorisasi & moderasi: pemilik asli atau staf dengan peran `wuzz_admin` / `wuzz_moderator`.
- **Verifikasi**: `go test ./...` -> **100% PASS**.

---

### Milestone M-Mobile-9.3: Integrasi Real Mobile UI, Interaksi & Viral Share Loop (SELESAI - 30/09/2026)
- **Status**: ✅ **Selesai (Completed & Verified)**.
- **Implementasi**:
  - Arsitektur Dual Tab & SWR Cache: Migrasi `FeedScreen.tsx` dari mock statis ke SWR Context Layer (`FeedContext.tsx`) & persistensi SQLite lokal (`local_feed_posts`) dengan rolling window auto-pruning cap (max 50 posts per tab, < 200 KB) untuk cold-start render instan (< 50ms). Tab ganda: "⏱️ Terbaru" (kursor waktu) & "🎲 Jelajah" (deterministic discovery).
  - Pembuat Postingan (`CreatePostModal.tsx`): FAB `+` dengan live 1.000 char counter, pemilih media kamera/galeri native terintegrasi upload REST, serta kontrol admin (`is_pinned`, `post_type`).
  - Interaksi Instan (Optimistic UI): Animasi ketuk Like hati 0ms dengan atomic rollback jika server gagal, serta bottom sheet `PostCommentsModal.tsx` untuk membaca dan mengirim komentar dengan sinkronisasi counter live.
  - Mekanisme Viral Loop (`SharePostToChatModal.tsx`): Meneruskan postingan langsung ke 1–5 ruang obrolan (DM atau Grup) melalui WebSocket dengan preview pesan berformat `[FEED_POST]`.
- **Verifikasi**: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**.

---

- [x] **BUG FIX (30-Sep-2026): Like Race Condition & Komentar Infinite Scroll**:
  - **Rapid-Tap Like Guard** (`FeedContext.tsx`): Menambahkan `likeInFlightRef` per-post lock dan functional updater `setPosts(prev => ...)` untuk mencegah race condition tap cepat dan rollback ke state yang salah.
  - **Komentar Infinite Scroll** (`PostCommentsModal.tsx`): Menambahkan pagination berbasis kursor waktu (`before`), `hasMore`, dan `isLoadingMoreRef` pada `FlatList.onEndReached`.
  - Verifikasi: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**.

---

- [x] **BUG FIX (01-Okt-2026): Universal Android Keyboard Resilience & Input Clipping on Android < 16**:
  - **Root Cause**: `MainActivity.kt` & `withAndroidEdgeToEdgeKeyboard.js` membatasi listener insets IME hanya untuk `Build.VERSION.SDK_INT >= 35`. Pada Android < 16 (Android 11–14), listener tidak aktif dan native `adjustResize` tidak jalan karena layout edge-to-edge. Ditambah `KeyboardAvoidingView` di `ChatScreen.tsx` menggunakan `behavior='height'` yang under-calculated sebesar `insets.top` (~35dp), memotong bagian bawah `ChatInputBar`.
  - **Fix**:
    1. Mengaktifkan `ViewCompat.setOnApplyWindowInsetsListener` secara universal untuk seluruh versi Android di `MainActivity.kt` dan Expo plugin `withAndroidEdgeToEdgeKeyboard.js`.
    2. Menstandardisasi `KeyboardAvoidingView` di `ChatScreen.tsx` menjadi `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` agar tidak berkonflik dengan native window insets pada Android.
    3. Menyelaraskan referensi panduan desain di `mobile/DESIGN.md`.
  - **Verifikasi**: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.

---

- [x] **BUG FIX (01-Okt-2026): Presisi Layout Android 16 (Edge-to-Edge Navigation Clearance) & Dynamic Versioning Pengaturan**:
  - **Root Cause**:
    1. **Android 16 Enforced Edge-to-Edge**: Pada Android 15 & 16 (API 35+), edge-to-edge dipaksakan oleh sistem sehingga `insets.bottom` bertambah (~24-48dp) menampung gesture/3-button navigation bar. Pada `SettingsScreen.tsx`, `scrollContent` hanya menggunakan fixed `paddingBottom: 32dp` (tanpa `insets.bottom`), menyebabkan footer ("WuzzChat · End-to-End" & versi) terhimpit tepat di atas bottom tab bar.
    2. **Tab Bar Active Dot Drift**: `activeDot` pada `MainTabNavigator.tsx` menggunakan `position: 'absolute', bottom: -4` dari `tabItem`, sehingga saat tab bar bertambah tinggi di Android 16, titik biru bergeser jauh ke bawah menjauhi label "Pengaturan".
    3. **Hardcoded Version**: String versi di `SettingsScreen.tsx` sebelumnya tertulis statis `v1.0.0 · Aurora Build`, mengabaikan nomor rilis dinamis di `app.json` (`1.1.1`).
  - **Fix**:
    1. Menambahkan dynamic bottom padding pada `ScrollView` `SettingsScreen.tsx`: `paddingBottom: Math.max(insets.bottom + 88, 100)` agar konsisten dengan `RecentChatsScreen` dan `FeedScreen`.
    2. Mengintegrasikan `getAppVersionInfo()` dari `src/utils/appVersion.ts` sehingga versi dan nomor build diambil secara otomatis dari metadata Expo/app.json (`v1.1.1 (Build 3) · Aurora Build`).
    3. Memperbaiki kontras teks footer dan menghapus `opacity: 0.6` yang menyebabkan teks pudar/sulit dibaca pada latar terang.
    4. Mengunci `activeDot` pada `MainTabNavigator.tsx` tepat di bawah label teks (`marginTop: 3`) dengan layout stabil tanpa lonjakan antar tab.
    5. Menghadirkan modal **Tentang WuzzChat** (`AboutWuzzChatModal.tsx`) di bawah section *Preferensi & Info* yang memuat misi WuzzChat (*"mengubah percakapan menjadi pengetahuan yang dapat dicari, dipahami, dan diingat kembali"*), pilar arsitektur (E2EE, Memory, Kinerja), serta menyelaraskan footer branding menjadi: `WuzzChat — Mengubah percakapan menjadi pengetahuan`.
  - **Verifikasi**: `npx tsc --noEmit` -> **0 errors**, `npm run build` -> **0 errors**, `go test ./...` -> **100% PASS**.

---

- [x] **FITUR (01-Okt-2026): Pratinjau Tautan Web (Link Preview Card) & Auto-Linking Teks Aman di Mobile**:
  - **Latar Belakang**: Tautan URL yang dikirim di percakapan (personal maupun grup) sebelumnya hanya dirender sebagai string biasa (tidak bisa diklik), dan belum ada kartu pratinjau thumbnail/judul OpenGraph di aplikasi mobile.
  - **Implementasi**:
    1. **Auto-Linking & Sanitasi Tautan (`mobile/src/utils/linkUtils.ts`)**:
       - Mengurai teks konten pesan menggunakan `URL_REGEX` pendeteksi URL `http/https`, `www.`, serta nama domain umum (`.id`, `.com`, `.net`, dll.).
       - Menghilangkan tanda baca trailing (`.,;:!?()[]"'`) dari URL yang berada di dalam kalimat.
       - Membuka tautan eksternal via `safeOpenUrl` langsung ke browser HP menggunakan `Linking.openURL(targetUrl)` di dalam blok `try...catch` aman (membypass gate `canOpenURL` yang bermasalah di Android 11–16+ karena package visibility).
       - Memperbarui intent queries `<action android:name="android.intent.action.VIEW"/>` untuk skema `http` dan `https` di `AndroidManifest.xml`.
       - Menjaga kontras WCAG AA tajam (`#e0f2fe` di gelembung pengirim, `#38bdf8` di gelembung lawan bicara).
    2. **Komponen Kartu Pratinjau (`mobile/src/components/LinkPreviewCard.tsx`)**:
       - Kartu visual yang menampilkan thumbnail OpenGraph/oEmbed, favicon/globe badge, nama host domain, judul web, dan deskripsi singkat.
       - Disertai skeleton loader dan penanganan silent error fallback.
       - Mengikuti pola standar WhatsApp/Telegram: maksimal 1 kartu preview per pesan untuk URL pertama (`extractFirstUrl`).
    3. **In-Memory Cache Ber-TTL 1 Jam (`mobile/src/api/linkPreview.ts`)**:
       - Menyimpan hasil scrape di RAM (kapasitas 100 entri) dengan masa berlaku (TTL) 1 Jam (`CACHE_TTL_MS = 3600000`) untuk menjamin scrolling FlatList tetap 60 FPS instan tanpa query berulang, namun otomatis mengambil data terbaru saat cache kedaluwarsa.
       - Timeout request dibatasi maksimal 8 detik dengan `AbortController`.
  - **Verifikasi**: `npx tsc --noEmit` -> **0 error**, `go test -v ./internal/api -run TestLinkPreview` -> **100% PASS**, Build APK Release & install via ADB terbukti sukses.

---

- [x] **FITUR (03-Okt-2026): Sistem Ikon Vektor Wuzz (`Icon`, `IconText`) menggantikan emoji UI di Mobile**:
  - **Latar Belakang**: Ikon UI (tab bawah, tombol, badge, label) memakai emoji yang tampilannya berbeda antar vendor/versi Android dan tidak bisa diwarnai. Tujuannya membangun gaya dan branding ikon Wuzz sendiri (outline tipis, ujung membulat).
  - **Implementasi**:
    1. **Registry (`mobile/src/components/icons/registry.ts`)**: satu-satunya tempat ikon didefinisikan (path `d` pada kanvas 24×24, ~85 ikon). Mendukung varian `filled` (aktif) dan flag `solid`. Nama ikon otomatis menjadi tipe `IconName`.
    2. **`Icon` (`mobile/src/components/Icon.tsx`)**: render via `react-native-svg` (dependency baru `15.15.4`), garis 1.75 (aktif 2.1), warna lewat prop `color`/token `colors`.
    3. **`IconText` (`mobile/src/components/IconText.tsx`)**: teks dengan ikon di depan. Emoji di awal string dipetakan ke ikon lewat `EMOJI_TO_ICON` (termasuk komposit `👥➕`, `👤❌`), jadi string data (`'🔒 Pesan terenkripsi'`) tidak diubah. Ukuran/warna ikon mengikuti `fontSize`/`color` style teks; properti layout dipindah ke wadah.
    4. **Pemasangan**: tab bawah (`MainTabNavigator.tsx`), header/input bar/bubble chat, daftar obrolan, ± 29 file tombol `✕`/`←`, dan ± 200 elemen `<Text>` berawalan emoji di ± 50 file. Ikon `chat` didesain ulang (gelembung persegi dengan ekor tegas + tiga titik) setelah uji di perangkat menunjukkan placeholder lama terlihat kosong.
  - **Sengaja masih emoji**: picker & reaksi (`constants/emojis.ts`, 👍), avatar hewan, notifikasi push/teks yang dibagikan, titik status 🟢🔴🟡, dan emoji dekoratif (🧠 🚀 🧪 📭 🤝 🎲 🔢).
  - **Catatan**: semua path di registry masih **placeholder**; diganti bertahap dengan SVG gambar sendiri (`registry.ts` hanya butuh path `d`). `react-native-svg` modul native → butuh build APK ulang.
  - **Verifikasi**: `npx tsc --noEmit` -> **0 error**; build APK release & uji tampilan di perangkat oleh pengguna.

---

- [x] **PERBAIKAN (05-Okt-2026): Layar "Kunci & Keamanan E2EE" — hapus QR Identitas, sidik jari jadi SHA-256 sungguhan**:
  - **Latar Belakang**: kartu "Kode QR Identitas" (`E2EEKeyModal.tsx`) memuat `{type:'wuzz_identity',...}` yang tidak dibaca komponen mana pun; pemindai `SafetyNumberModal` hanya menerima format `wuzz-safety://<A>/<B>/<30 digit>` atau 30 digit. Memindainya menghasilkan "Format QR Tidak Dikenal". Nomor keamanan bersifat per-pasangan sehingga satu QR identitas tidak bisa dibandingkan. Selain itu "Sidik Jari Kunci Publik" dikomentari SHA-256 padahal hash 32-bit (`hash*31`) yang dipecah menjadi 8 kelompok (hanya 32 bit informasi).
  - **Perubahan**: kartu QR dihapus (beserta style dan state terkait); sidik jari kini `SHA-256(publicKeyJWK)` via `@noble/hashes` (sudah dipakai `generateSafetyNumber`), tampil 16 kelompok hex × 4 baris (`formatKeyFingerprint`). Teks kartu mengarahkan ke **Nomor Keamanan di info kontak** untuk verifikasi per kontak (QR yang berfungsi ada di tab QR modal itu).
  - **Temuan susulan (jalur verifikasi tak terjangkau)**: `ContactInfoModal` (tombol "Pindai / Cocokkan Kode Keamanan") hanya dibuka bila `onOpenUserProfile` tidak dikirim, padahal `AppNavigator` selalu mengirimnya (header chat membuka `UserProfileScreen`). Jadi verifikasi Nomor Keamanan/QR tidak bisa dibuka dari aplikasi. **Perbaikan**: `UserProfileScreen` (profil orang lain) kini punya kartu "Nomor Keamanan" (status Terverifikasi/E2EE Aktif, nomor 30 digit, tombol "Verifikasi Nomor Keamanan") yang membuka `SafetyNumberModal`; kartu tampil setelah kunci publik kedua pihak tersedia (`user.public_key` atau `getUserPublicKey`). `ContactInfoModal` dihapus beserta ekspor dan pemakaiannya di `ChatScreen`. **Warna**: style kartu/tombol semula disalin dari tema gelap (`bgOverlay` = scrim hitam transparan, `colorCyanNeon`) sehingga teks tak terbaca di tema terang (terlihat di RMX3506). Diganti token tema terang (`tintAccent10/30`, `textPrimary`, `accentPrimary` + `textOnAccent`) di `UserProfileScreen`, dan `SafetyNumberModal` (latar kartu `bgSurface`, angka `textPrimary`, tombol pindai solid).
  - **Temuan susulan 2 (QR tidak pernah bisa dipindai)**: uji di 2 HP (Semantic memindai Alice) — kamera terbuka 40 dtk tanpa error, tetapi tidak ada QR yang terbaca. Dekode screenshot QR di layar dengan jsQR gagal, sedangkan QR kontrol dari pustaka `qrcode` (ukuran sama, 41×41) terbaca. Penyebab: generator QR buatan sendiri (`services/qrCodeService.ts`) menghasilkan QR **tidak valid** di semua versi (versi 1 "HELLO" pun gagal; blok Reed-Solomon V4–V5 tidak di-interleave; payload > kapasitas V5 dipotong diam-diam). Dampak juga ke QR transfer kunci E2EE (`DeviceTransferModal`). **Perbaikan**: `generateQRMatrix` kini membungkus `qrcode-generator@2.0.4` (JS murni, tanpa native; antarmuka tetap `boolean[][]`), diuji dekode jsQR di panjang 10–600 karakter dan UTF-8. **Catatan**: versi pertama perbaikan ini (`qrcode.stringToBytesFuncs['UTF-8']`) membuat aplikasi **crash saat dibuka** (`TypeError: Cannot read property 'UTF-8' of undefined`) karena Metro memakai build ESM (`qrcode.mjs`) yang tidak punya properti itu, sedangkan uji node memakai build CJS. Kini teks diubah ke byte UTF-8 secara eksplisit di `generateQRMatrix` tanpa properti global pustaka, dan diuji di build CJS **dan** ESM. Payload QR Nomor Keamanan dipersingkat menjadi `wuzz-safety://<30 digit>` (33×33; QR lama berisi ID tetap terbaca).
  - **Dampak**: nilai sidik jari yang tampil berubah (format dan panjang); tidak memengaruhi enkripsi, kunci, maupun nomor keamanan.
  - **Verifikasi**: `npx tsc --noEmit` -> **0 error**; keluaran `formatKeyFingerprint` dicocokkan dengan `node:crypto` SHA-256 (identik). Belum diuji tampilan di perangkat (perlu build APK).

---

### Milestone Kepatuhan Play Store: Hapus Akun, Laporan & Blokir, Halaman Legal (SELESAI - 05/10/2026, belum di-commit)
- Backend: `DELETE /api/auth/me` (transaksi tunggal `SQLAccountEraser`), `content_reports` + `/api/reports`, `POST/DELETE /api/connections/block` dengan penegakan di `IsUserInConversation` (DM). Tes: `auth_delete_account_test.go`, `report_handler_test.go`, `connection_block_test.go`.
- Frontend web: `/privacy`, `/terms`, `/delete-account` (server component, kelas `.legal-*` di `globals.css`, dikecualikan dari gate).
- Mobile: `DeleteAccountModal`, `ReportModal`, menu Legal & Hapus Akun di Pengaturan, Laporkan di pesan/postingan/komentar, Blokir/Laporkan di profil.
- **Perlu deploy backend** (`ssh deploy@<VPS_IP> ./deploy-chat.sh`) dan rebuild frontend; mobile butuh build baru.

## Fokus Berikutnya (What's Next)

- **Alat moderasi laporan (halaman web moderator)** — rencana lengkap di `docs/plans/backlog/MODERATION_TOOL.md` (backend: penangguhan akun + audit + endpoint admin; frontend: `/admin/reports`; SOP). Dicatat 5 Okt 2026, belum dikerjakan.
- [x] **Milestone M-Mobile-9: Community Social Feed & User Acquisition Engine (Model B)**:

  - [x] **Tahap 1 (M-Mobile-9.1)**: Fondasi Profil & Identitas Publik Mobile (`bio`, `role`, `metadata` JSONB di `users`, upload avatar kamera/galeri mobile, `UserProfileScreen.tsx`).
  - [x] **Tahap 2 (M-Mobile-9.2)**: Spesifikasi Domain, Skema DB & Backend Go Engine (`docs/domains/COMMUNITY_FEED.md`, `feed_posts`, `feed_likes`, `feed_comments`, REST API `/api/feed`).
  - [x] **Tahap 3 (M-Mobile-9.3)**: Integrasi Real Mobile UI, Interaksi & Viral Share Loop (`FeedScreen.tsx` SWR cache, FAB Create Post, Likes/Comments, Share to Chat).
- [x] Video player fullscreen mobile (`expo-video`), diimplementasikan 16 Okt 2026; lihat entri video di bawah untuk cakupan pengujian.
- [ ] Pengujian build native iOS via Xcode / CocoaPods & APNs background decryptor.
- [ ] WebRTC 1-on-1 Video Calling (P2P Video track via `RTCView`).



- [x] **Migrasi ikon emoji ke ikon vektor** (selesai 03-Okt-2026, lihat entri di atas).
- [ ] **Ikon Wuzz final**: ganti path placeholder di `icons/registry.ts` dengan SVG gambar sendiri (prioritas: tab bawah, `lock`, `check`/`checkDouble`, lencana verified), putuskan ketebalan garis, dan ganti titik status 🟢🔴🟡 dengan lingkaran berwarna.
- [x] **Login Google, fase 2 mobile (kode, 6-Okt-2026, belum dijalankan di perangkat)**: library `react-native-nitro-google-signin` (Credential Manager), `services/googleAuth.ts`, `GoogleOnboardingScreen`, tombol di `LoginScreen`, item Pengaturan, re-auth Google di `DeleteAccountModal`/`KeyConflictModal`. Nonaktif sampai `GOOGLE_AUTH_CONFIG.WEB_CLIENT_ID` diisi. Detail: `docs/plans/backlog/GOOGLE_LOGIN.md` bagian 9.
- [x] **Login Google fase 3 (kode, 6-Okt-2026, belum dibuild)**: banner pengumuman penautan dengan hitung mundur (`GoogleLinkBannerLayout`, `googleLinkDeadline.ts`, `useLinkGoogle`); aktif hanya bila server mengirim `google_link_required_by` (env `GOOGLE_LINK_DEADLINE`).
- [x] **Login Google fase 4 klien (kode, 6-Okt-2026, belum dibuild)**: `GoogleLinkRequiredScreen` untuk akun beku, sinyal `linkFrozen.ts`, penanganan 403/WS 4003, perlindungan kunci E2EE saat beku. Aktif hanya bila server menyalakan `GOOGLE_LINK_FREEZE`.

### AI Memory di Mobile (12 Oktober 2026) — UI selesai, belum diuji di perangkat
- [x] **Arsip Memori & Review Admin**: tombol "Memori" di `GroupInfoScreen` membuka `MemoryArchiveModal` (satu `BottomSheetModal` dengan tumpukan tampilan internal): daftar arsip terverifikasi + paginasi, detail (`MemoryDetailView`: ringkasan, keputusan, kutipan bukti, Journey Lite), dan untuk admin/creator tab "Perlu Ditinjau" → `MemoryReviewView` (sunting butir, hapus Journey Lite, setujui/setujui dengan suntingan, tolak dengan alasan). Kode: `mobile/src/api/memory.ts`, `mobile/src/components/memory/`.
- Memakai endpoint backend yang sudah ada (tanpa perubahan backend). Produksi masih `MEMORY_WORKER_ENABLED=false`, jadi arsip kosong sampai worker diaktifkan (urutan: lihat `docs/domains/AI_MEMORY.md`).
- **Whitelist & hapus (12 Okt 2026, di `dev`, belum dideploy):** tombol "Memori" hanya tampil bila `memory_enabled` dari server bernilai true (env `MEMORY_ENABLED_GROUPS`, lihat `docs/domains/AI_MEMORY.md`). Admin/creator dapat menghapus memori (di tampilan detail) dan draf ("Hapus draf" di tampilan review). Backend: `store/memory_gate.go`, `store/memory_store_delete.go`, `DELETE /api/memories/{id}` dan `DELETE /api/memory/drafts/{id}`.
- **Akhiri topik dari mobile (13 Okt 2026):** `SubGroupListModal` kini punya tombol "Akhiri Topik Sekarang" (admin/creator, topik aktif, dengan konfirmasi) yang memanggil `POST /api/groups/{id}/subgroups/{subId}/expire` (`subgroupsApi.expireSubGroup`). Sebelumnya hanya web yang bisa; ini memicu pembuatan job AI Memory bila grup masuk `MEMORY_ENABLED_GROUPS`.
- **Penguncian topik saat diakhiri (13 Okt 2026):** server sudah menolak kirim lewat WebSocket begitu `expires_at` terlewat (gerbang fail-closed); `ForwardMessage` kini juga menolak topik tujuan yang sudah berakhir (`ErrTargetRoomExpired`, HTTP 403, semua-atau-tidak-sama-sekali). Mobile `ChatScreen`: banner dan input terkunci seketika saat ack error / pesan `ERROR:` "kedaluwarsa" diterima, dan detail topik aktif disegarkan tiap 30 dtk agar penguncian oleh admin terlihat tanpa harus mencoba mengirim. Catatan: event `subgroup_expired` disiarkan ke ruang grup INDUK, bukan ruang topik, sehingga anggota yang sedang di dalam topik tidak menerimanya; itu sebabnya dipakai ack dan polling.
- **Daftar arsip lebih informatif + perbaikan kontrak (13 Okt 2026):** judul baris = nama topik forum (14 Okt 2026: sebelumnya kalimat pertama ringkasan AI, dibalik karena bug judul "Forum Diskusi" sudah diperbaiki), ringkasan AI dua baris di bawahnya, titik "Baru" untuk memori belum dibaca (`has_viewed`), penyetuju (`approved_by_name`, kini diisi backend dari anggota grup) dan lencana "Disunting". Bug yang ikut diperbaiki: `decisions_count` (bukan `decision_count`), `artifact_count` tidak ada di respons draf, dan **judul selalu "Forum Diskusi"**: `ForumContextSource` memanggil `GetGroupDetails(topikID, "")` yang untuk subgrup selalu ditolak gerbang keanggotaan induk (`ErrUnauthorizedGroup`) lalu jatuh ke judul cadangan. Perbaikan: `GroupStore.GetGroupSummary` (metadata tanpa pemeriksaan akses pemanggil, hanya internal) dipakai di `GetContextMeta`, `GetMessages`, dan `GetAuthorizedViewers`; efek samping positif: pemeriksaan tenant di dua fungsi terakhir kini benar-benar berlaku untuk subgrup.
- Belum ada: notifikasi push mobile untuk draf siap ditinjau (backend `NotifyMemoryEvent` baru Web Push), lompat ke pesan asal dari kutipan bukti.

### Bubble Forum, Tahap 1 (13 Oktober 2026) — kode selesai, belum diuji di perangkat
- [x] **Bubble Forum di beranda** (`components/forum/ForumBubble.tsx`, di atas FAB obrolan di `RecentChatsScreen`): membuka sheet "Buat forum baru". Grup yang bisa dipilih hanya yang user kelola (admin/creator) lewat `ForumGroupPicker`; satu grup langsung dipakai. Anggota biasa melihat pesan "Hanya admin grup yang bisa membuat forum" + jalur "Buat grup baru"; tanpa grup, langsung "Buat grup baru". Setelah grup dibuat (`NewGroup` param `thenCreateForum`, sinyal `services/forumCreateIntent.ts`), beranda membuka form forum untuk grup itu. Setelah forum terbuat, user langsung masuk ke chat topik. `CreateSubGroupModal` kini punya prop `showMemoryHint` (keterangan AI Memory, tampil bila `memory_enabled` dari server).
- Tanpa perubahan backend. Multi-tenant: daftar grup dari percakapan user (server memfilter tenant), klien tidak mengirim tenant.
- **Berikutnya:** Tahap 2 "Forum saya" (Aktif/Tidak aktif, filter Semua/Admin/Anggota, ikon peran) + endpoint agregat backend; Tahap 3 buka whitelist. Rencana lengkap: `docs/plans/backlog/FORUM_BUBBLE.md`.

### Bubble Forum, Tahap 2 (13 Oktober 2026) — "Forum saya", kode selesai, belum diuji di perangkat, backend belum dideploy
- [x] **Endpoint `GET /api/forums/mine`** (JWT): forum tempat user menjadi anggota topik, aktif dan berakhir. Respons `{success, forums[]}` dengan `my_role` per topik, `is_active` (ditentukan server dari status + `expires_at`), `parent_title`, `member_count`, `remaining_seconds`, `has_approved_memory`. Kode: `store/sql_group_store_forums.go` (`GetUserForumsWithContext`), `group.ForumService.GetUserForums`, `api.GroupHandler.GetMyForums`, rute di `app/router.go`. Maks 300 baris; aktif lebih dulu.
- **Multi-tenant:** forum dan grup induk wajib satu tenant dengan request (tenant dari `context`, tenant `default` memakai tenant asli user seperti daftar obrolan); keanggotaan dicek di topik DAN grup induk. Tes `store/user_forums_test.go` mencakup lintas tenant (ID user dicampur), mantan anggota grup induk, dan bendera memori. Tes dijalankan di SQLite; varian Postgres belum dijalankan (butuh DSN pgtest).
- [x] **Mobile:** `MyForumsView` (Aktif / Tidak aktif, filter Semua / Admin / Anggota dengan creator digabung ke Admin, ikon peran: bintang terisi = pembuat, bintang garis = admin, anggota tanpa ikon), cache per akun + penyegaran latar, pintas "Memori" untuk topik berakhir yang memorinya sudah disetujui (membuka `MemoryArchiveModal`). Pilihan "Forum saya" di sheet `ForumBubble`.
- **Perlu deploy backend** (`ssh wuzz-vps ./deploy-chat.sh`, setelah merge ke `main`) sebelum "Forum saya" berfungsi; tanpa itu daftar menampilkan "Gagal memuat forum".
- **Perbaikan setelah uji HP (13-14 Okt 2026):** pemilih grup Bubble Forum membaca peran dari field `role` (daftar obrolan server mengirim `role`, bukan `my_role`); warna bubble disamakan dengan FAB obrolan; tombol "Memori" di "Forum saya" kini langsung membuka detail memori topik itu (`MemoryArchiveModal` prop `initialForumId`; bila memorinya tak ada di halaman pertama, tetap di daftar arsip). Diamati: tombol kembali dari chat topik jatuh ke chat grup induk, bukan ke beranda (perilaku navigasi topik yang lama; belum diubah).
- **Dialog hapus memori (14 Okt 2026):** teks diperjelas (nama topik, berlaku untuk semua anggota grup, ringkasan/keputusan/bukti ikut hilang, percakapan topik tidak terhapus, tidak bisa dibatalkan). Tombol "Hapus Memori" hanya untuk admin/creator GRUP INDUK (mobile `canDelete={isAdmin}`, backend `authorizeDelete`).
- **Belum teruji di perangkat:** pesan "Hanya admin grup yang bisa membuat forum" untuk anggota biasa dan jalur "Buat grup baru" untuk akun tanpa grup (akun uji utama admin/creator di semua grupnya; butuh akun non-admin dengan APK baru), serta filter Admin/Anggota dengan lebih dari satu forum.
- **Tombol kembali topik dari Bubble Forum (14 Okt 2026):** rute `Chat` punya param `fromForumBubble`; `ChatScreen` prop `backToOrigin` membuat panah kembali di header topik langsung `onBack()` (kembali ke beranda) alih-alih ke chat grup induk. Berlaku untuk topik yang dibuka dari "Forum saya" dan topik yang baru dibuat lewat bubble. Jalur lain (Info Grup, daftar forum, chat grup) tidak berubah: panah header tetap ke grup induk; ketuk judul/breadcrumb topik tetap ke grup induk. Belum diuji di perangkat.

### Kirim Video di Chat, Tahap 1-2 (16 Oktober 2026) — kode selesai di `dev`, belum diuji di perangkat, backend belum dideploy
- Rencana lengkap: `docs/plans/backlog/VIDEO_MESSAGE_R2.md`. Keputusan: video ke **Cloudflare R2**, unggah **langsung dari HP** lewat URL presigned, **tanpa fallback upload lewat VPS** (gagal = galat + coba lagi), batas **60 detik / 25 MB**, retensi media tetap 1 hari.
- **Backend (Tahap 1):** driver `r2` (`storage/r2_storage.go`, penanda tangan SigV4 buatan sendiri diuji dengan vektor resmi AWS), fail-closed bila env R2 kurang, `/api/media/upload` mengembalikan 410 untuk driver R2, `?purpose=video` pada `signed-upload-url` (ekstensi mp4/mov/m4v/webm, batas `MAX_VIDEO_UPLOAD_MB`, `file_size` dan `thumb_size` wajib; `Content-Length` ikut ditandatangani), `/api/config` menyajikan `max_video_size_mb` dan `max_video_duration_seconds`. Thumbnail tidak disimpan di database: kuncinya diturunkan dari kunci video (`<uuid>.mp4` menjadi `<uuid>.thumb.jpg`), `PurgeWorker` menghapusnya bersama video.
- **Mobile (Tahap 2):** `services/videoPrep.ts` (validasi durasi, kompres `react-native-compressor`, coba ulang dengan bitrate rendah bila > 25 MB, thumbnail `expo-video-thumbnails` ≤ 512 KB), `mediaApi.uploadVideo` (unggah berbasis berkas dengan progres, bukan memuat ke memori), pilihan "Video" (rekam) dan galeri foto+video di lembar Lampirkan, banner "Menyiapkan video…" dan progres unggah di `ChatInputBar`. **Fallback VPS dihapus** dari `mediaApi.uploadMedia` (semua jenis media). Dependensi baru: `expo-video`, `expo-video-thumbnails`, `react-native-compressor` (modul native: **butuh build APK baru**).
- **Dampak dev lokal:** driver `local` tidak mendukung signed upload, jadi unggah media dari app tidak jalan di server lokal tanpa Supabase/R2.
- **Tahap 3 (tampilan dan pemutaran, 16 Okt 2026):** `VideoMessageCard` (thumbnail dari URL turunan `<kunci>.thumb.jpg`, tombol putar, ukuran berkas; video tidak dimuat sampai diketuk), `VideoPlayerModal` (expo-video, layar penuh, pemutar dibuat hanya saat modal terbuka), `utils/videoMedia.ts` (`isVideoMessage` memprioritaskan `media_type` agar `.webm` audio tidak dianggap video). Video penerima di-cache lokal dan di-ACK saat pertama dibuka. Galeri media menampilkan thumbnail video dan membuka pemutar. Teks "🎥 Video" di kutipan balasan, daftar obrolan, dan dialog teruskan (snippet backend dan notifikasi latar belakang sudah ada sebelumnya). Durasi tidak ditampilkan di bubble (tidak disimpan di server). Pesan video yang baru kita kirim memakai pratinjau lokal (`local_thumb_uri`). Kompilasi Android (`:app:compileDebugKotlin`) lolos dengan modul baru.
- **Belum ada (Tahap 4):** sisi web.
- **Uji di produksi (16 Okt 2026, sebagian):** R2 siap (bucket `wuzzchat`, domain publik `media.wuzzhub.id`, CORS untuk `https://chat.wuzzhub.id`, Cache Rule **Bypass cache** untuk hostname itu supaya video yang dihapus tidak tersisa di CDN). `go run ./cmd/r2check` (mode langsung) lulus semua terhadap R2 nyata: tanda tangan SigV4 diterima, ukuran dan `Content-Type` yang berbeda dari tiket ditolak 403, baca publik + Range 206, CORS dan preflight, hapus. Backend dideploy dari `main` (`0dfa5bb`), `STORAGE_DRIVER=r2`, `/api/config` memuat batas video. Dicatat: env VPS sempat salah (`R2_ACCOUNT_ID` tanpa `=` langsung, dan `R2_TOKEN_VALUE` yang tidak dipakai kode ikut tersimpan; yang terakhir dihapus).
- **Uji di HP (RMX3506, APK 1.37.0/63, akun `mhdarifsetiawan`, grup uji 1 anggota):** video 70 dtk ditolak ("Video terlalu panjang. Durasi maksimal 60 detik."); video 6 dtk 2,3 MB dikompres menjadi 1,5 MB dengan thumbnail dan durasi; terkirim (bubble dengan thumbnail, tombol putar, chip ukuran, centang); pemutar layar penuh berjalan; daftar obrolan menampilkan "Anda: 🎥 Video". Dari laptop: objek `<uuid>.mp4` (1.532.037 byte, H.264+AAC 1280x720 6 dtk) dan `<uuid>.thumb.jpg` ada di `media.wuzzhub.id`, `Content-Type` benar, Range 206, `cf-cache-status: DYNAMIC`.
- **Belum diuji:** pemutaran dari R2 oleh penerima tanpa salinan lokal (pemutaran di HP pengirim memakai salinan lokal), opsi "Video" (rekam kamera), video besar yang butuh kompresi agresif, unggah terputus di tengah (harus galat + coba lagi tanpa fallback), penghapusan video dan thumbnail oleh `PurgeWorker` (objek uji dihapus ±1 hari setelah pengiriman), dan seluruh sisi web (ditunda; fokus mobile). Jangan memakai "Bersihkan Cache" di Pengaturan untuk menguji jalur jarak jauh: itu tidak menghapus "Media Chat Tersimpan" (salinan lokal permanen) dan foto lama yang sudah kedaluwarsa di server tidak bisa dipulihkan.

- **Perapian penyimpanan video (16 Okt 2026, di `dev`, belum dideploy):** (1) kunci video R2 berawalan `video/` (`storage.VideoKeyPrefix`; thumbnail mewarisi) agar lifecycle rule R2 untuk awalan `video/` bisa menjadi jaring pengaman berkas yatim tanpa menyentuh avatar/Feed; `r2check` menambah pemeriksaan awalan. (2) `PurgeWorker` kini memasukkan berkas yang gagal dihapus ke `media_purge_queue` (`MediaPurgeQueue.Enqueue`, dicoba ulang dengan jeda 1, 2, 4... jam, maks 10 kali) alih-alih membiarkannya yatim; galat hapus thumbnail ikut dihitung; bila antrean gagal pesan tidak ditandai `expired`. Tes: `purge_retry_test.go`, `TestR2Storage_VideoKeysUseVideoPrefix`. Jalur PostgreSQL untuk `Enqueue` memakai sintaks `ON CONFLICT DO NOTHING` yang sama dengan penghapus akun, belum dijalankan di Postgres uji. **Perlu setelah deploy:** pasang lifecycle rule `video/` (hapus setelah 3 hari) di dashboard R2.
- **Video penerima diunduh sekali (16 Okt 2026, di `dev`, belum dibuild/diuji di HP):** sebelumnya mengetuk video memutarnya dari R2 sekaligus mengunduh seluruh berkasnya ke cache lokal (data seluler terpakai dua kali). Kini ketukan pertama (belum ada salinan lokal) mengunduh SEKALI dengan progres di kartu (ikon panah bawah, lalu lingkaran persen), menyimpannya ke cache persisten, lalu memutar berkas lokal; ACK dikirim setelah tersimpan. `mediaCache.downloadToCache`: ditulis ke `.part` dan dipindah ke nama akhir hanya bila status 200 dan ukuran sama dengan `file_size` pesan, jadi unduhan terputus atau jawaban galat (404 berkas kedaluwarsa) tidak pernah tersimpan sebagai media rusak; dua ketukan bersamaan berbagi satu unduhan; galat: "Video Kedaluwarsa" (404/403/410) atau "Gagal Mengunduh Video" (ketuk lagi untuk mencoba). Pengirim dan video yang sudah tersimpan langsung diputar lokal. Galeri media masih memutar dari jaringan tanpa menyimpan (tidak ada unduhan ganda). Tes: `scripts/test/video-download.test.js` (7 skenario; harness mendapat tiruan `expo-file-system/legacy`), `npm run test:unit` 29/29, `npx tsc --noEmit` bersih. **Catatan uji:** jalur unduh hanya bisa diuji oleh penerima tanpa salinan lokal (perangkat/akun lain); "Bersihkan Cache Pesan/Gambar" tidak menghapus "Media Chat Tersimpan". Berkas `.part` sisa karena aplikasi dimatikan paksa saat mengunduh dihapus pada unduhan berikutnya untuk pesan yang sama, tetapi belum ada pembersih untuk pesan yang tak pernah dibuka lagi.
- **Perbaikan thumbnail video (16 Okt 2026, ditemukan saat uji HP, di `dev`, belum dibuild):** bubble video milik pengirim menjadi kotak gelap setelah chat dibuka ulang, dan penerima akan kehilangan thumbnail begitu video selesai diunduh. Penyebab ganda: (1) `MessageContext.appendMessage` mempertahankan `media_url` LOKAL pesan optimistik saat jawaban server tiba, padahal thumbnail diturunkan dari URL jarak jauh; (2) kartu video menurunkan thumbnail dari `effectiveMediaUrl`, yang berubah menjadi path lokal setelah berkas ter-cache. Perbaikan: `utils/optimisticMerge.ts` (video memakai `media_url` server dan mempertahankan `local_thumb_uri`; gambar/audio tetap seperti semula) dan `VideoMessageCard` menerima `remoteUrl={message.media_url}` untuk menurunkan thumbnail. Tes: `scripts/test/optimistic-merge.test.js`; `npm run test:unit` 30/30; `tsc` bersih. Pesan video yang sudah tersimpan dengan `media_url` lokal (sebelum perbaikan) tetap tanpa thumbnail sampai kedaluwarsa.
### Hapus untuk Saya: cache pesan lokal (17 Oktober 2026) — di `dev`, diuji buka ulang pada APK 1.38.0/64

- Ditemukan dua jalur penyebab pesan terhapus muncul sesaat ketika chat dibuka: `ChatScreen.handleDeleteMessage` hanya menyaring memori tanpa memanggil penghapus SQLite, dan rekonsiliasi riwayat hanya melakukan UPSERT sehingga baris yang hilang dari server tertinggal di disk.
- Setelah REST hapus berhasil, mobile memanggil `removeMessage` (untuk saya) atau `updateMessage` (placeholder untuk semua). Kegagalan REST tetap mengembalikan tampilan optimistik. `saveStoredMessages` menerima jendela riwayat otoritatif opsional: hapus baris yang tidak ada dalam jendela tersebut dan simpan hasil rekonsiliasi dalam satu transaksi; halaman lebih lama dipertahankan, riwayat kosong membersihkan pesan terkonfirmasi. Antrean debounce pembaruan ikut membuang pesan yang dihapus oleh rekonsiliasi. Pagination/pembaruan biasa tidak melakukan penghapusan ini.
- Regresi `sqlite-storage.test.js`: pembersihan baris di luar hidrasi 50 pesan, cold start setelah pembersihan, riwayat kosong, isolasi akun/room, pembaruan satu pesan, dan pemulihan tanda tangan baris. `npm run test:unit`: 30/30; `npx tsc --noEmit`: lulus. Frontend `npm run build` dan backend `go test -v ./...` lulus di luar sandbox (uji live yang membutuhkan kredensial tetap dilewati).
- HP RMX3506 terhubung dan chat Semantic dibuka. APK terpasang masih 1.37.0/63 (rilis, `run-as` ditolak Android), jadi database privat tidak dibaca dan perbaikan belum diverifikasi lewat APK di perangkat. Tidak menghapus pesan pengguna selama investigasi. Cache lama dibersihkan saat riwayat server berikutnya direkonsiliasi; baris di luar jendela server tidak dapat disimpulkan terhapus.

- **Verifikasi APK baru di HP (17 Okt 2026):** RMX3506 terpasang 1.38.0/64. Chat Semantic dibuka, lalu aplikasi dimatikan paksa dan dibuka lagi dua kali. Rekaman pembukaan 10 dan 8 detik diperiksa (termasuk sampel 12 fps di awal pembukaan pertama): pesan gambar tambahan yang sebelumnya muncul di bagian terbaru tidak terlihat muncul lalu hilang; tampilan pesan stabil setelah hidrasi. Tidak mengirim atau menghapus pesan pengguna; alur penghapusan pesan baru belum diuji langsung. Verifikasi ini bersifat pengamatan UI, bukan pembacaan database privat APK rilis.

- **Uji kirim-hapus nyata atas izin pengguna (17 Okt 2026, RMX3506, APK 1.38.0/64):** kirim gambar uji biru ke Semantic (20:48 WIB, centang terkirim), pilih **Hapus untuk Saya**: bubble hilang; setelah force-stop, mulai ulang aplikasi, dan buka chat sambil direkam 8 detik, gambar tidak muncul kembali. Kirim gambar uji ungu kedua (20:50 WIB, centang terkirim), pilih **Hapus untuk Semua Orang** saat dialog masih menunjukkan sisa waktu 50 detik: bubble berubah menjadi **Pesan ini telah dihapus**; setelah force-stop dan buka chat ulang sambil direkam 8 detik, placeholder bertahan dan gambar tidak terlihat muncul kembali. Kedua rekaman diperiksa lewat sampel 4 fps. Hanya dua pesan uji baru yang dihapus; pesan pengguna sebelumnya tidak disentuh. Pengamatan dilakukan di HP pengirim; tampilan perangkat Semantic belum diverifikasi. Tidak ada perubahan kode tambahan.

### Video galeri memakai cache yang sama dengan bubble (17 Oktober 2026)

- `ChatMediaGalleryModal` memakai `mediaCache.downloadToCache` untuk video yang belum tersimpan: progres persen di thumbnail, validasi unduhan lengkap memakai `file_size`, lalu putar lokal. Salinan lokal dan pekerjaan unduhan dibagi dengan bubble; tidak ada fallback streaming ketika unduh gagal.
- ACK video penerima dikirim hanya setelah berkas lokal tersedia. Galat membedakan kedaluwarsa dan kegagalan jaringan; ketuk ulang untuk mencoba lagi. Pengaman ketukan ganda dan permintaan usang mencegah pemutar muncul setelah galeri ditutup atau akun/room berubah. Transfer yang sudah berjalan boleh selesai ke cache setelah galeri ditutup.
- Pemeriksaan: mobile `npm run test:unit` 30/30 berkas lulus (termasuk tujuh skenario unduh video), `npx tsc --noEmit` lulus; frontend `npm run build` lulus di luar sandbox (percobaan sandbox gagal membaca keluaran TypeScript); backend `go test -v ./...` lulus. Belum dibuild atau diuji langsung di HP untuk perubahan galeri ini. Thumbnail persisten dan deduplikasi ACK lintas pembukaan tetap backlog terpisah.

### Penyatuan cache lampiran & penanganan kegagalan (17 Oktober 2026)

- Gambar chat memakai `CachedChatImage` di bubble dan galeri: otomatis unduh ke salinan persisten, baru decode lokal. Voice note/video diunduh saat diputar; dokumen saat diketuk lalu dibagikan sebagai berkas dengan `expo-sharing`. Tidak ada pemutar/penampil remote yang bersamaan mengunduh salinan kedua. Avatar, Feed dan thumbnail video tetap memakai jalur sebelumnya.
- `mediaCache` menjadi satu pengunduh file native: pekerjaan/progres bersama, 3 transfer + 48 antrean, timeout idle 45 dtk/total 10 menit, hard cap 100 MiB, pemeriksaan ruang kosong (cadangan 8 MiB), `.part` + HTTP/ukuran/Content-Length lalu pindah nama; salinan pengirim juga divalidasi. Berkas yang gagal tidak diregister; ketuk untuk mencoba lagi, tanpa loop retry otomatis. URL awal dibatasi ke penyimpanan yang didukung, tanpa bearer; URI lokal dari pesan tidak bisa membuka berkas privat lain. Sumber picker/recorder memerlukan pendaftaran dari handler kirim.
- Pembatalan: unmount melepas pelanggan; pelanggan terakhir membatalkan transfer/antrean. Keluar sesi membatalkan pekerjaan lama dan membersihkan indeks memori, mempertahankan media lengkap. Sisa `.part` dari proses mati dibersihkan pada transfer pertama. Cache memori/pencatatan ACK dibatasi.
- ACK terpusat (`mediaReceipt.ts`) hanya bila salinan lokal lengkap tersedia; deduplikasi pekerjaan/sukses per akun dalam sesi, retry setelah gagal, lewati status `downloaded`, pengirim dan grup/forum (ACK no-op). Voice note tidak lagi ACK saat mount. `audioManager` menjaga audio dari ketukan terakhir menang meski transfer sebelumnya selesai belakangan; tampilan lama tidak memutar setelah unmount.
- Keputusan ini menukar waktu tunggu pemutaran pertama dan ruang lokal dengan salinan offline yang tidak bergantung pada retensi server. Tidak menambah E2EE/enkripsi media atau hash konten tepercaya. Batas keamanan, sumber resmi dan kebijakan lengkap: `docs/SECURITY_AND_PERFORMANCE.md`, `docs/context/MOBILE.md`, `docs/MOBILE_INTEGRATION_GUIDE.md`.
- Verifikasi: `npm run test:unit` 33/33 berkas lulus, termasuk 17 skenario baru ketahanan/keamanan cache, tes ACK dan urutan pemutaran audio; `npx tsc --noEmit` lulus; `:app:compileDebugKotlin` dengan `expo-sharing` lulus; frontend `npm run build` dan backend `go test -v ./...` lulus. Build frontend/kompilasi native dilakukan di luar sandbox karena akses tool/cache dibatasi. Belum dibuild APK rilis atau diuji langsung di HP/iOS untuk perubahan ini; modul `expo-sharing` memerlukan APK baru.

- **Pemeriksaan APK pengguna di HP (17 Okt 2026, RMX3506, 1.38.0/65):** `lastUpdateTime` 22:05:07; `SharingFileProvider` terdaftar. Aplikasi membuka beranda tanpa crash/galat React Native yang teramati. Video 733 KB di Semantic diputar dari bubble dan galeri; dibuka ulang dari bubble ketika Wi-Fi/data dimatikan, `Active default network: none`, frame video tetap tampil. Empat gambar di galeri Tester WuzzChat tampil; satu dibuka fullscreen saat offline dengan status jaringan default `none`. Wi-Fi dan data seluler dipulihkan ke nilai awal `1`.
- **Batas uji HP:** beberapa gambar lama di Semantic menampilkan kegagalan unduh; pengguna menjelaskan kemungkinan berkas memang sudah hilang. Tidak disimpulkan sebagai regresi maupun dibuktikan respons 404. Belum menguji unduhan baru pada penerima tanpa cache, interupsi/retry transfer nyata, voice note baru, dan berbagi dokumen (tab Dokumen di dua galeri yang diperiksa kosong). Tidak mengirim/menghapus pesan, membagikan berkas, membersihkan cache, atau membaca database privat aplikasi. Tidak ada perubahan kode. Log native memuat PiP tidak didukung Activity, sementara pemutaran fullscreen tetap bekerja; konfigurasi PiP belum diubah. Bukti tangkapan layar disimpan sementara di `/tmp/wuzz-media-*.png`.

- **Uji media baru dari Semantic (17 Okt 2026, RMX3506, APK 1.38.0/65, sekitar 22:43–22:50 WIB):** tiga pesan baru terlihat belum dibuka di beranda (badge 3). Gambar 22:43 tampil otomatis ketika chat dibuka. Video 22:42 berukuran 2,7 MB masih berikon unduh. Voice note 22:43 baru diputar sesudah video, indikator 0:01/0:07 dan Android AudioTrack pada PID 11784 berstatus `started`; di galeri berkas audio tercatat 121,4 KB.
- **Kegagalan awal transfer & retry nyata:** data seluler dimatikan, video diketuk lalu Wi-Fi diputus 150 ms kemudian. Rekaman diperiksa 10 fps: progres yang tertangkap masih 0% (belum membuktikan pemutusan setelah sejumlah byte diterima); native mencatat `Software caused connection abort`, UI menampilkan "Gagal Mengunduh Video". Setelah koneksi kembali `VALIDATED`, tutup dialog dan ketuk ulang: video berhasil diunduh serta diputar. Pengujian berkas terpotong setelah progres nonzero masih mengandalkan unit test; tidak menghapus cache untuk memaksakan uji.
- **Persistensi dan offline:** aplikasi di-force-stop lalu dimulai ulang (PID baru 24740; startup dilakukan online). Setelah jaringan dimatikan, chat dibuka ulang: gambar tampil dan dapat dibuka fullscreen, video diputar, voice note diputar. Percobaan ulang voice note dan video galeri dilakukan setelah `Active default network: none` dipastikan sebelum ketukan. Video galeri benar-benar diputar; pemeriksaan lanjutan menemukan voice note replay hanya mengubah UI tanpa memulai AudioTrack lagi (lihat perbaikan di bawah). Galeri memuat gambar/video baru dan video yang sama berhasil diputar offline melalui galeri. Ini memverifikasi pembacaan salinan persisten setelah restart proses, bukan pengujian seluruh bootstrap aplikasi dalam keadaan offline.
- **Integrasi berbagi:** voice note muncul di tab Dokumen (1). Tombol berbagi membuka share sheet Android dengan berkas lokal `.m4a`; pemilih dibatalkan tanpa memilih aplikasi/penerima. Dokumen PDF/Office belum diuji. Catatan UI kecil pada APK 65: selama share sheet terbuka, label di belakangnya masih "Mengunduh 0%" walau berkas sudah tersedia; berbagi memakai berkas lokal dan tidak terblokir. Label diperbaiki di kode pada akhir sesi (lihat di bawah).
- Wi-Fi dan data seluler dipulihkan ke nilai awal `1`. Tidak mengirim/menghapus pesan atau menghapus cache/media pengguna. Rekaman pengujian dipindahkan ke `/tmp/wuzz-new-*.mp4` dan salinan rekaman/dump sementara yang dibuat untuk uji dibersihkan dari HP; screenshot bukti di `/tmp/wuzz-new-*.png`. Langkah perangkat di atas dilakukan pada APK 65; perbaikan kode setelah temuan uji dijelaskan di bawah. Tidak mengukur jumlah request R2/ACK secara langsung atau membaca database privat APK rilis.

- **Temuan replay voice note & perbaikan kode (17 Okt 2026):** voice note pertama benar-benar diputar (termasuk sekali sesudah restart proses). Pada ketukan replay setelah selesai, UI menjadi jeda/0:00 tetapi log Android PID 24740 hanya meminta audio focus tanpa memulai kembali AudioTrack 13063, yang telah berhenti. Penyebab: posisi native masih di akhir sementara UI direset ke 0; `player.play()` tidak memundurkan audio. `services/audioPlayback.ts` (`playOrReplayAudio`) kini menunggu `seekTo(0)` saat `didJustFinish` atau posisi native >= durasi, lalu memeriksa ulang intent/unmount sebelum `play()`. Pause/resume biasa mempertahankan posisi. Dipakai `AudioPlayerBubble`; uji regresi `audio-playback.test.js` mencakup replay, pause/resume, urutan seek/play, pembatalan dan kegagalan seek. Dasar: [contoh Replay resmi Expo Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/).
- **Perapian status berbagi:** `ChatMediaGalleryModal` menghapus status "Mengunduh" begitu berkas lokal tersedia, sebelum membuka pemilih berbagi, sehingga latar tidak lagi tertulis 0% saat share sheet sudah terbuka.
- **Validasi perbaikan:** mobile unit 34/34 berkas lulus, TypeScript lulus, frontend build lulus, backend `go test -v ./...` lulus. Kode tetap di `dev`, belum di-commit. APK 65 yang terpasang pada 22:05 belum memuat dua perbaikan akhir ini; build ulang dengan nomor versi sama terpasang 23:06 dan diverifikasi di bawah. Belum menguji seek/replay perbaikan ini di perangkat iOS.

- **Verifikasi build ulang pengguna (17 Okt 2026, 23:09–23:12 WIB):** RMX3506 tetap versi 1.38.0/65, tetapi `lastUpdateTime` berubah menjadi 23:06:55 (PID 28488). Voice note Semantic 7 detik berhasil diputar sampai selesai dan direplay berulang. Android mencatat AudioTrack 13087 dan 13095 `started` lalu `stopped`, berbeda dari kegagalan replay sebelumnya. Replay berikutnya (13103) dijeda pada UI 0:02/0:07 lalu dilanjutkan; track yang sama mencatat `started → paused → started → stopped`, tanpa rewind saat resume.
- **Replay offline terverifikasi:** Wi-Fi/data dimatikan dan `Active default network: none` dipastikan sebelum ketukan. Dua replay berikutnya menunjukkan progres 0:02/0:07 dan masing-masing AudioTrack 13111/13119 `started → stopped`. Tidak perlu unduhan baru untuk memutar ulang salinan lokal. Wi-Fi dan data dipulihkan ke nilai awal `1`.
- **Status berbagi terverifikasi:** tab Dokumen membuka share sheet Android untuk salinan lokal `.m4a`; nama/ukuran berkas tetap tampil di latar tanpa label "Mengunduh 0%". Pemilih dibatalkan tanpa membagikan berkas. Tidak ditemukan galat pada log warning/error aplikasi yang difilter selama uji. Tidak mengubah kode aplikasi/backend, mengirim/menghapus pesan, atau membersihkan cache pengguna; screenshot uji di `/tmp/wuzz-replay-*.png`, dua salinan screenshot sementara milik pengujian di HP sudah dihapus. Batas yang tersisa: iOS, PDF/Office, serta pemutusan transfer setelah progres nonzero belum diuji di perangkat; jumlah request R2/ACK belum diukur.
