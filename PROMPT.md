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
1. 🔌 **[`docs/BACKEND_API.md`](docs/BACKEND_API.md)**: Panduan integrasi teknis REST API, WebSocket event catalog, E2EE wire format, dan siklus hidup media untuk pengembang frontend baru.
2. 🛡️ **[`docs/SECURITY_AND_PERFORMANCE.md`](docs/SECURITY_AND_PERFORMANCE.md)**: Panduan arsitektur keamanan (Anti-BOLA/IDOR, Anti-SSRF, IP Pinning) dan optimasi performa backend ($O(1)$ CTE batching, database indexes, SQLite WAL mode).
3. 🗺️ **[`docs/ROADMAP.md`](docs/ROADMAP.md)**: Master roadmap dari Fase 1 hingga Fase 7.
4. 🏛️ **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**: Spesifikasi desain database (ERD), skema tabel, dan protokol WebSocket.
5. 📱 **[`docs/MOBILE_INTEGRATION_GUIDE.md`](docs/MOBILE_INTEGRATION_GUIDE.md)**: Panduan integrasi teknis klien mobile native (Kotlin, Swift) & cross-platform (Flutter, React Native).
6. 📄 **[`docs/PROGRESS.md`](docs/PROGRESS.md)**: Riwayat kemajuan tugas dan catatan handover setiap fase.
7. 📜 **[`PRD-websocket-chat-app.md`](PRD-websocket-chat-app.md)**: Spesifikasi awal produk.

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
  2. ✅ **Milestone 8.4: IndexedDB Message Cache & E2EE Continuity (SELESAI)**: Database lokal `wuzzchat_msg_db` (`frontend/lib/messageCache.ts`) dengan pola **Cache-First Load** (pesan tampil instan 0ms saat room dibuka), **Write-Through Cache** di 6 titik mutasi data, anti-regression status guard tanda terima, continuous readability (pesan lama tetap terbaca meski lawan bicara me-reset perangkat & ganti keypair kriptografi), serta notifikasi visual perubahan kode keamanan E2EE (`security-notice` amber bubble).
  3. ✅ **Soft Tri-Color Glassmorphism Redesign & Modular Avatar Architecture (SELESAI)**: Arsitektur palet 3 warna (Soft Azure `#3b82f6`, Soft Lavender `#818cf8`, Soft Coral `#f472b6`), generator avatar deterministik modular (`avatarColor.ts`), penajaman kontras mobile WCAG (Slate Frosted Glass bubble dan dark glass quote reply).
  4. ✅ **Ultra-Modern Aurora Glassmorphism Header (SELESAI)**: Ambient radial mesh lighting Soft Azure & Soft Lavender di balik frosted glass transparan, avatar profil pengguna terintegrasi langsung di baris brand header atas untuk efisiensi vertikal seluler.
  5. ✅ **Modular Emoji Picker & Flagship Precision Chat Input Bar (SELESAI)**: Katalog emoji modular di `frontend/lib/emojis.ts` (5 kategori Unicode native), Frosted Glass Emoji Picker Tray popover, kapsul pil input presisi (`border-radius: 24px`, tinggi 48px), dan tombol aksi floating circular terpisah standar WhatsApp & Telegram.
  6. ✅ **High-Contrast SVG Read Receipt & Electric Neon Cyan Glow Engine (SELESAI)**: Komponen vektor SVG (`ReceiptIcon.tsx`) standar WhatsApp/Telegram (`stroke-width: 2`, sudut paralel 45°), warna Electric Neon Cyan (`#00f2fe`) dengan dual-filter dark drop shadow (`rgba(0, 0, 0, 0.95)`) + pendaran neon untuk kontras tajam di atas bubble pesan biru.
  7. ✅ **Browser History Stack & Mobile Back Navigation Hardening (v0.1.1 / SW v1.0.6) (SELESAI)**: Eliminasi duplikasi entry history (`window.history.pushState` + `router.push`), transisi bersih ke home via `router.replace('/chat')`, mencegah loop siklikal pada tombol Back browser & HP, serta rilis Frontend v0.1.1 & Service Worker v1.0.6.
  8. ✅ **Interactive Profile Studio, Verified Badge & Unified Real-Time Avatar Engine (SELESAI)**: Redesain modal profil bertab modern (Profil, Media & Cache, Keamanan), Avatar Studio interaktif (`AvatarStudio.tsx`) dengan 3 jalur avatar (foto asli dengan WebP compressor, 3D preset emoji, pembuat inisial warna), Verified Badge centang biru (`VerifiedBadge.tsx`) di seluruh aplikasi, komponen terpadu `UserAvatar.tsx`, integrasi penuh backend Go SQL query `peer_avatar_url` dan kolom `is_verified` / `peer_is_verified` (`user_store.go`), auto-migration non-destruktif di `sql.go`, proteksi **Anti-Stale History Overwrite** (mencegah penimpaan nama kontak oleh rekaman pesan masa lalu), dan resolusi **Offline Contact Profile** berbasis UUID (`StatusBar.tsx`).
  9. ✅ **Security Hardening Registration & Anti-Impersonation Filter (SELESAI)**: Modular validator (`auth/validator.go`), hybrid filter kata terlarang 3 lapis (substring/brand-prefix/exact), body cap 64KB Anti-DoS, Fail-Closed BOLA guard, JWT runtime warning. Deployed ke Fly.io production.
   10. ✅ **Milestone 8.7: UUID-First Identity Architecture Migration — Full-Stack (SELESAI)**: Standardisasi mutlak `users.id` (UUID) sebagai primary identifier di seluruh alur sistem (Backend `MessageStore`, validasi kepemilikan *Delete for Everyone*, penyimpanan reaksi emoji, filter receipts, otorisasi broadcast WebSocket, dan penentuan pesan lawan bicara di timeline). Menjamin integritas data dan hak akses tetap 100% konsisten meskipun pengguna mengganti `display_name` atau `username`. Merged ke `main` & deployed ke Fly.io.
  11. ✅ **Bugfix — Normalisasi Kontrak Payload Delete for Everyone (SELESAI)**: Perbaikan bug kritis di mana pesan yang dihapus dengan opsi "Hapus untuk Semua Orang" masih terlihat oleh lawan bicara. Root cause: mismatch JSON key antara frontend (`"type": "for_everyone"`) dan backend Go struct (`delete_for_everyone: bool`). Backend kini menerima format dual fleksibel; frontend mengirim kedua field secara redundan. Test suite 4 skenario ditambahkan. Deployed ke Fly.io & merged ke `main`.
  12. ✅ **Milestone 8.2A: Group Chat Engine — Core Foundation (SELESAI)**: Percakapan multi-user (`conversations` & `conversation_members` tables), 9 REST endpoints grup, multicast WebSocket broadcast, role RBAC Admin/Member, modal buat grup (`CreateGroupModal.tsx`), `GroupInfoDrawer.tsx`, deterministic sender color di `MessageBubble.tsx`, identitas unik `grp_<UUIDv4>`, toggle publik/privat + `group_username` untuk public discovery, `parent_id` reserved untuk sub-grup, arsitektur media grup berbasis Shared Media Hub TTL 7 hari di server + IndexedDB client auto-caching, semantik tanda terima room (`sent`/`delivered`), dan audit UI Aurora Glassmorphic.
   13. ✅ **Milestone 8.2B: Ephemeral Sub-Groups, TTL Lifecycle & Access Control Engine (SELESAI)**: Mini ruang diskusi bertopik di dalam grup induk dengan identitas unik `sub_<UUIDv4>` dan TTL otomatis (default 1 minggu `"7_days"`, opsi 1 bulan `"30_days"`). Dilengkapi **Strict Parent-Membership Gate** (fail-closed HTTP 403 / WS rejection bagi non-member grup induk), **Sub-Group Access Control** (🌐 Terbuka dengan self-join langsung vs 🔒 Privat yang mewajibkan izin admin atau undangan), penemuan transparan (*all active sub-groups remain visible*), sistem antrean izin bergabung (`conversation_join_requests` table dengan indeks unik anti-spam), pembersihan otomatis data izin saat subgrup kedaluwarsa (`ExpireSubGroupsBatch` auto-purge), background daemon `SubGroupTTLWorker` (15m ticker) dengan batch expiration atomic, fail-closed read-only lock saat kedaluwarsa (WS block & UI input disabled), kesiapan AI Summary masa depan (`status` & `ai_summary`), penegakan identitas immutable murni UUID (DEC-008), dan antarmuka Aurora Glassmorphic (`SubGroupListDrawer.tsx` dengan badge status dan panel review admin, `CreateSubGroupModal.tsx` dengan toggle hak akses, tombol status bar & drawer grup).
  14. ⏳ **Milestone 8.2C: Bad Words Sensor Filter**: Sistem sensor kata-kata terlarang di pesan grup dan DM.
  15. ⏳ **Milestone 8.3: Message Management Suite (NEXT)**: Edit pesan (15 menit), forward pesan multi-kontak, pin chat & pin message, starred message, dan in-chat search.

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
   - Jika user meminta "update dokumentasi" atau saat menyelesaikan fitur/perubahan skema, AI **WAJIB melakukan 360-degree audit ke SEMUA dokumen**: [`README.md`](README.md), [`docs/BACKEND_API.md`](docs/BACKEND_API.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/PROGRESS.md`](docs/PROGRESS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SECURITY_AND_PERFORMANCE.md`](docs/SECURITY_AND_PERFORMANCE.md), [`docs/MOBILE_INTEGRATION_GUIDE.md`](docs/MOBILE_INTEGRATION_GUIDE.md), dan [`PROMPT.md`](PROMPT.md). Dilarang hanya mengaudit sebagian dokumen.
8. **Aturan Ketahanan Server Lambat & Jaringan Flaky (SOP)**:
   - AI **WAJIB selalu bekerja dengan asumsi bahwa server berada dalam kondisi lambat (medium-slow response, latensi 200–800ms+), sering terputus, atau mengalami timeout**. Dilarang mengasumsikan kondisi ideal/instan.
   - Setiap fitur wajib mengantisipasi kegagalan jaringan: State Gatekeeper di handshake HTTP WebSocket (status 403 untuk perangkat usang), jeda flush minimal 500ms + timeout 1000ms pada event pemutusan sesi, Optimistic UI + Write-Through IndexedDB cache, batas waktu terkelola (`AbortController` 15 detik untuk query / 60 detik untuk media upload), exponential backoff dengan terminal close code 4001, dan proteksi disabled button / loading state seketika untuk mencegah race condition klik ganda.

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
