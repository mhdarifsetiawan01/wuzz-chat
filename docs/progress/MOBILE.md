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

## 🎯 Fokus Berikutnya (What's Next)
- [ ] **M-Mobile-8.16: React Navigation Native Stack Integration & Fluid Screen Transition (Langkah 2)**:
  - Migrasi `AppNavigator` ke `@react-navigation/native-stack` (`createNativeStackNavigator`).
  - Animasi transisi slide native iOS/Android dan gesture swipe-back tanpa unmounting komponen.
- [ ] **M-Mobile-8.17: Room Messages SWR Cache & Timeline In-Memory State**:
  - Caching riwayat pesan per room di memory/context (`messagesByRoom: Record<string, Message[]>`).
  - Render instan 0ms saat user keluar-masuk ruang obrolan `ChatScreen` tanpa refetch blocking, disertai background sync via WebSocket.
- [ ] **M-Mobile-8.18: Offline-First Persistent Storage (SQLite / MMKV Cache)**:
  - Persistensi cache obrolan & riwayat pesan ke disk storage (`expo-sqlite` / MMKV).
  - Akses riwayat obrolan seketika saat aplikasi dibuka dari *Cold Start* tanpa koneksi internet.
- [ ] Refactor & polishing komponen UI mobile (`ChatScreen.tsx` & komponen lainnya) agar terus selaras dengan standar `mobile/DESIGN.md`.
- [ ] Pengujian build native iOS via Xcode / CocoaPods.


