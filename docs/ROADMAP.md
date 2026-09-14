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
│  FASE 8: Core Parity (Push, Group Chat & Message Mgmt) (SEDANG JALAN⏳) │
│  - Milestone 8.1: Universal Push Notification Engine (SELESAI ✅)       │
│  - Milestone 8.2: Group Chat Engine & Member Management (NEXT 🎯)       │
│  - Milestone 8.3: Message Management Suite (Edit, Forward, Pin, Star)  │
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
- **Conversation & Message Deletion Management**:
  - **Hapus Percakapan untuk Saya (*Delete Conversation for Me*)**: Menyembunyikan riwayat obrolan dari daftar pengguna tanpa menghapus riwayat lawan bicara via timestamp `cleared_at`. Percakapan otomatis muncul kembali jika ada pesan baru setelah waktu clear.
  - **Hapus Pesan Spesifik (*Delete Message: For Me vs For Everyone*)**:
    - *Hapus untuk Saya*: Sembunyikan pesan tertentu kapan saja untuk diri sendiri (`deleted_for_users`).
    - *Hapus untuk Semua Orang*: Tarik pesan untuk seluruh peserta obrolan jika pesan dikirim sendiri dan berusia **≤ 1 menit (60 detik)**. Mengubah teks menjadi `🚫 Pesan ini telah dihapus` dan broadcast event real-time `message_deleted` via WebSocket.
  - Clean Timeline (Anti-spam join/leave/welcome message).

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
  - 100% interoperabel dan siap untuk klien mobile masa depan (Kotlin Android, Flutter, React Native, Swift iOS).
- ✅ **Milestone 7.2A: 1-on-1 Voice / Audio Calling (WebRTC P2P) (SELESAI)**:
  - Signaling full duplex via WebSocket Go Backend (`call_offer`, `call_answer`, `ice_candidate`, `call_reject`, `call_end`, `call_busy`).
  - Web Audio API procedural sound synthesizer untuk nada sambung keluar (*tuuut...*) dan nada dering masuk melodis.
  - Dialog pop-up panggilan masuk interaktif (`IncomingCallModal.tsx`) dengan animasi avatar denyut dan tombol Terima/Tolak.
  - Layar overlay panggilan suara aktif (`AudioCallOverlay.tsx`) dengan avatar wave, timer durasi live, toggle mute microphone, dan tombol akhiri panggilan.
  - Koneksi P2P direct audio stream latensi rendah via Google Public STUN (`stun:stun.l.google.com:19302`) tanpa beban bandwidth server.
- ⏸️ *(Milestone 7.2B Video Calling di-hold sementara untuk memprioritaskan fitur inti komunikasi).*

---

### Fase 8: Core Parity — Push Notifications, Group Chat & Message Management (Status: SEDANG BERJALAN ⏳)
*Tujuan: Menghadirkan kesetaraan fitur komunikasi inti (*Core Parity*) dengan WhatsApp & Telegram.*
- ✅ **Milestone 8.1: Universal Push Notification Engine (SELESAI)**:
  - Standard W3C Web Push (VAPID RFC 8292) dengan integrasi `SherClockHolmes/webpush-go`.
  - Skema tabel multi-platform `push_subscriptions` (`web`, `android`, `ios`).
  - Auto keypair generation VAPID di backend Go.
  - REST Endpoints: `GET /api/notifications/vapid-public-key`, `POST /api/notifications/subscribe`, `POST /api/notifications/unsubscribe`.
  - Asynchronous push dispatcher pada WebSocket Hub saat user penerima sedang offline/idle.
  - Service Worker (`public/sw.js`) dengan event `push`, `notificationclick` (deep-linking), dan **Zero-Knowledge Client-Side Background Decryption** (Web Crypto API + IndexedDB) sehingga teks pesan E2EE terdekripsi langsung di notifikasi OS layaknya WhatsApp Web.
  - UI Toggle Notifikasi di `ProfileModal.tsx` dan Tombol Header **"📲 Instal App"** di `Sidebar.tsx` dengan auto-hide di mode Standalone PWA.
- 🎯 **Milestone 8.2: Group Chat Engine & Member Management (NEXT)**:
  - Pembuatan grup obrolan multi-kontak, manajemen role Admin & Member, Group Info Drawer, multicast WebSocket broadcast, dan unread count per anggota.
- ⏳ **Milestone 8.3: Message Management Suite**:
  - Edit pesan (15 menit), forward pesan multi-kontak, pin chat (sidebar) & pin message (header), starred/bookmark message, dan in-chat text search.

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
