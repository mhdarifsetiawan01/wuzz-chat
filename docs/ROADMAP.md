# Roadmap Arsitektur Wuzz Chat — Menuju Modern Chat Platform (WhatsApp / Telegram Grade)

Dokumen ini mendefinisikan peta jalan (*strategic roadmap*), target arsitektur, dan tahapan evolusi aplikasi **Wuzz Chat** dari *proof-of-concept WebSocket* menjadi aplikasi chatting modern berskala industri dengan kapabilitas sekelas WhatsApp / Telegram.

> 📌 **Single Source of Truth (SSOT)**: Untuk ringkasan status implementasi terkini, kapabilitas aktual, dan utang teknis yang diketahui, lihat:  
> 👉 **[`docs/PROJECT_STATE.md`](PROJECT_STATE.md)**  
> 
> 💡 **Prinsip Evolusi Roadmap (Continuous Alignment)**:  
> Seiring berjalannya proyek, Wuzz Chat menyinkronkan roadmap menjadi **2 Lintasan Terpadu (Dual-Track)**:  
> 1. **Track A — Product Capabilities & UX (Roadmap Fitur)**: Chat, rich media, group forum, AI memory, multi-device, mobile.  
> 2. **Track B — Modular Monolith & DDD Engine (Roadmap Fondasi)**: Transformasi backend Go menjadi 3-tier modular monolit yang bersih dan terisolasi (**100% Selesai & Deployed ✅**).

---

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        WUZZ CHAT EVOLVING MASTER ROADMAP v2.0                          │
│                      "From Chat App to Reusable Messaging Engine"                      │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│   TRACK A: PRODUCT FEATURES & CAPABILITY  │   TRACK B: MODULAR MONOLITH & DDD ENGINE   │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ [x] Fase 1: Real-Time Engine (WebSocket)  │ [x] Fase 1: SQLGroupStore Decoupling (✅)   │
│ [x] Fase 2: Cloud Persistence & Presence  │ [x] Fase 2: Application Service Auth (✅)  │
│ [x] Fase 3: User Identity & DM Contacts   │ [x] Fase 3: App Service Messaging (✅)     │
│ [x] Fase 4: Modern Chat UX & Dynamics     │ [x] Fase 4: Group & Forum Service (✅)     │
│ [x] Fase 5: Store-and-Forward Media & VN  │ [x] Fase 5: Memory ContextSource Abstr (✅)│
│ [x] Fase 6: Distributed Scale & Upstash   │ [x] Fase 6: Slim Entrypoint & wire.go (✅) │
│ [x] Fase 7: E2EE & WebRTC Audio Calling   ├────────────────────────────────────────────┤
│ [x] Fase 8: Core Parity (Groups, Push)    │ Dokumen Spesifikasi Engine:                │
│ [x] Fase 10: Group Memory AI (M1–M7)      │ 👉 docs/MODULAR_MONOLITH_DDD.md            │
│ [x] Fase 11: Multi-Device (Ph 0,1,2,3,5)  │                                            │
│ [ ] Fase 11: Passkey / WebAuthn (Ph 4)    │                                            │
│ [ ] Fase 9: Monetisasi & Avatar Asset     │                                            │
│ [ ] Mobile Native Client (Kotlin/Swift)   │                                            │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

> 📖 **Dokumen Rujukan Spesifikasi Teknis Terkait**:
> 1. 🔍 **Evolusi Identitas, Autentikasi & Multi-Device (Fase 11)**: [`docs/ARCHITECTURE_AUDIT.md`](ARCHITECTURE_AUDIT.md)
>    - **Phase 0 (Identity & Auth Hardening)**: **SELESAI ✅** (JWT Revocation, Re-Auth Safe Reset Kunci, Ganti Password)
>    - **Phase 1 (Session Foundation)**: **SELESAI ✅** (Tabel `sessions`, Session Inventory API, Remote Logout, Revoke Others)
>    - **Phase 2 (Device Registry)**: **SELESAI ✅** (Tabel `devices`, Multi-Device Metadata, Remote Device Revoke, Reconnect Resilience)
>    - **Phase 3 (Credential Separation)**: **SELESAI ✅** (Tabel `user_credentials`, Abstraksi Multi-Metode Login, Dual-Read/Write)
>    - **Phase 4 (Passkey / WebAuthn)**: *Siap Dieksekusi* (FIDO2 Biometric Login)
>    - **Phase 5 (Multi-Device E2EE Continuity)**: **SELESAI ✅** (Master Key Sync via Secure QR Transfer + Active Device Lifecycle)
> 2. 🏛️ **Transformasi Modular Monolith & DDD Engine (Track B)**: [`docs/MODULAR_MONOLITH_DDD.md`](MODULAR_MONOLITH_DDD.md)
>    - **Fase 1–6 & Post-Audit Hardening (M1–M3)**: **100% SELESAI ✅ & DEPLOYED** (Pemisahan GroupStore, AuthService, MessageService, ForumService, Memory ContextSource, Slim Bootstrap main.go, Zero-risk handler cleanup, dan Mobile Gateway readiness).
> 3. 🧠 **Group Memory AI Engine (Fase 10)**: [`docs/GROUP_MEMORY_AI_SPEC.md`](GROUP_MEMORY_AI_SPEC.md)
>    - **Milestone M1–M7**: **SELESAI ✅** (SKIP LOCKED Job Queue, AI Service, Review UI, Knowledge Viewer, E2E Notifications)
> 4. 📱 **Mobile Client Roadmap (Track Mobile Resmi)**:
>    - **Milestone M-Mobile-1: Auth Layer & Mobile Shell**: **SELESAI ✅** (Login/Register, SecureStore, Dark Mode WhatsApp Aurora)
>    - **Milestone M-Mobile-2: Chat Room & Realtime Messaging**: **SELESAI ✅** (Sticky Header, WebSocket Timeline, Single-Screen Flow, Delivery Receipts)
>    - **Milestone M-Mobile-3: Contact Search & Start New Conversation**: **SELESAI ✅** (Debounced Search, NewChatScreen, FAB, Direct Chat Creation)
>    - **Milestone M-Mobile-4: End-to-End Encryption (E2EE) Mobile Integration**: **SELESAI ✅** (NIST P-256 ECDH, HKDF-SHA256, AES-256-GCM, Auto-Decrypt Snippet Chat List, 100% Interop Web Crypto)
>    - **Milestone M-Mobile-5: Media Attachments & Image/File Sharing**: *Siap Dieksekusi* (Kamera, galeri foto, preview bubble, download)

---

## 📋 Rincian Tiap Fase & Deliverables

### Fase 1: Real-Time Engine Foundation (Status: SELESAI ✅)
- [x] Go WebSocket Hub dengan concurrency read/write pumps.
- [x] Next.js custom server proxy (`http-proxy`) untuk menyembunyikan origin backend.
- [x] Client connection abstraction dengan exponential backoff auto-reconnect.
- [x] UI Dark Mode responsive dan clean layout.

### Fase 2: Persistence & Presence (Status: SELESAI ✅)
- [x] Multi-driver storage abstraction (`PostgreSQL / Supabase`, `SQLite`, `Memory`).
- [x] Auto-migration skema database (`messages` table & indexing).
- [x] Room routing isolatif (`/chat?room=xxx`) dengan tautan instan.
- [x] Real-time presence engine (`room_users` event) dan drawer daftar member aktif.

---

### Fase 3: User Identity, Auth & Contacts (Status: SELESAI ✅)
*Tujuan: Mengubah sistem dari sesi room anonim sekali-pakai menjadi platform chatting berbasis akun dan daftar kontak tetap layaknya WhatsApp/Telegram.*
- **Backend**:
  - Tabel `users` (ID, username, email/phone, password_hash, avatar_url, bio, last_seen).
  - Tabel `conversations` (1-on-1 direct chat & group channels).
  - Tabel `conversation_members` (relasi user ke percakapan).
  - REST API & JWT middleware: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`.
  - WebSocket auth handshake: verifikasi JWT token sebelum koneksi di-upgrade.
- **Frontend**:
  - Halaman Login & Register dengan validasi modern.
  - Sidebar Kiri: Daftar obrolan aktif (*Recent Chats*), avatar kontak, pesan terakhir (*last message snippet*), timestamp, dan unread badge counter.
  - Modal: Buat obrolan baru (*New Direct Message*) atau Buat Grup baru (*New Group*).

---

### Fase 4: Modern Chat UX & Interactive Dynamics (Status: SELESAI ✅)
*Tujuan: Memberikan sensasi chatting yang hidup, responsif, dan kaya umpan balik visual sekelas WhatsApp & Telegram.*
- **Receipts & Status (3-Tahap)**:
  - Checklist pengiriman: `🕒 Pending` ➔ `✓ Sent (Centang 1 Abu-abu)` ➔ `✓✓ Delivered (Centang 2 Abu-abu saat lawan online)` ➔ `✓✓ Read (Centang 2 Biru saat dibuka)`.
  - Tampilan receipt realtime di balon chat dan di daftar obrolan Sidebar kiri.
- **Interactive UX & Feedback**:
  - Typing indicator live (*"Alice sedang mengetik..."*) dengan debouncing.
  - Audio sound effects (Web Audio API): Suara 'pop' saat kirim pesan dan 'ding' saat pesan masuk / reaksi masuk.
  - **Emoji Reactions & Quoted Reply**:
    - Hover action bar pada balon chat: quick emoji bar (`👍 ❤️ 😂 😮 😢 🙏`) dan tombol Balas (`↩️`).
    - Reaction pills badge di bawah balon chat dengan toggle counter real-time.
    - Quoted reply preview block yang bisa diklik untuk auto-scroll ke pesan target dengan efek animasi *glow pulse*.
- **Dual-Platform Architecture (Desktop 2-Kolom & Mobile WhatsApp Single-Screen)**:
  - **Desktop / Laptop (Split 2-Column)**: Sidebar daftar chat dan Chat Main Pane aktif berdampingan secara simultan.
  - **Mobile / Handphone (WhatsApp Single-Screen Flow)**: Transisi layar penuh antara Layar 1 (Daftar Chat Fullscreen + Search + Filter Pills + FAB + Bottom Nav) ⇄ Layar 2 (Ruang Obrolan Fullscreen + Tombol `← Back`).
  - **Viewport Standards**: Dynamic Viewport Height (`100dvh`), `position: sticky; top: 0;` pada status bar obrolan, dan safe area padding `env(safe-area-inset-bottom)`.
  - **Lifecycle & Anti-Stale State Sync**: Guard `lastHandledMsgIdRef` untuk mencegah re-processing pesan lama saat navigasi back, serta reset payload utuh `SET_MESSAGES` dari server saat membuka obrolan di mobile.
  - **Browser History Stack & Mobile Back Navigation Hardening**: Mengeliminasi duplikasi entry browser history dengan membuang manual `window.history.pushState` ganda, menerapkan `router.push` tunggal saat memasuki room, dan `router.replace('/chat')` saat kembali ke home/sidebar sehingga tombol Back perangkat mobile dan browser desktop keluar linimasa secara sekuensial dan presisi tanpa history loop.
- **Conversation & Message Deletion Management**:
  - **Hapus Percakapan untuk Saya (*Delete Conversation for Me*)**: Menyembunyikan riwayat obrolan dari daftar pengguna tanpa menghapus riwayat lawan bicara via timestamp `cleared_at`. Percakapan otomatis muncul kembali jika ada pesan baru setelah waktu clear.
  - **Hapus Pesan Spesifik (*Delete Message: For Me vs For Everyone*)**:
    - *Hapus untuk Saya*: Sembunyikan pesan tertentu kapan saja untuk diri sendiri (`deleted_for_users`).
    - *Hapus untuk Semua Orang*: Tarik pesan untuk seluruh peserta obrolan jika pesan dikirim sendiri dan berusia **≤ 1 menit (60 detik)**. Mengubah teks menjadi `🚫 Pesan ini telah dihapus` dan broadcast event real-time `message_deleted` via WebSocket.
  - Clean Timeline (Anti-spam join/leave/welcome message).
- **Flagship UI/UX Polish & Modern Dynamics**:
  - **Ultra-Modern Aurora Glassmorphism Header**: Ambient radial mesh lighting Soft Azure & Soft Lavender di balik frosted glass transparan, avatar profil pengguna terintegrasi langsung di baris brand header atas untuk efisiensi vertikal seluler.
  - **Modular Emoji Picker & Flagship Precision Chat Input Bar**: Katalog emoji modular di `frontend/lib/emojis.ts` (5 kategori Unicode native), Frosted Glass Emoji Picker Tray popover, kapsul pil input presisi (`border-radius: 24px`, tinggi 48px), dan tombol aksi floating circular terpisah standar WhatsApp & Telegram.
  - **High-Contrast SVG Read Receipt & Electric Neon Cyan Glow Engine**: Komponen vektor SVG (`ReceiptIcon.tsx`) standar WhatsApp/Telegram (`stroke-width: 2`, sudut paralel 45°), warna Electric Neon Cyan (`#00f2fe`) dengan dual-filter dark drop shadow (`rgba(0, 0, 0, 0.95)`) + pendaran neon untuk kontras tajam di atas bubble pesan biru.


---

### Fase 5: Rich Media, Voice Notes, Attachments & Store-and-Forward Lifecycle (Status: SELESAI ✅)
*Tujuan: Mendukung pengiriman multimedia kaya dengan efisiensi storage $0 via WhatsApp Store-and-Forward model.*
- **Cloud & Local Media Storage Integration**:
  - Pluggable storage architecture (`LocalStorage`, `SupabaseStorage`, `S3Storage`).
  - Endpoint `POST /api/media/upload` dengan validasi MIME magic bytes, UUID anti-traversal, dan dynamic feature flag `ENABLE_MEDIA_UPLOAD`.
- **WhatsApp-Style Store-and-Forward & IndexedDB Caching**:
  - Auto-delete file dari storage begitu client selesai download (`POST /api/media/ack`).
  - Background auto-purge worker (`PurgeWorker`) dengan batas retensi `MEDIA_RETENTION_DAYS=7`.
  - Client-side offline cache berbasis browser `IndexedDB` (`mediaCache.ts`) untuk akses instan tanpa kuota.
  - Kompresi gambar client-side otomatis (`imageCompressor.ts`, resize max 1600px, WebP quality 0.82) dengan toggle on/off di modal profil.
- **Voice Note Recording**:
  - MediaRecorder API: Perekaman suara langsung dari peramban, timer live, waveform animasi, dan pemutar audio kustom (`AudioPlayerBubble`).
- **Document & File Sharing**:
  - Berkas PDF, DOC, Sheet, Slide, ZIP, Text dengan badge visual berwarna dan tombol direct download.
- **Image Lightbox Modal**:
  - Fullscreen zoomable modal view (Zoom In/Out, Reset, Download, Keyboard Escape navigation).

---

### Fase 6: Distributed Scale & Reliability (Status: SELESAI ✅)
*Tujuan: Memastikan sistem dapat menampung ribuan/jutaan user bersamaan dengan multi-server cluster, dynamic CORS whitelist, dan rich link preview.*
- **Redis Pub/Sub Layer & Multi-Instance Sync**:
  - Menghubungkan banyak instance Go Backend via Upstash Redis (`rediss://...`) dan standard TCP (`redis://...`) dengan `github.com/redis/go-redis/v9`.
  - Anti-echo loop protection via Node UUID dan deduplikasi penyimpanan database.
  - In-Memory fallback mode saat Redis URL tidak diisi.
- **Dynamic Multi-Origin CORS & WebSocket Whitelist**:
  - `CORSValidator` membaca `CORS_ALLOWED_ORIGINS` untuk exact match, wildcard `*`, dan wildcard subdomains (`https://*.vercel.app`).
  - Proteksi WSS handshake via `websocket.Upgrader.CheckOrigin`.
- **OpenGraph Rich Link Previewer (WhatsApp / Telegram Grade)**:
  - Backend safe scraper dengan Anti-SSRF guard (blokir 127.0.0.1, private IP subnets, link-local, localhost).
  - Ekstraksi meta tag OpenGraph dengan Redis/In-Memory cache TTL 24 jam.
  - Kartu preview link thumbnail interaktif di frontend (`LinkPreviewCard.tsx`).
- **Production Deployment Readiness**:
  - Multi-stage build `Dockerfile` Go super ringan (< 25MB).
  - Next.js server-side `rewrites()` di `next.config.ts` untuk reverse proxy API Vercel ke Fly.io.
  - Template konfigurasi `fly.toml.example`.

---

### Fase 7: Advanced Security & WebRTC Calling (Status: SELESAI ✅)
*Tujuan: Keamanan tingkat tinggi dan fitur panggilan suara/video interaktif ultra low-latency.*
- ✅ **End-to-End Encryption (E2EE) (SELESAI)**:
  - Implementasi kriptografi kunci publik standar terbuka (**ECDH NIST P-256 + HKDF-SHA256 + AES-256-GCM**) via Web Crypto API.
  - Private key tersimpan aman di `IndexedDB` browser pengguna (`wuzz_crypto_db`).
  - Backend & Database Supabase hanya menerima dan menyimpan ciphertext (`e2ee:v1:iv:ciphertext`).
  - Dekripsi otomatis di timeline obrolan penerima dengan fallback kompatibel untuk pesan lama.
  - Verifikasi keamanan visual 30-digit (*Safety Number Fingerprint*) di UI.
  - **Single Active Device & Key Conflict Guard (Opsi A)**: Pelacakan `active_device_id` & `key_version` di DB, penolakan penimpaan kunci otomatis (HTTP 409 Conflict), endpoint resmi `POST /api/users/public-key/reset`, dan modal konflik UI (`DeviceConflictModal.tsx`) untuk memastikan Safety Number 100% konsisten antar perangkat.
  - **QR Code E2EE Key Migration (Opsi 2 / Milestone 7.6)**: Pemindahan keypair E2EE antar perangkat secara Zero-Knowledge menggunakan QR code berdurasi 5 menit (`POST /api/users/transfer/create` dan `POST /api/users/transfer/consume`), enkripsi AES-256-GCM + PBKDF2 (100k iterasi), konsumsi atomik 1x pakai di database relasional, komponen `DeviceTransferModal.tsx` dengan fallback kode manual, dan deep link `/transfer?token=...`.
  - 100% interoperabel dan siap untuk klien mobile masa depan (Kotlin Android, Flutter, React Native, Swift iOS).
- ✅ **Milestone 7.2A: 1-on-1 Voice / Audio Calling (WebRTC P2P) (SELESAI)**:
  - Signaling full duplex via WebSocket Go Backend (`call_offer`, `call_answer`, `ice_candidate`, `call_reject`, `call_end`, `call_busy`).
  - Web Audio API procedural sound synthesizer untuk nada sambung keluar (*tuuut...*) dan nada dering masuk melodis.
  - Dialog pop-up panggilan masuk interaktif (`IncomingCallModal.tsx`) dengan animasi avatar denyut dan tombol Terima/Tolak.
  - Layar overlay panggilan suara aktif (`AudioCallOverlay.tsx`) dengan avatar wave, timer durasi live, toggle mute microphone, dan tombol akhiri panggilan.
  - Koneksi P2P direct audio stream latensi rendah via Google Public STUN (`stun:stun.l.google.com:19302`) tanpa beban bandwidth server.
- ⏸️ *(Milestone 7.2B Video Calling di-hold sementara untuk memprioritaskan fitur inti komunikasi).*

---

### Fase 8: Core Parity — Push Notifications, Group Chat & Message Management (Status: SELESAI ✅)
*Tujuan: Menghadirkan kesetaraan fitur komunikasi inti (*Core Parity*) dengan WhatsApp & Telegram.*
- ✅ **Milestone 8.1: Universal Push Notification Engine (SELESAI)**:
  - Standard W3C Web Push (VAPID RFC 8292) dengan integrasi `SherClockHolmes/webpush-go`.
  - Skema tabel multi-platform `push_subscriptions` (`web`, `android`, `ios`).
  - Auto keypair generation VAPID di backend Go.
  - REST Endpoints: `GET /api/notifications/vapid-public-key`, `POST /api/notifications/subscribe`, `POST /api/notifications/unsubscribe`.
  - Asynchronous push dispatcher pada WebSocket Hub saat user penerima sedang offline/idle.
  - Service Worker (`public/sw.js`) dengan event `push`, `notificationclick` (deep-linking), dan **Zero-Knowledge Client-Side Background Decryption** (Web Crypto API + IndexedDB) sehingga teks pesan E2EE terdekripsi langsung di notifikasi OS layaknya WhatsApp Web.
  - UI Toggle Notifikasi di `ProfileModal.tsx` dan Tombol Header **"📲 Instal App"** di `Sidebar.tsx` dengan auto-hide di mode Standalone PWA.
- ✅ **Milestone 8.4: IndexedDB Message Cache & E2EE Continuity (SELESAI)**:
  - **IndexedDB Persistent Decrypted Store** (`frontend/lib/messageCache.ts`): Database lokal `wuzzchat_msg_db` dengan object store `messages` (keyPath: `id`) dan index `by_room` untuk lookup O(log n) per percakapan.
  - **Cache-First Load**: Saat room dibuka, pesan langsung tampil instan (0ms) dari IndexedDB sebelum respons server tiba, lalu server history diupsert untuk menyinkronkan pesan baru.
  - **Write-Through Cache** pada 6 titik mutasi: incoming message, outgoing send (optimistic), update tanda terima, pesan ditarik, hapus untuk saya, dan hapus percakapan (`clearRoomCache`).
  - **E2EE Continuity**: Riwayat chat tetap terbaca meskipun lawan bicara me-reset device dan mengunggah kunci kriptografi baru karena plaintext tersimpan persisten di IndexedDB masing-masing user.
  - **Security Key Change Notification**: Deteksi perubahan public key lawan bicara via `localStorage` + `lastKnownPeerKeyRef`, inject pesan sistem amber ke timeline chat (mirip WhatsApp *"Security code changed"*).
  - **Anti-Regression Status Guard**: Status tanda terima di cache tidak dapat didowngrade (bobot integer: pending=0, sent=1, delivered=2, read=3, deleted=99).
- ✅ **Milestone 8.5: Interactive Profile Studio, Verified Badge & Unified Real-Time Avatar Engine (SELESAI)**:
  - **Tabbed Modern Profile Modal**: 3 tab terorganisir (Profil, Media & Cache, Keamanan Akun & Kunci).
  - **Avatar Studio (`AvatarStudio.tsx`)**: Pemilihan foto asli (kompresi WebP client-side otomatis), preset 3D emoji populer, dan generator avatar inisial warna gradien.
  - **Verified Badge System (`VerifiedBadge.tsx`)**: Indikator centang biru akun terverifikasi di header profil, daftar obrolan sidebar, pencarian kontak, dan modal profil kontak.
  - **Universal `UserAvatar.tsx`**: Komponen terpadu render avatar foto asli (`<img>`), emoji 3D, atau inisial deterministik dengan indikator dot online hijau.
  - **Backend SQL & Real-Time Sync**: Pengambilan `peer.avatar_url` pada query `GetUserConversations` backend Go dan transmisi real-time ke header chat (`StatusBar.tsx`).
- ✅ **Milestone 8.6: Security Hardening Registration & Anti-Impersonation Filter (SELESAI)**:
  - Modul validator terpusat (`backend/internal/auth/validator.go`) — ekstraksi logika validasi dari handler.
  - Filter kata terlarang **hybrid 3 lapis**: substring check (kata kotor/eksplisit), brand/sensitive prefix-suffix check, technical exact match.
  - Batasan karakter regex `^[a-zA-Z0-9_.-]+$`, `username` 3-30 karakter, `password` 6-128 karakter, `display_name` maks 50 karakter.
  - **Anti-DoS Body Cap**: `http.MaxBytesReader` 64 KB pada endpoint `/api/auth/register`.
  - **Fail-Closed BOLA Guard**: `isAuthorizedForRoom` menolak akses saat error DB (fail-closed, bukan fail-open).
  - **JWT Runtime Warning**: `sync.Once` guard jika `JWT_SECRET` tidak di-set di environment.
  - Unit tests (`validator_test.go` 33 cases) & integration tests (`auth_register_test.go` 11 cases) — 100% pass.
  - Frontend client-side validation real-time di `register/page.tsx`.
- ✅ **Milestone 8.7: UUID-First Identity Architecture & Ownership Refactoring (SELESAI)**:
  - Standardisasi mutlak kolom `users.id` (UUID) sebagai pembanding/patokan utama tunggal di seluruh alur sistem karena `display_name` dan `username` dapat berubah.
  - **MessageStore Refactor**: `DeleteMessage` memverifikasi kepemilikan pesan murni dengan `msg.FromID == userID` (UUID), menghapus parameter `userNickname` / `DisplayName`.
  - **Emoji Reactions Persistence**: Reaksi pesan disimpan menggunakan array `userID` (UUID), menjaga riwayat reaksi tetap valid saat pengguna mengedit profil.
  - **Receipts Filter Standardization**: `MarkRoomMessagesAsRead` dan `MarkUserMessagesAsDelivered` menggunakan filter UUID (`from_id != ?`), menghapus fallback string nickname.
  - **WebSocket Security Guard**: Siaran tanda terima `delivered` diproteksi guard `c.isAuthorizedForRoom(rID)` untuk mencegah kebocoran status ke room yang tidak sah.
  - **Frontend Timeline Peer Discovery**: Penentuan pesan lawan bicara di `page.tsx` murni membandingkan `senderId !== myUserId` (UUID).
- ✅ **Bugfix — Normalisasi Kontrak Payload Delete for Everyone (SELESAI)**:
  - **Root Cause**: Frontend mengirim `{ type: "for_everyone" }` sementara backend Go struct mengharapkan field `delete_for_everyone: bool`. Mismatch JSON key menyebabkan `DeleteForEveryone` selalu `false`, sehingga backend tidak pernah broadcast event `message_deleted` ke lawan bicara.
  - **Solusi Dual-Format**: Backend kini menerima payload secara fleksibel (`delete_for_everyone`, `type`, `delete_type`, URL query `?for_everyone=true`). Frontend kini mengirim dua field sekaligus (`delete_for_everyone: true` + `type: "for_everyone"`) untuk maksimal kompatibilitas.
  - **Test Coverage**: 4 skenario automated test (`chat_handler_delete_test.go`) — 100% lulus.
- ✅ **Milestone 8.2A: Core Group Chat Engine & Member Management (SELESAI)**:
  - **Identitas & Skema Grup**: Identitas unik format `grp_<UUIDv4>` pada tabel `conversations` dengan dukungan visibilitas **🔒 Privat (Wuzz Cloud)** vs **🌐 Publik** (dengan handle unik `@group_username` dan pencarian global).
  - **Fondasi Sub-Grup & TTL**: Penambahan kolom `parent_id VARCHAR(128)` dan `expires_at TIMESTAMP` pada `conversations` (NULL untuk grup utama permanen, fondasi siap pakai untuk Milestone 8.2B).
  - **Wizard Pembuatan Grup (`CreateGroupModal.tsx`) & Modal Pratinjau Publik (`GroupPreviewModal.tsx`)**: Modal 2 langkah pembuatan grup dan modal pratinjau konfirmasi gabung grup publik bertema Aurora Glassmorphic (DEC-012) untuk mengeliminasi *accidental auto-join*.
  - **Private Group Direct Link Gate & Authorization Shield (DEC-013)**: Mengamankan tautan grup privat (`/chat?room=grp_xxx`) yang diakses langsung oleh non-anggota. Memblokir rendering room kosong, membatalkan timer timeout riwayat pesan, mencegah penembakan event WebSocket join ke backend, dan menampilkan layar proteksi otorisasi bertema Aurora Glassmorphic dengan tombol navigasi kembali ke beranda obrolan.
  - **Manajemen & Drawer Info Grup (`GroupInfoDrawer.tsx`)**: Drawer profil grup, daftar anggota dengan role/verified badge, RBAC hierarkis (`creator`, `admin`, `member`), promosi/demosi admin, kick anggota, edit profil grup, dan leave group dengan konfirmasi aman.
  - **Header & Linimasa Dinamis**: `StatusBar.tsx` terintegrasi info grup, lencana publik/privat, hitungan anggota, tombol info grup; `MessageBubble.tsx` menampilkan nama pengirim dengan aksen warna unik deterministik per user.
  - **Bypass E2EE Fail-Closed**: Pesan grup beroperasi via secure server-relayed TLS transit dengan skema database siap-upgrade ke Signal Sender Keys di masa mendatang tanpa breaking changes.
  - **Arsitektur Media & Tanda Terima Grup**: Retensi media grup berbasis TTL 7 hari di server (tanpa penghapusan pada ACK pertama agar seluruh anggota dapat mengunduh), client deduplication di `wuzzchat_media_db`, dan status tanda terima pengiriman room (`sent`/`delivered`).
  - **REST API Suite Lengkap (9 Endpoint)**: `POST /api/groups`, `GET /api/groups/search`, `GET /api/groups/{id}`, `POST /api/groups/{id}/join`, `GET /api/groups/{id}/members`, `POST /api/groups/{id}/members`, `DELETE /api/groups/{id}/members/{userId}`, `PATCH /api/groups/{id}/members/{userId}/role`, `PATCH /api/groups/{id}`.
- ✅ **Milestone 8.2B: Ephemeral Sub-Groups, TTL Lifecycle & Access Control (SELESAI)**:
  - **Arsitektur Sub-Grup Bertopik**: Mini grup diskusi topik di dalam grup induk (`parent_id`) dengan identitas unik `sub_<UUIDv4>` dan skema auto-migration (`status VARCHAR(32) DEFAULT 'active'`, `ai_summary TEXT`, composite index `idx_subgroups_active(parent_id, expires_at)`).
  - **Parent-Membership Gate & RBAC Enforcement (Strict Fail-Closed)**: Non-anggota grup utama secara mutlak dilarang mengakses, melihat list, bergabung, maupun menerima invite ke subgrup (HTTP 403 / WS error). Pembuatan topik forum dibatasi ketat hanya untuk Admin dan Pembuat grup induk (`creator`/`admin`), dengan tombol pembuatan di-hidden otomatis bagi anggota biasa.
  - **Pilihan Masa Aktif (TTL)**: Default 1 minggu (`"7_days"`), dengan opsi terbatas 1 minggu dan 1 bulan (`"30_days"`).
  - **SubGroupTTLWorker (Background Go Daemon)**: Ticker 15 menit berkala non-blocking mengeksekusi `ExpireSubGroupsBatch` untuk mentransisikan subgrup kedaluwarsa ke status `'expired'` secara atomik.
  - **Sub-Group Access Control (Public vs Private)**:
    - 🌐 **Terbuka (Publik)**: Anggota grup induk dapat langsung bergabung sendiri (`Gabung & Buka`).
    - 🔒 **Privat**: Anggota grup induk harus mengajukan permohonan bergabung (`Minta Izin Gabung`) atau diundang oleh admin.
    - **Discovery Transparan**: Semua subgrup aktif tetap terlihat oleh seluruh anggota grup induk terlepas dari tipe akses.
    - **Tabel & Antrean Izin (`conversation_join_requests`)**: Menyimpan riwayat dan antrean permohonan bergabung (`id`, `conversation_id`, `user_id`, `status: pending/approved/rejected`, `reviewed_by`).
    - **Auto-Purge Kedaluwarsa**: Ketika subgrup mencapai masa expired, data di `conversation_join_requests` otomatis dihapus tuntas oleh `ExpireSubGroupsBatch`.
  - **Fail-Closed Write Gate**: Subgrup kedaluwarsa otomatis terkunci *read-only* (WebSocket menolak kirim pesan dengan `sendError` dan tombol input textarea di-disable).
  - **Kesiapan AI Summary Masa Depan**: Riwayat percakapan tidak di-hard delete saat kedaluwarsa melainkan disimpan untuk diringkas oleh AI summary worker di fase mendatang.
  - **Enforcement Identitas Immutable (DEC-008)**: Seluruh perbandingan, otorisasi, dan filter relasi hanya menggunakan variabel immutable (`user.id` / UUID, `conversation.id`, `parent_id`), tanpa variabel mutable.
  - **Komponen Frontend**: `SubGroupListDrawer.tsx` (daftar topik aktif dengan badge sisa waktu real-time, lencana 🌐 Terbuka vs 🔒 Privat, tombol Minta Izin, tombol Buat Topik yang di-hidden bagi anggota biasa, dan Panel Review Izin bagi Admin), `CreateSubGroupModal.tsx` (modal pembuatan subgrup bertema Aurora Glassmorphic dengan toggle hak akses), tombol `💬 Subgrup` di `StatusBar.tsx` dan `GroupInfoDrawer.tsx`, serta navigasi balik `← [Nama Grup Induk]`.
  - **REST API Suite Subgrup (5 Endpoint)**:
    - `GET /api/groups/{id}/subgroups`
    - `POST /api/groups/{id}/subgroups` (dengan opsi `is_public`)
    - `POST /api/groups/{id}/join-request` (mengajukan izin bergabung)
    - `GET /api/groups/{id}/join-requests` (daftar permohonan pending)
    - `POST /api/groups/{id}/join-requests/{requestId}/action` (approve/reject izin)
- ✅ **Milestone 8.2C: Forum Rebranding & Mobile Header Redesign (SELESAI)**:
  - **Rebranding Resmi Menjadi "Forum"**: Meningkatkan istilah subgrup menjadi *Forum & Topik Diskusi* mengadopsi standar industri Telegram Forums & Topics.
  - **Redesain Total Header Obrolan**: Integrasi breadcrumb interaktif di baris subtitle obrolan (`↖ [Grup Induk] • Forum • X anggota`), menghilangkan tombol melayang canggung di atas judul, dan memperlebar ruang horizontal judul obrolan 3x lipat.
  - **Collapsible Action Menu (Tombol Titik Tiga `⋮`)**: Icon-icon sekunder (`Info`, `Link`, `Sound`) terlipat rapi di mobile dengan animasi halus dan auto-close, sementara tombol akses cepat `🏛️ Forum` tetap berada di luar untuk akses 1-tap instan.
- ✅ **Milestone 8.2D: Shared Media Hub for Group Chats & Forum Topics (SELESAI)**:
  - **Pencegahan Media Kedaluwarsa Dini**: Mengatasi masalah berkas gambar di obrolan grup (`grp_...`) dan forum topics (`sub_...`) yang langsung kedaluwarsa (*"Media telah kedaluwarsa"*) ketika salah satu anggota pertama selesai mengunduh.
  - **Inspeksi Percakapan di MessageStore (`sql.go` & `memory.go`)**: Fungsi `AcknowledgeMediaDownload` mendeteksi tipe obrolan grup dan forum topic. Untuk grup/forum, konfirmasi unduhan tidak menghapus berkas fisik di Supabase Storage dan tidak mengubah status pesan menjadi `'expired'`.
  - **Dual-Retention Semantics**: Direct message (1-on-1) tetap menggunakan Store-and-Forward instan ($0 server storage cost), sedangkan grup & forum topic menggunakan model Shared Media Hub dengan retensi penuh hingga batas TTL (7 hari) yang dibersihkan oleh `PurgeWorker`.
  - **Automated Test Suite**: Dilindungi unit test skenario komprehensif `TestMediaHandler_AcknowledgeDownload_SharedMediaHub_GroupAndSubGroup` (100% PASS). Deployed ke Fly.io & merged ke `main`.
- ✅ **Milestone 8.5: Group & Subgroup Multi-User Mention Engine (@username) (SELESAI)**:
  - **Isolasi Keanggotaan Ketat**: Autocomplete dan mention di grup utama (`grp_<UUID>`) hanya mengizinkan anggota grup tersebut. Di subgrup/forum (`sub_<UUID>`), hanya anggota yang telah bergabung ke subgrup tersebut yang dapat di-mention.
  - **Multi-Mention & Format Immutable (DEC-013)**: Mendukung multi-mention dalam 1 pesan. Seluruh validasi, routing, dan persistensi menggunakan array UUID murni (`mentions: ["user-uuid-1", "user-uuid-2"]`) tanpa mengandalkan username/display_name atau nama grup.
  - **Komponen Autocomplete Aurora Glassmorphism (`MessageInput.tsx`)**: Popover mengambang dengan deteksi `@` realtime, filter dinamis, preview avatar, role/verified badge, navigasi keyboard lengkap (ArrowUp/Down/Enter/Tab/Esc) dan tap-friendly mobile (min 44px).
  - **Highlight Interaktif Linimasa (`MessageBubble.tsx`)**: Tag `@username` ter-render dengan styling `.mention-tag`, dilengkapi highlight aksen khusus self-mention (`.mention-tag-self` dan border cyan `message-bubble-mentioned`).
  - **Validasi Fail-Closed WebSocket Hub (`hub.go`)**: Server Go WebSocket memverifikasi keanggotaan setiap ID mention via `IsUserInConversation(roomID, mUID)` sebelum broadcast lokal, broker Redis, dan persistensi ke database.
  - **Prioritized Web Push Notifications (`push.go`)**: Pengguna yang di-mention menerima push notification khusus saat offline dengan tag `chat-mention-[roomID]` dan judul `🔔 [Pengirim] menyebut Anda`.
  - **Test Suite**: Dilindungi unit test backend `TestNotifyOfflineRecipients_WithMentions` dan verifikasi frontend type-check (100% PASS).
- ✅ **Milestone 8.8: Realtime Engine Scalability & High-ROI Optimizations (SELESAI)**:
  - **Core Fanout Optimization $O(M)$ (`hub.go`)**: In-memory membership cache `roomMembersCache` di WebSocket Hub. Menggantikan scan linier $O(N)$ ke seluruh `h.clients` dan eliminasi query database `GetConversationMemberUsernames` berulang pada setiap pesan masuk.
  - **Backend Typing Rate Limiter (`client.go`)**: Sliding-window rate limiter per koneksi (maks 3 event typing per 2 detik) untuk mencegah banjir frame DoS.
  - **Delta Offline History Sync with Checkpoint Timestamp (`GetRoomHistorySince`)**: Parameter `since` pada event `join` mengambil pesan dari checkpoint terakhir di IndexedDB klien tanpa mengunduh ulang 50 pesan dari nol, memotong transmisi data hingga 90%.
  - **Client-Side Outbound Queue & Auto-Retry (`ws-client.ts`)**: FIFO queue (maks 100 pesan) yang menampung pesan ketika socket terputus dan melakukan auto-flush seketika saat socket tersambung kembali.
  - **Test Suite**: Dilindungi unit test `scalability_optimizations_test.go` (`TestHub_DirectMemberLookupO_M`, `TestClient_TypingRateLimit`, `TestHub_DeltaHistorySince`) — 100% PASS.
- ✅ **Milestone 8.9: Mobile-Ready Reliability (Request ID + ACK Protocol & Server-Side In-Memory Idempotency) (SELESAI)**:
  - **Request ID & Transport-Level ACK**: Parameter korelasi `request_id` dan paket balasan deterministik `type: "ack"` untuk kepastian pengiriman pesan tanpa *phantom message*.
  - **Server-Side In-Memory Idempotency (2-Minute Cache)**: Pencegahan broadcast duplikat dan publish Redis ganda saat klien mobile me-resend pesan dari antrean keluar (`IsDuplicateAndRecord` berpresisi `UnixNano()`).
  - **Deterministic Client Queue Retransmission**: `WsClient` mempertahankan pesan di `outboundQueue` hingga menerima balasan `ack` atau `receipt`, dan mem-flush secara otomatis saat koneksi pulih (`onopen`).
  - **Test Suite**: Dilindungi unit test komprehensif `ack_idempotency_test.go` (`TestClient_MessageAckDispatch`, `TestHub_ServerSideIdempotency`, `TestHub_IdempotencyTTL`) — 100% PASS.
- ✅ **Milestone 8.3: Message Management Suite (SELESAI)**:
  - **Sub-8.3.A: Edit Pesan (15 Menit)**: Dukungan edit pesan dalam window 15 menit khusus pengirim asli (`from_id`), penolakan pesan ditarik/kedaluwarsa, penanda `is_edited: true` dan timestamp `edited_at`, broadcast real-time event `message_edited`, serta inline editor di frontend (`MessageInput.tsx`) dan badge visual `(diedit)` di `MessageBubble.tsx`.
  - **Sub-8.3.B: Forward Pesan (Multi-Kontak 1–5 Target)**: Penerusan pesan ke 1 s/d 5 percakapan tujuan sekaligus via `POST /api/messages/forward`, validasi Anti-BOLA per target room, penandaan kekal `is_forwarded: true`, broadcast real-time ke setiap room tujuan, modal seleksi interaktif `ForwardMessageModal.tsx`, dan lencana visual `↪ Diteruskan` di bubble pesan.
  - **Sub-8.3.C: Pin Chat (Sidebar Per-User)**: Fitur semat obrolan teratas sidebar secara terisolasi per pengguna (`conversation_members.is_pinned` & `pinned_at`), REST API `POST /api/conversations/pin` dan `/unpin`, menu konteks desktop / swipe/action mobile, lencana pin di `Sidebar.tsx`, dan sorting prioritas (pinned chats selalu berada di posisi paling atas).
  - **Sub-8.3.D: Pin Message (Dalam Chat / Room Pinned Messages)**: Semat hingga 3 pesan penting dalam obrolan (`pinned_messages` table), FIFO unpin otomatis saat pin ke-4 disematkan, penolakan pesan terhapus, otomatis unpin saat pesan ditarik for everyone, REST API `POST /api/messages/pin`, `POST /api/messages/unpin`, `GET /api/messages/pinned`, WebSocket event `message_pinned` & `message_unpinned`, banner interaktif multi-pin `PinnedMessageBanner.tsx`, dan aksi klik jump-to-message dengan animasi cahaya emas `.msg-highlight-glow`.
  - **Sub-8.3.E: In-Chat Text Search**: Mesin pencarian pesan instan dalam percakapan aktif via `GET /api/messages/search?conversation_id=...&q=...`, case-insensitive substring match, privasi ketat menghormati `cleared_at` pengguna, eksklusi pesan ditarik (`is_deleted`), bar pencarian terintegrasi di `StatusBar.tsx` dengan penghitung hasil pencarian (X/Y), navigasi tombol Atas/Bawah, dan scroll-into-view otomatis dengan highlight biru `.msg-search-highlight`.
  - **Test Suite**: Dilindungi unit test Go komprehensif (`chat_handler_edit_test.go`, `chat_handler_forward_test.go`, `chat_handler_pin_test.go`, `chat_handler_message_pin_search_test.go`) — 100% PASS.
- ✅ **Milestone 8.10: Backend Logout Endpoint & Consolidated Encrypted Messages Banner (SELESAI)**:
  - **Pelepasan Sesi Perangkat Aktif & Proteksi Device-Aware (`POST /api/auth/logout`)**: Endpoint logout resmi di backend Go yang mengosongkan kolom `users.active_device_id = ''` di database secara kondisional (*device-aware*), mencegah false conflict (HTTP 409) ketika pengguna berpindah ke perangkat baru setelah logout sah. Dilengkapi proteksi pembatalan konflik (*local-only cancellation*): jika perangkat baru/penantang menekan *"Batalkan & Keluar"* di modal konflik, frontend hanya melakukan `localLogout()` tanpa memanggil server sehingga sesi perangkat aktif utama tidak terhapus.
  - **Single Consolidated Banner for Encrypted Messages UX**: Menggantikan tumpukan puluhan bubble `🔒 [Pesan Terenkripsi]` dengan **1 buah banner sistem ringkas** di linimasa chat (`ChatWindow.tsx`) dan optimasi single-pass memoized loop $O(N)$ via `useMemo`.
- ✅ **Post-Milestone 8: Multi-Node WebSocket Cluster Session Kick (`SESSION_REPLACED` & `DEVICE_KICKED` via Redis Pub/Sub) (SELESAI)**:
  - *Tujuan*: Sinkronisasi pergantian sesi perangkat aktif dan remote logout lintas-mesin container Fly.io (multi-node cluster).
  - *Mekanisme*: Saat pengguna login di Instance A dengan `device_id` baru atau mengeluarkan perangkat dari jarak jauh, event `session_kick` atau `device_kick` di-broadcast ke Redis channel `wuzz:cluster:events`. Instance B yang menampung koneksi soket lama langsung menendang koneksi tersebut dengan Close Code 4001 (`SESSION_REPLACED` / `DEVICE_KICKED`) tanpa duplicate loop (Anti-Echo Loop terisolasi). Dilindungi unit test suite `hub_cross_instance_kick_test.go` (100% PASS).

---

### Fase 9: Monetisasi & Trust — Avatar Premium & Verified Account System (Status: 🔮 PLANNED)
*Tujuan: Membangun sistem monetisasi digital berbasis avatar premium dan membangun kepercayaan pengguna melalui sistem verifikasi akun terpercaya.*

- ⚡ **Milestone 9.1: User Verified Account System (Core Engine: ✅ Selesai, Admin Tools: 🔮 Planned)**:
  - **Backend (Core Engine Selesai ✅)**:
    - Kolom `is_verified BOOLEAN DEFAULT false` sudah aktif di tabel `users` dengan auto-migration di PostgreSQL (Supabase) dan SQLite (`sql.go`).
    - Struct `User` di Go (`user_store.go`) sudah memiliki field `IsVerified bool` (`json:"is_verified"`).
    - Struct `ConversationItem` di Go (`user_store.go`) sudah memiliki field `PeerIsVerified bool` (`json:"peer_is_verified"`).
    - Seluruh query SELECT user (`GetUserByID`, `GetUserByUsername`, `GetUserByUsernameOrDisplayName`, `SearchUsers`) dan query percakapan (`GetUserConversations`) sudah membaca `COALESCE(..., false)` secara aman.
  - **Frontend (Terkoneksi Penuh ✅)**:
    - Type `is_verified?: boolean` dan `peer_is_verified?: boolean` aktif di `frontend/lib/types.ts`.
    - Komponen `VerifiedBadge.tsx` terintegrasi dan live di seluruh touchpoint:
      - Daftar obrolan aktif di Sidebar (`Sidebar.tsx`) membaca `peer_is_verified`.
      - Header chat (`StatusBar.tsx`) membaca `peerIsVerified`.
      - Kartu profil lawan bicara (`ContactProfileModal.tsx`) membaca `is_verified`.
      - Modal profil akun pribadi (`ProfileModal.tsx`) membaca status verified akun user sendiri.
  - **Admin Tooling & Workflow (🔮 Planned)**:
    - Endpoint admin untuk men-set/mencabut status verified: `PATCH /api/admin/users/:id/verify`.
    - Business logic & kriteria verifikasi (opsi: manual approval, email konfirmasi domain, atau subscription tier).
    - Audit log perubahan `is_verified` di tabel `admin_actions`.

- 🔮 **Milestone 9.2: Avatar Premium Asset System**:
  - **Backend (Belum Ada ❌ — Perlu Dibuat)**:
    - Tabel `avatar_assets`: Katalog avatar premium (ID, nama, kategori, url preview, harga, is_free).
    - Tabel `user_avatar_inventory`: Relasi user ↔ avatar yang sudah dimiliki/dibeli (user_id FK, asset_id FK, acquired_at, source: `purchased` / `gifted` / `promo`).
    - Endpoint GET `/api/avatar/catalog` → daftar semua avatar (free & premium) beserta status kepemilikan user.
    - Endpoint POST `/api/avatar/equip` → ganti avatar aktif (`users.avatar_url`) ke avatar dari inventory.
    - Endpoint POST `/api/wallet/purchase/avatar` → transaksi pembelian avatar menggunakan saldo wallet internal.
  - **Backend (Sudah Ada, Perlu Diperluas ✅)**:
    - Field `avatar_url TEXT` di tabel `users` → sudah ada, dipakai sebagai "slot avatar aktif".
    - Infrastruktur wallet/saldo belum ada, perlu dirancang tersendiri (integrasi payment gateway atau in-app currency).
  - **Frontend (Belum Ada ❌ — Perlu Dibuat)**:
    - Halaman/Modal **Avatar Marketplace**: Grid avatar premium bergambar, badge harga, tombol beli/pasang.
    - **Inventory Drawer**: Daftar avatar yang sudah dimiliki, tombol "Pasang sebagai Avatar Aktif".
    - Integrasi ke `AvatarStudio.tsx` sebagai opsi ke-4: *"Pilih dari Koleksi Premium-ku"*.

---

### Fase 10: Group Memory AI — Forum Intelligence & Group Knowledge (Status: ✅ SELESAI)
*Tujuan: Mewujudkan visi "AI captures. Humans validate. Wuzz remembers." — Mengubah forum diskusi sementara (sub-group) yang kedaluwarsa menjadi memori kolektif grup yang abadi dan terkurasi manusia.*

*Dokumen Spesifikasi Utama: [`docs/GROUP_MEMORY_AI_SPEC.md`](./GROUP_MEMORY_AI_SPEC.md)*

- **Prinsip Arsitektur & Aturan Produk**:
  1. **Strict Group Scoped**: Memori grup terisolasi 100% per grup. Tidak ada memori global atau cross-group leakage.
  2. **Human Validation Gate**: AI hanya menghasilkan *Draft Memory*. Tidak ada memori yang dipublikasikan ke anggota tanpa persetujuan Admin grup.
  3. **Fast Review Experience**: Admin dapat memvalidasi draft memori dalam < 30 detik (Approve All, Edit Per-Artifact, Remove Journey Lite, atau Reject).
  4. **Evidence-Backed Decisions**: Setiap butir keputusan (*decision*) wajib memiliki bukti kutipan pesan asli (*evidence*) dengan fallback snapshot tahan hapus.
  5. **Journey Lite MVP**: Rekonstruksi alur diskusi dinamis (Awalnya... → Kemudian... → Akhirnya...) untuk menangkap esensi perjalanan pemikiran kelompok.

- **Milestone Implementasi MVP (M1 – M7)**:
  - ✅ **Milestone M1: Foundation & Data Model (SELESAI ✅)**:
    - SQL Migration: 7 tabel baru (`forum_memory_jobs`, `memory_drafts`, `memory_artifacts`, `artifact_evidences`, `approved_memories`, `memory_review_actions`, `memory_view_events`).
    - Domain Entities & Repository Go: Struct model dan query transaksional.
  - ✅ **Milestone M2: Job Queue & Expiry Trigger (SELESAI ✅)**:
    - Pola Queue PostgreSQL `FOR UPDATE SKIP LOCKED` non-blocking di Go backend.
    - Integrasi otomatis saat Forum bertransisi ke status `'expired'`.
  - ✅ **Milestone M3: AI Service Integration (SELESAI ✅)**:
    - Abstraksi `AIService` interface di Go backend.
    - Prompt engine dengan limit 1.000 pesan, parsing JSON terstruktur, ekstraksi Evidence, dan Confidence scoring.
  - ✅ **Milestone M4: Review Backend API (SELESAI ✅)**:
    - REST API Suite Review Admin: `GET /api/groups/{id}/memories/drafts`, `POST /api/memory/drafts/{id}/approve`, `POST /reject`, `PATCH /artifacts/{id}`.
  - ✅ **Milestone M5: Admin Review UI (Frontend Next.js) (SELESAI ✅)**:
    - Banner & drawer review di forum kedaluwarsa, kartu ringkasan, dialog keputusan + preview evidence, switch hapus Journey Lite, tombol satu-klik *"Setujui & Publikasikan"*.
  - ✅ **Milestone M6: Member Knowledge Viewer (Frontend Next.js) (SELESAI ✅)**:
    - Tab/Viewer "Memori Forum" di arsip forum dan grup induk untuk seluruh anggota grup, modal linimasa arsip memori, dan modal detail pengetahuan terpublikasi.
  - ✅ **Milestone M7: E2E Integration & Notification Polish (SELESAI ✅)**:
    - Notifikasi push/WebSocket ke Admin saat draft siap dan ke Member saat memori terbit. Provider factory multi-vendor, PWA deep-linking (`sw.js`), audit log & metrics tracking.

---

### Fase 11: Seamless Continuity, Multi-Device & Identity Architecture (Status: Phase 0, 1, 2, 3, 5 SELESAI ✅ | Phase 4 🔮)
*Tujuan: Memisahkan kopling monolitik identitas pengguna, mendukung banyak sesi dan perangkat fisik aktif (Desktop & Mobile) secara simultan dengan sinkronisasi E2EE dan rekonsiliasi koneksi yang tahan uji.*

*Dokumen Spesifikasi & Audit Utama: [`docs/ARCHITECTURE_AUDIT.md`](./ARCHITECTURE_AUDIT.md)*

- ✅ **Phase 0: Identity & Auth Hardening (SELESAI ✅)**:
  - DDL non-destruktif `revoked_tokens` dan `user_token_revocations` dengan in-memory sync cache.
  - Penyematan JTI UUID pada seluruh klaim JWT dan validasi instan di middleware `RequireJWT`.
  - Re-autentikasi password wajib sebelum eksekusi `/api/users/public-key/reset`.
  - Endpoint `POST /api/auth/change-password` dengan pembatalan seluruh sesi token aktif user (`RevokeAllUserTokens`).
- ✅ **Phase 1: Session Foundation & Inventory (SELESAI ✅)**:
  - Tabel `sessions` di PostgreSQL dan SQLite dengan pelacakan JTI, device_id, IP, dan User Agent.
  - Endpoint `GET /api/auth/sessions` (daftar sesi aktif) dan `DELETE /api/auth/sessions/:id` (remote logout sesi tertentu).
- ✅ **Phase 2: Device Registry & Reconnect Resilience (SELESAI ✅)**:
  - Tabel `devices` mandiri memisahkan metadata perangkat fisik dari tabel `users`.
  - Endpoint `GET /api/auth/devices` dan `DELETE /api/auth/devices/:id`.
  - Sinkronisasi WebSocket handshake otomatis (*auto-register device*, pengalihan otoritas `active_device_id` tanpa false 403, dan atomic UPSERT rebinding).
- ✅ **Phase 3: Credential Separation (SELESAI ✅)**:
  - Tabel `user_credentials` (id, user_id, type, identifier, secret_data, name).
  - Memisahkan kredensial password dari profil pengguna `users` dengan dual-read/dual-write non-destruktif, membuka jalan login multi-metode.
- 🔮 **Phase 4: Passkey / WebAuthn / FIDO2 (Siap Dieksekusi 🔮)**:
  - Standar W3C WebAuthn untuk login biometrik tanpa password (Touch ID / Face ID / Windows Hello).
  - Skema tabel `passkey_credentials`, endpoint registrasi `start`/`finish`, dan verifikasi autentikasi kriptografi COSE.
- ✅ **Phase 5: Multi-Device E2EE Continuity (SELESAI ✅)**:
  - Sinkronisasi kunci identitas E2EE master via transfer QR code ephemeral terenkripsi AES-256-GCM (`device_transfer_sessions`).
  - Manajemen siklus hidup multi-perangkat terkelola, auto-eviction FIFO, dan pencegahan false conflict loop.

---

## 🏛️ Track B: Transformasi Modular Monolith & DDD Engine

*Tujuan: Menata ulang arsitektur internal backend Go dari model 1-layer flat menjadi **Pragmatic Modular Monolith (3-Tier: Transport → Application Service → Domain → Infrastructure)** untuk mewujudkan Wuzz Chat sebagai **Reusable Messaging Engine** yang siap pakai untuk produk eksternal (misal: InstaQRIS) dan ekspansi fitur lanjutan.*

*Dokumen Spesifikasi Arsitektur: [`docs/MODULAR_MONOLITH_DDD.md`](./MODULAR_MONOLITH_DDD.md)*

```text
Transport Layer (REST Handler / WebSocket Hub & Client)
       │
       ▼
Application Layer (Use Cases: AuthService, MessageService, GroupService, MemoryService)
       │
       ▼
Domain Layer (Entity & Repository Interfaces: Identity, Auth, Messaging, Group, Memory)
       ▲
       │
Infrastructure Layer (SQL Implementation: SQLGroupStore, SQLUserStore, Redis, AI Provider)
```

- **Tahapan Eksekusi Engine**:
  - ✅ **Fase 1: Pemisahan GroupStore dari SQLUserStore (SELESAI & DEPLOYED ✅)**:
    - Ekstrak 22 method grup dari `SQLUserStore` ke struct mandiri `store.SQLGroupStore` (`backend/internal/store/sql_group_store.go`).
    - Inisialisasi mandiri di `main.go`. Seluruh test suite lulus 100% dan telah live di Fly.io.
  - ✅ **Fase 2: Application Service untuk Auth & Identity (SELESAI & DEPLOYED ✅)**:
    - Membuat `AuthService` untuk use case login, register, device limits, dan session revocation.
    - Menjadikan `api/auth_handler.go` sebagai *thin transport* (hanya HTTP parsing & response formatting).
    - Memisahkan domain `Identity` (profil, E2EE key) dari domain `Auth` (kredensial, sesi, token).
  - ✅ **Fase 3: Application Service untuk Messaging & Hub Decoupling (SELESAI ✅)**:
    - Membuat domain `internal/messaging/` (`entity.go`, `repository.go`, `infra/sql_repository.go`) dengan Strangler Fig Pattern.
    - Membuat `MessageService` untuk use cases pesan (edit, delete, forward, pin, unpin, update receipt, search, direct chat, clear conversation).
    - Mengisolasi WebSocket Hub (`ws/hub.go` dan `ws/client.go`) dengan interface minimal `RoomAuthorizationChecker` (menghapus injeksi langsung `store.UserStore` DB).
  - ✅ **Fase 4: Group & Forum Application Service (SELESAI ✅)**:
    - Membuat domain `internal/group/` (`entity.go`, `repository.go`, `infra/sql_repository.go`), `GroupService` & `ForumService` terpadu, memindahkan `SubGroupTTLWorker` ke domain worker grup (`group/worker/ttl_worker.go`).
    - Menjadikan `api/group_handler.go` sebagai *thin transport*, lulus seluruh test suite 100%, serta terverifikasi via client frontend simulation (`test-group-simulation.mjs`).
  - ✅ **Fase 5: Memory Engine Generalization (`ContextSource` Abstraction) (SELESAI ✅)**:
    - Mengabstraksikan sumber memori AI via interface `ContextSource` (mendukung Forum, Group, dan Direct Chat Memory).
    - Membangun domain `internal/memory/` (`entity.go`, `context_source.go`, `repository.go`, `infra/sql_repository.go`), `MemoryService`, serta integrasi `ForumContextSource` di domain group.
    - Menjadikan `api/memory_handler.go` sebagai *thin transport*, 100% lulus automated Go tests, Next.js build, dan 14-langkah real frontend client simulation.

  - ✅ **Fase 6: Cleanup & Slim Entrypoint Wiring (`wire.go` / `app.go`) (SELESAI ✅)**:
    - Sentralisasi konfigurasi terpadu di `internal/shared/config/`, pengemasan background cleaner worker di `internal/authz/worker/cleaner_worker.go`.
    - Orkestrasi dependency injection dan container perakitan di `internal/app/wire.go`, pemisahan router modular di `internal/app/router.go`.
    - Merampingkan `main.go` menjadi 55 baris dengan Go standard graceful shutdown, 100% lolos full backend & frontend test suite.

---

## 🏛️ Arsitektur Target Platform

```
                                  ┌───────────────────────────────┐
                                  │       Client Interfaces       │
                                  │  (Next.js Web / Mobile Apps)  │
                                  └───────────────┬───────────────┘
                                                  │
                                                  │ HTTPS / WSS
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │    API Gateway & Reverse      │
                                  │     Proxy (Next.js / Nginx)   │
                                  └───────────────┬───────────────┘
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         │                                                 │
                         ▼                                                 ▼
          ┌──────────────────────────────┐                  ┌──────────────────────────────┐
          │     Golang Auth & REST API   │                  │   Golang WebSocket Cluster   │
          │   (Users, Groups, Media)     │                  │  (Hub A, Hub B, Hub C...)    │
          └──────────────┬───────────────┘                  └──────────────┬───────────────┘
                         │                                                 │
                         │                                                 │ Pub/Sub & Presence
                         │                                                 ▼
                         │                                  ┌──────────────────────────────┐
                         │                                  │       Redis Cluster          │
                         │                                  │   (Pub/Sub, Caching, Locks)  │
                         │                                  └──────────────┬───────────────┘
                         │                                                 │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │     PostgreSQL (Supabase)     │
                                  │   Messages, Users, Relations  │
                                  └───────────────────────────────┘
```
