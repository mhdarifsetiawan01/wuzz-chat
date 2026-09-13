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
│  FASE 7: Security Hardening & WebRTC Calling (NEXT 🎯)                 │
│  - E2EE Signal Protocol Option, 1-on-1 Audio/Video Call via WebRTC     │
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
  - Emoji & Reaction picker cepat (`👍 ❤️ 😂 😮 😢 🙏`) pada setiap balon pesan dengan toggle interaktif.
  - Fitur Reply / Quote pesan dengan banner pratinjau dan **Click-to-Scroll & Glow Highlight** ke pesan asli.
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

### Fase 7: Advanced Security & WebRTC Calling
*Tujuan: Keamanan tingkat tinggi dan fitur panggilan suara/video.*
- **Audio & Video Call (1-on-1)**:
  - Signaling via WebSocket yang sudah ada, media stream P2P via WebRTC (STUN/TURN server).
- **End-to-End Encryption (E2EE)**:
  - Implementasi kriptografi kunci publik (ECDH + AES-GCM) di sisi browser client, sehingga server hanya menerima cipher teks yang tidak dapat diintip.

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
