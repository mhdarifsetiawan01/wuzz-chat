# Roadmap Arsitektur Wuzz Chat — Menuju Modern Chat Platform (WhatsApp / Telegram Grade)

Dokumen ini mendefinisikan peta jalan (*strategic roadmap*), target arsitektur, dan tahapan evolusi aplikasi **Wuzz Chat** dari *proof-of-concept WebSocket* menjadi aplikasi chatting modern berskala industri dengan kapabilitas sekelas WhatsApp / Telegram.

---

## 🎯 Visi & Grand Goal Proyek

Membangun platform chatting modern yang:
1. **Real-Time & Ultra-Low Latency**: Pengiriman pesan instan dengan WebSocket dan Redis Pub/Sub.
2. **Reliable & Resilient**: Jaminan pesan terkirim (*At-least-once delivery*), status pengiriman (Sent `✓`, Delivered `✓✓`, Read `✓✓` biru), dan sinkronisasi offline.
3. **Rich Multimedia & Communication**: Mendukung teks berformat, emoji picker, attachment gambar/video/dokumen, voice note, dan audio/video call (WebRTC).
4. **Security & Privacy**: Autentikasi aman (JWT / OAuth), proteksi data, dan opsi End-to-End Encryption (E2EE).
5. **Multi-Platform Ready**: Arsitektur backend API yang bersih sehingga siap dikonsumsi oleh Web (Next.js), Mobile (React Native / Flutter), maupun Desktop (Tauri).

---

## 🗺️ Master Roadmap Tahapan (Phased Evolution)

```text
┌────────────────────────────────────────────────────────────────────────┐
│  FASE 1: Real-Time Engine Foundation (SELESAI ✅)                       │
│  - Go WebSocket Hub, Next.js Proxy, Room Routing, In-Memory Store      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 2: Cloud Persistence & Group Presence (SELESAI ✅)               │
│  - Supabase PostgreSQL, SQLite, Room History, Member Presence Drawer  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 3: User Identity, Auth & Permanent Contacts (SELESAI ✅)          │
│  - JWT Authentication, User Profiles, Contact List, 1-on-1 Direct DM   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 4: Modern Chat UX & Interactive Dynamics (SELESAI ✅)            │
│  - Sent/Delivered/Read Receipts (✓/✓✓), Typing Indicator, Sound FX     │
│  - Emoji Reactions, Reply/Quote Message, Real-Time Unread Badge Counter│
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 5: Rich Media & Attachments (SELESAI ✅)                         │
│  - Store-and-Forward Media ($0 Cost), Voice Notes, Audio Player Wave   │
│  - Document Sharing, Image Lightbox, Client WebP Compression           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 6: Distributed Scale & Reliability (SELESAI ✅)                  │
│  - Upstash Redis Pub/Sub, Multi-Instance Hub, Anti-Echo Loop Node ID   │
│  - Dynamic CORS Whitelist, OpenGraph Safe Link Preview, Dockerfile     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 7: Security Hardening & WebRTC Calling (SELESAI ✅)              │
│  - Bagian 1: End-to-End Encryption (E2EE ECDH + AES-GCM) (SELESAI ✅)  │
│  - Bagian 2 (7.2A): 1-on-1 Voice / Audio Call WebRTC (SELESAI ✅)       │
│  - (7.2B Video Call di-hold sementara untuk prioritas core parity)     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 8: Core Parity (Push, Group Chat & Message Suite) (SELESAI ✅)  │
│  - Milestone 8.1: Universal Push Notification Engine (SELESAI ✅)       │
│  - Milestone 8.4: IndexedDB Message Cache & E2EE Continuity (SELESAI ✅)│
│  - Milestone 8.2A: Core Group Chat Engine & Member Mgmt (SELESAI ✅)     │
│  - Milestone 8.2B: Ephemeral Sub-Groups & TTL Auto-Purge (SELESAI ✅)    │
│  - Milestone 8.2C: Forum Rebranding & Mobile Header Redesign (SELESAI ✅)│
│  - Milestone 8.8: Realtime Engine Scalability & High-ROI Opt (SELESAI ✅)│
│  - Milestone 8.9: Mobile-Ready Reliability (ACK & Idempotency) (SELESAI ✅)│
│  - Milestone 8.3: Message Management Suite (SELESAI ✅)                 │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 9: Seamless Continuity (Multi-Device Sync & Offline Resilience)  │
│  - Multi-Device Sessions, Cross-Device E2EE Keys, Offline Outbox Queue │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 10: Broadcast Power (Public/Private Channels & Discovery)        │
│  - 1-to-Many Channels, Broadcast Lists, Discussion Threads             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 11: AI-Native Chat Experience (Competitive Differentiator)       │
│  - Voice Note AI Transcriber, Chat Summarizer TL;DR, Copilot Bot       │
└────────────────────────────────────────────────────────────────────────┘
```

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
  - **Pelepasan Sesi Perangkat Aktif (`POST /api/auth/logout`)**: Endpoint logout resmi di backend Go yang mengosongkan kolom `users.active_device_id = ''` di database, mengeliminasi false conflict (HTTP 409) ketika pengguna berpindah ke perangkat baru setelah logout.
  - **Single Consolidated Banner for Encrypted Messages UX**: Menggantikan tumpukan puluhan bubble `🔒 [Pesan Terenkripsi]` dengan **1 buah banner sistem ringkas** di linimasa chat (`ChatWindow.tsx`) dan optimasi single-pass memoized loop $O(N)$ via `useMemo`.
- 🔮 **Post-Milestone 8: Multi-Node WebSocket Cluster Session Kick (`SESSION_REPLACED` via Redis Pub/Sub)**:
  - *Tujuan*: Sinkronisasi pergantian sesi perangkat aktif lintas-mesin container Fly.io (multi-node cluster).
  - *Mekanisme*: Saat pengguna login di Instance A dengan `device_id` baru, broadcast event `session_replaced` ke channel Redis `wuzz:cluster:events` agar Instance B yang menampung koneksi soket lama langsung menendang soket tersebut dengan Close Code 4001 (`SESSION_REPLACED`).

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

  > **Catatan Arsitektur**: `users.avatar_url` tetap berfungsi sebagai "slot aktif" yang di-render di seluruh UI. Avatar premium hanyalah mekanisme untuk mengisi slot ini dari katalog terkurasi, bukan mengganti struktur render yang sudah ada.

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
