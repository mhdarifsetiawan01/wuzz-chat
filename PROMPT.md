# PROMPT.md — Instruksi Inisialisasi Sesi AI (Context Primer)

> 💡 **Panduan untuk AI Agent**: Jika pengguna memberikan perintah *"baca PROMPT.md"*, AI wajib membaca dokumen ini secara menyeluruh untuk memahami seluruh arsitektur, riwayat implementasi, konvensi kode, aturan keamanan, dan status proyek saat ini sebelum merespons atau mengeksekusi kode.

---

## 🎯 1. Identitas & Visi Proyek

- **Nama Proyek:** Wuzz Chat
- **Tujuan Utama:** Membangun aplikasi chatting real-time modern berskala industri dengan performa tinggi, UI/UX elegan, dan fitur lengkap sekelas **WhatsApp & Telegram**.
- **Arsitektur:** Monorepo (Golang Backend + Next.js 16 App Router Frontend + PostgreSQL Supabase Database).
- **Branch Kerja Utama:** `dev` *(DILARANG bekerja atau commit langsung di `main`/`master`/`staging`)*.

---

## 🗺️ 2. Dokumen Sumber Kebenaran (Single Source of Truth)

Sebelum melakukan perubahan besar atau refactoring, AI harus merujuk ke dokumen berikut:
1. 🛡️ **[`docs/SECURITY_AND_PERFORMANCE.md`](docs/SECURITY_AND_PERFORMANCE.md)**: Panduan arsitektur keamanan (Anti-BOLA/IDOR, Anti-SSRF, IP Pinning) dan optimasi performa backend ($O(1)$ CTE batching, database indexes, SQLite WAL mode).
2. 🗺️ **[`docs/ROADMAP.md`](docs/ROADMAP.md)**: Master roadmap dari Fase 1 hingga Fase 7.
3. 🏛️ **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**: Spesifikasi desain database (ERD), skema tabel, dan protokol WebSocket.
4. 📱 **[`docs/MOBILE_INTEGRATION_GUIDE.md`](docs/MOBILE_INTEGRATION_GUIDE.md)**: Panduan integrasi teknis klien mobile native (Kotlin, Swift) & cross-platform (Flutter, React Native).
5. 📄 **[`docs/PROGRESS.md`](docs/PROGRESS.md)**: Riwayat kemajuan tugas dan catatan handover setiap fase.
6. 📜 **[`PRD-websocket-chat-app.md`](PRD-websocket-chat-app.md)**: Spesifikasi awal produk.

---

## ⚙️ 3. Arsitektur Teknis & Tech Stack

| Layer | Teknologi | Catatan Implementasi |
|---|---|---|
| **Backend** | Go (Golang 1.26+) | `gorilla/websocket`, `golang-jwt/jwt/v5`, `golang.org/x/crypto/bcrypt`, `lib/pq` (PostgreSQL), `modernc.org/sqlite` (WAL Mode & Busy Timeout 5s) |
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript | Vanilla CSS Design System, Auth Context (`useAuth`), WebSocket Client (`ws-client.ts`), 2-Kolom Layout & Mobile Single-Screen Flow |
| **Proxy Layer** | Custom Node.js Server (`server.js`) | Menangani HTTP upgrade `/ws` dan me-reverse proxy `/api/*` ke Go Backend (`http://localhost:8080`) |
| **Database** | PostgreSQL (Supabase Pooler) / SQLite | Auto-migration tabel `users`, `conversations`, `conversation_members`, `messages` dengan indeks komposit |
| **Pub/Sub & Cache**| Redis (Upstash) / In-Memory Fallback | Multi-node WebSocket sync (`wuzz:cluster:events`) & link preview cache |
| **Live Endpoints** | Fly.io (Backend) & Vercel (Frontend) | Live: `https://wuzz-chat-backend.fly.dev` & `https://chat.wuzzhub.id` |

---

## 📊 4. Status Fase Saat Ini (Current Progress)

- ✅ **Fase 1: Real-Time Engine Foundation (SELESAI)** — Hub WebSocket Go, Read/Write pumps, Custom Server Proxy, Dark Mode CSS.
- ✅ **Fase 2: Persistence & Presence (SELESAI)** — Supabase PostgreSQL integration, room code routing (`room-XXXX`), auto-migration, drawer anggota online (`👥 X Online`).
- ✅ **Fase 3: User Identity, JWT Auth & Direct Messages (SELESAI)** — Register (`bcrypt`), Login JWT 7 hari, profil user, pencarian kontak (`/api/users/search`), obrolan langsung (Direct Message), layout 2-kolom WhatsApp-grade lengkap dengan Standby / Welcome Screen.
- ✅ **Fase 4: Modern Chat UX & Interactive Dynamics (SELESAI)** — Unread Badge Counter persisten, Web Audio API Sound FX, 3-Stage Receipts (`sent`, `delivered`, `read`), Live Typing Indicator, Emoji Reactions & Quote Reply (Click-to-Scroll & Glow), Sidebar Receipt Icons, Anti-Spam Clean Timeline, Hapus Pesan (For Me / For Everyone 1 min), Hapus Percakapan (`cleared_at`), dan Arsitektur Dual-Platform (Desktop 2-Kolom Split & Mobile WhatsApp Single-Screen Flow).
- ✅ **Fase 5: Rich Media, Voice Notes, Attachments & Store-and-Forward Lifecycle (SELESAI)** —
  1. Upload Media & Storage Driver Factory (Supabase Storage & Local disk fallback).
  2. Paste gambar clipboard (`Ctrl+V`), Drag-and-Drop file, dan Modal Lightbox viewer interaktif.
  3. Web Audio API Voice Note recorder (`MediaRecorder`) & Custom dynamic waveform audio player bubble.
  4. Document & Attachment sharing card dengan badge ekstensi berwarna dan direct downloader.
  5. WhatsApp-Style Store-and-Forward ($0 Storage Cost): auto-delete fisik file via `POST /api/media/ack`.
  6. TTL Background Purge Worker (`MEDIA_RETENTION_DAYS=7`).
  7. Client-Side Offline Storage (`IndexedDB` via `mediaCache.ts`) & graceful expired state.
  8. Client-Side Pre-Upload Image Compressor (`imageCompressor.ts`, max 1600px, WebP quality 0.82) dengan toggle di Profil.
- ✅ **Fase 6: Distributed Scale & Reliability (SELESAI)** —
  1. Upstash Redis Pub/Sub TCP TLS (`rediss://...`) dan In-Memory fallback broker.
  2. Multi-Instance Go WebSocket synchronization dengan Anti-Echo loop Node UUID.
  3. Dynamic Multi-Origin CORS & WebSocket Origin Whitelist (`CORS_ALLOWED_ORIGINS`).
  4. OpenGraph Rich Link Previewer dengan Anti-SSRF guard (Socket-Level IP Pinning), Redis Caching 24 jam, dan Frontend UI Card.
  5. Multi-Stage Dockerfile (< 25MB), Next.js server-side rewrites, dan Fly.io Production Deployment (`https://wuzz-chat-backend.fly.dev` & `https://chat.wuzzhub.id`).
- ✅ **Fase 7: Advanced Security & WebRTC Audio Calling (SELESAI)** —
  1. **End-to-End Encryption (E2EE)**: Kriptografi standar terbuka (**ECDH NIST P-256 + HKDF-SHA256 + AES-256-GCM**) via Web Crypto API, private key tersimpan di `IndexedDB` (`wuzz_crypto_db`), Safety Number Fingerprint 30-digit, dan zero-knowledge backend.
  2. **E2EE Single Active Device & Key Conflict Guard**: Pelacakan `active_device_id` & `key_version`, HTTP 409 Conflict rejection, explicit `/api/users/public-key/reset`, Hard Blocker UI, tombol back HP auto-logout, Single-Session WebSocket Kick di backend (`SESSION_REPLACED`), Fail-Closed E2EE Guard, dan modal konflik UI (`DeviceConflictModal.tsx`).
  3. **Zero-Knowledge QR Code Key Migration (Milestone 7.6 & 7.7 / Opsi 2)**: Fitur pemindahan identitas kriptografi antar perangkat via QR Code ephemeral (TTL 5 menit), enkripsi bundle AES-256-GCM berdasar 256-bit PBKDF2, atomic single-use retrieval di database SQL (`/api/users/transfer/create` & `/api/users/transfer/consume`), modal UI `DeviceTransferModal.tsx` dengan **In-App Camera QR Scanner (`html5-qrcode`)**, **Pre-Warm Permission Strategy** (getUserMedia dipanggil sebelum async chain agar gesture token Android tetap hidup), **Native Camera Intent Capture fallback** (`<input capture="environment">`), **PWA Manifest `"permissions": ["camera"]`**, smart tab filtering (`hideGenerate=true`), gallery/image offscreen file scanner (`qr-file-scanner-box`), dan deep link `/transfer?token=...`. *(Live scanner penuh di Android WebAPK terbatas oleh platform Permissions Policy; workaround solid via native camera capture. Future: Android Native App). ✅ SELESAI TERMASUK BUG FIX PWA ANDROID.*
  4. **1-on-1 Voice / Audio Calling via WebRTC P2P (Milestone 7.2A)**: WebSocket signaling (`call_offer`, `call_answer`, `ice_candidate`), STUN + OpenRelay TURN fallback, Web Audio API procedural ringtones, In-Call Overlay UI dengan live timer dan microphone mute, serta modal panggilan masuk interaktif.
  5. **Security & Scalability Hardening**: Mitigasi BOLA/IDOR WebSocket (`isAuthorizedForRoom`), IDOR Media ACK check, Anti-SSRF Socket-Level IP Pinning (14 subnet), eliminasi $N+1$ query via $O(1)$ batched CTE window function, database indexing, dan SQLite WAL mode concurrency.
  6. *(Milestone 7.2B: 1-on-1 Video Calling di-hold sementara untuk memprioritaskan fitur inti komunikasi).*
- ⏳ **Fase 8: Core Parity (Push Notifications, Group Chat & Message Management) (SEDANG BERJALAN)** —
  1. ✅ **Milestone 8.1: Universal Push Notification Engine & PWA Install (SELESAI)**: Integrasi W3C Web Push (VAPID RFC 8292) via `SherClockHolmes/webpush-go`, auto key generation, REST endpoints (`/api/notifications/subscribe`, `unsubscribe`, `vapid-public-key`), background dispatcher di Go WebSocket Hub saat user offline, Service Worker (`sw.js`) dengan **Zero-Knowledge Client-Side Background Decryption** (Web Crypto ECDH + HKDF + AES-GCM + IndexedDB) sehingga teks pesan E2EE tampil terdekripsi di notifikasi OS, toggle notifikasi di ProfileModal, tombol Header **"📲 Instal App"** dengan auto-hide di mode Standalone, dan arsitektur Multi-Platform Gateway (Web, PWA & Android FCM Ready).
  2. 🎯 **Milestone 8.2: Group Chat Engine & Member Management (NEXT)**: Percakapan multi-user, multicast WebSocket broadcast, role Admin/Member, modal buat grup, Group Info Drawer, dan group mention system.
  3. ⏳ **Milestone 8.3: Message Management Suite**: Edit pesan (15 menit), forward pesan, pin chat & pin message, starred message, dan in-chat search.

---

## 🛡️ 5. Aturan Wajib untuk AI (Mandatory Rules & Constraints)

1. **Aturan Siklus Hidup Server**:
   - Jika AI menyalakan server sementara untuk verifikasi (misal: `go run main.go` atau `npm run dev`), AI **WAJIB mematikan port tersebut (`fuser -k <port>/tcp`)** sebelum mengakhiri respons, KECUALI user meminta dibiarkan berjalan.
2. **Aturan Arsitektur Frontend Dual-Platform (Mobile & Desktop) (SOP)**:
   - Setiap modifikasi frontend (CSS, komponen React, state management, routing, event handling) **WAJIB** mempertimbangkan dan menguji kompatibilitas untuk KEDUA platform: Mobile (Handphone) dan Desktop (Laptop/PC).
   - Pastikan viewport dengan `interactiveWidget: 'resizes-content'` (bukan `pan`), sticky header, safe area padding `env(safe-area-inset-bottom)`, guard anti-stale lifecycle (`lastHandledMsgIdRef` & clean history reset), dan `window.scrollY` dikunci ke 0 via `visualViewport` listener terpenuhi.
3. **Aturan Keamanan Git, Branching & Konfirmasi Commit (SOP)**:
   - **DILARANG KERAS melakukan perubahan, modifikasi kode, atau pengerjaan tugas langsung di branch `main`.**
   - Seluruh pekerjaan wajib dilakukan di branch `dev` atau feature branch baru (`feature/...`).
   - Alur promosi bertingkat: **Feature Branch ➔ `dev` (Pengujian & Stabilitas) ➔ `main` (Persiapan Rilis) ➔ `git push origin main` (Setelah disetujui tertulis)**.
   - **DILARANG KERAS melakukan `git commit` tanpa persetujuan / konfirmasi eksplisit dari pengguna.**
   - Setiap kali suatu task/tugas selesai, AI wajib konfirmasi ke user. Jika user menyatakan **"selesai"** / menyetujui, barulah AI boleh melakukan `git commit`.
   - Jika user menganggap belum selesai / ada perbaikan, percakapan selanjutnya di sesi tersebut **tetap melanjutkan percakapan sebelumnya** tanpa melakukan commit.
   - **DILARANG KERAS melakukan `git push`** ke branch remote manapun tanpa instruksi tertulis terpisah dari user. Khususnya, **jangan pernah push `dev` ke remote** kecuali diminta secara eksplisit.
4. **Aturan Keamanan Database**:
   - Dilarang menjalankan query destruktif (`DROP TABLE`, `DROP DATABASE`, `TRUNCATE`) tanpa konfirmasi tertulis eksplisit dari pengguna.
5. **Aturan Peringatan & Konfirmasi Deployment Backend (SOP)**:
   - Setiap ada modifikasi kode pada direktori `backend/`, AI **WAJIB** memberikan peringatan dan konfirmasi eksplisit kepada user bahwa server live di Fly.io perlu dideploy ulang (`fly deploy --remote-only`) demi mencegah desinkronisasi protokol/query dengan frontend live.
6. **Kualitas Kode**:
   - Pastikan backend selalu lulus `go test -v ./...` dan frontend selalu lulus `npm run build` sebelum menyelesaikan tugas.
7. **Aturan Audit & Sinkronisasi Dokumentasi Holistik (SOP)**:
   - Jika user meminta "update dokumentasi" atau saat menyelesaikan fitur/perubahan skema, AI **WAJIB melakukan 360-degree audit ke SEMUA dokumen**: [`README.md`](README.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/PROGRESS.md`](docs/PROGRESS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SECURITY_AND_PERFORMANCE.md`](docs/SECURITY_AND_PERFORMANCE.md), [`docs/MOBILE_INTEGRATION_GUIDE.md`](docs/MOBILE_INTEGRATION_GUIDE.md), dan [`PROMPT.md`](PROMPT.md). Dilarang hanya mengaudit sebagian dokumen.

---

## 🚀 6. Cara Menjalankan Aplikasi Secara Lokal

1. **Backend Go** (Port `8080`):
   ```bash
   cd backend && go run main.go
   ```
2. **Frontend Next.js** (Port `3047`):
   ```bash
   cd frontend && npm run dev
   ```
3. Buka di browser: `http://localhost:3047` atau `http://localhost:3047/chat`.
