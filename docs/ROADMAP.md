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
│  FASE 5: Rich Media & Attachments (NEXT 🎯)                            │
│  - Image/Video upload (S3/Supabase Storage), Voice Notes, Link Preview │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 6: Distributed Scaling & High Availability                       │
│  - Redis Pub/Sub for Multi-Instance Go Hub, Offline Push Notifications │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  FASE 7: Security Hardening & WebRTC Calling                           │
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

### Fase 5: Rich Media, Voice Notes & Attachments (Target Selanjutnya 🎯)
*Tujuan: Mendukung pengiriman berbagai tipe konten multimedia.*
- **Cloud Object Storage Integration**:
  - Integrasi S3 / Supabase Storage untuk upload media.
  - Generasi thumbnail otomatis untuk gambar & video.
- **Voice Note Recording**:
  - Web Audio API: Perekaman suara langsung dari browser, preview visual waveform, dan pemutar audio kustom.
- **Document & File Sharing**:
  - Upload file PDF, ZIP, Dokumen dengan progress bar persentase.
- **Link Previewer**:
  - Otomatis mengambil metadata OpenGraph (Title, Description, Image) saat user mengirimkan link URL.

---

### Fase 6: Distributed Scale & Reliability
*Tujuan: Memastikan sistem dapat menampung ribuan/jutaan user bersamaan dengan multi-server.*
- **Redis Pub/Sub Layer**:
  - Menghubungkan banyak instance Go Backend agar user di server A bisa chat dengan user di server B secara transparan.
- **Offline Message Queue & Push Notifications**:
  - Web Push Notifications (Service Worker) saat tab browser sedang tertutup.
  - Queueing pesan untuk user yang sedang offline dan dikirimkan saat mereka online kembali.

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
