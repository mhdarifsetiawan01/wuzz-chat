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
3. 🗺️ **[`docs/ROADMAP.md`](docs/ROADMAP.md)**: Master roadmap versi 2.0 (Dual-Track: Fitur Produk Fase 1–11 & Track Modular Monolith DDD Engine).
4. 🏛️ **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**: Spesifikasi desain database (ERD), skema tabel, dan protokol WebSocket.
5. 🏛️ **[`docs/MODULAR_MONOLITH_DDD.md`](docs/MODULAR_MONOLITH_DDD.md)**: Cetak biru arsitektur Modular Monolith & DDD Engine (3-Tier Layering, boundary pemisahan 9 domain, dan roadmap eksekusi engine).
6. 🔍 **[`docs/ARCHITECTURE_AUDIT.md`](docs/ARCHITECTURE_AUDIT.md)**: Cetak biru evolusi identitas, multi-device, session registry, token revocation, dan passkey readiness.
7. 🧠 **[`docs/GROUP_MEMORY_AI_SPEC.md`](docs/GROUP_MEMORY_AI_SPEC.md)**: Spesifikasi lengkap engine Group Memory AI (pipeline M1–M7, SKIP LOCKED queue, human validation).
8. 📱 **[`docs/MOBILE_INTEGRATION_GUIDE.md`](docs/MOBILE_INTEGRATION_GUIDE.md)**: Panduan integrasi teknis klien mobile native (Kotlin, Swift) & cross-platform (Flutter, React Native).
9. 📄 **[`docs/PROGRESS.md`](docs/PROGRESS.md)**: Riwayat kemajuan tugas dan catatan handover setiap fase.
10. 🎨 **[`frontend/DESIGN.md`](frontend/DESIGN.md)**: Standar design system resmi (token-first `:root`, unified z-index scale, modal primitives, utility CSS classes, dan aturan dynamic-only inline styles).

---

## ⚙️ 3. Arsitektur Teknis & Tech Stack

| Layer | Teknologi | Catatan Implementasi |
|---|---|---|
| **Backend** | Go (Golang 1.26+) | Modular Monolith (Dedicated `SQLGroupStore` & `SQLUserStore`), `gorilla/websocket`, `golang-jwt/jwt/v5`, `bcrypt`, `lib/pq` (PostgreSQL), `modernc.org/sqlite` (WAL Mode & Busy Timeout 5s) |
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript | Vanilla CSS Design System, Auth Context (`useAuth`), WebSocket Client (`ws-client.ts`), 2-Kolom Layout & Mobile Single-Screen Flow |
| **AI Engine** | Multi-Vendor AI Provider Interface (Gemini, OpenAI, Ollama) | Group Memory AI Worker via PostgreSQL `FOR UPDATE SKIP LOCKED`, prompt synthesizer & evidence extraction |
| **Proxy Layer** | Custom Node.js Server (`server.js`) | Menangani HTTP upgrade `/ws` dan me-reverse proxy `/api/*` ke Go Backend (`http://localhost:8080`) |
| **Database** | PostgreSQL (Supabase Pooler) / SQLite | Skema terisolasi: `users`, `user_credentials`, `sessions`, `devices`, `conversations`, `messages`, `forum_memory_*`, dengan auto-migration non-destruktif |
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
- ✅ **Fase 8: Core Parity (Push Notifications, Group Chat & Message Management) (SELESAI)** —
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
  12. ✅ **Milestone 8.2A: Group Chat Engine — Core Foundation (SELESAI)**: Percakapan multi-user (`conversations` & `conversation_members` tables), 9 REST endpoints grup, multicast WebSocket broadcast, role RBAC Admin/Member, modal buat grup (`CreateGroupModal.tsx`), `GroupInfoDrawer.tsx`, deterministic sender color di `MessageBubble.tsx`, identitas unik `grp_<UUIDv4>`, toggle publik/privat + `group_username` untuk public discovery, Mode Pratinjau Konfirmasi Grup Publik (`GroupPreviewModal.tsx`, DEC-012) untuk mengeliminasi *accidental auto-join*, Gerbang Otorisasi Tautan Grup Privat (`privateGroupDenied` & Aurora Glassmorphism Shield, DEC-013) yang memblokir akses direct link non-anggota, `parent_id` reserved untuk sub-grup, arsitektur media grup berbasis Shared Media Hub TTL 7 hari di server + IndexedDB client auto-caching, semantik tanda terima room (`sent`/`delivered`), dan audit UI Aurora Glassmorphic.
  13. ✅ **Milestone 8.2B: Ephemeral Sub-Groups, TTL Lifecycle & Access Control Engine (SELESAI)**: Mini ruang diskusi bertopik di dalam grup induk dengan identitas unik `sub_<UUIDv4>` dan TTL otomatis (default 1 minggu `"7_days"`, opsi 1 bulan `"30_days"`). Dilengkapi **Strict Parent-Membership Gate & RBAC Creation Guard** (fail-closed HTTP 403 / WS rejection bagi non-member grup induk; pembuatan topik forum dibatasi ketat hanya untuk Creator dan Admin dengan tombol pembuatan di-hidden bagi anggota biasa), **Sub-Group Access Control** (🌐 Terbuka dengan self-join langsung vs 🔒 Privat yang mewajibkan izin admin atau undangan), penemuan transparan (*all active sub-groups remain visible*), sistem antrean izin bergabung (`conversation_join_requests` table dengan indeks unik anti-spam), pembersihan otomatis data izin saat subgrup kedaluwarsa (`ExpireSubGroupsBatch` auto-purge), background daemon `SubGroupTTLWorker` (15m ticker) dengan batch expiration atomic, fail-closed read-only lock saat kedaluwarsa (WS block & UI input disabled), kesiapan AI Summary masa depan (`status` & `ai_summary`), penegakan identitas immutable murni UUID (DEC-008), dan antarmuka Aurora Glassmorphic (`SubGroupListDrawer.tsx` dengan badge status dan panel review admin, `CreateSubGroupModal.tsx` dengan toggle hak akses, tombol status bar & drawer grup).
  14. ✅ **Milestone 8.2C: Forum Rebranding & Mobile Header Redesign (SELESAI)**: Rebranding resmi istilah subgrup menjadi **"Forum & Topik Diskusi"** (mengikuti standar Telegram Forums & Topics), tombol akses cepat `🏛️ Forum` di luar, breadcrumb interaktif di subtitle obrolan (`↖ [Grup Induk] • Forum • X anggota`), ruang judul obrolan 3x lebih lapang tanpa terpotong, dan Collapsible Action Menu (`⋮`) di mobile untuk menyembunyikan icon sekunder dengan animasi halus dan auto-close.
  15. ✅ **Milestone 8.2D: Shared Media Hub for Group Chats & Forum Topics (SELESAI)**: Perbaikan isu media kedaluwarsa dini di obrolan grup dan forum topik. Panggilan ACK unduhan (`POST /api/media/ack`) dari salah satu anggota tidak lagi menghapus berkas dari Supabase Storage dan tidak mengubah status pesan menjadi `'expired'`. Berkas dipertahankan di server selama masa retensi TTL (7 hari) dan dibersihkan oleh goroutine `PurgeWorker`, sementara direct message (1-on-1) tetap menggunakan arsitektur *Store-and-Forward* instan ($0 server storage cost). Dilindungi unit test suite 100% PASS, merged ke `main`, dan deployed ke Fly.io.
  16. ✅ **Milestone 8.5: Group & Subgroup Multi-User Mention Engine (@username) (SELESAI)**: Fitur mention multi-user terarah di obrolan grup dan forum/subgrup dengan isolasi keanggotaan ketat (hanya member grup jika di grup, hanya member subgrup jika di subgrup), penegakan data kekal murni UUID (`mentions: ["UUID", ...]`), popover autocomplete Aurora Glassmorphic (keyboard navigation & tap-friendly mobile min 44px), tag highlight `@username` di bubble pesan, highlight khusus self-mention (`.mention-tag-self` dan border cyan), validasi keanggotaan fail-closed di backend Go WebSocket Hub, dan Web Push prioritas bertag `chat-mention-[room]`. Dilindungi test suite 100% PASS backend & frontend.
  17. ✅ **Milestone 8.8: Realtime Engine Scalability & High-ROI Optimizations (SELESAI)**: Core Fanout Optimization $O(M)$ berbasis in-memory membership cache `roomMembersCache` di WebSocket Hub Go (menggantikan scan linier $O(N)$ ke seluruh `h.clients` dan mengeliminasi query SQL `GetConversationMemberUsernames` berulang saat broadcast), sliding-window typing rate limiter (3 event per 2 detik per koneksi) di `onTyping()`, Delta Offline History Sync dengan checkpoint timestamp `since` (`GetRoomHistorySince`) yang menghemat transmisi riwayat hingga 90%, serta FIFO `outboundQueue` (maks 100 pesan) di `WsClient` yang menahan pesan saat socket terputus dan mem-flush otomatis saat koneksi pulih. Dilindungi test suite `scalability_optimizations_test.go` (100% PASS).
  18. ✅ **Milestone 8.9: Mobile-Ready Reliability (Request ID + ACK Protocol & Server-Side In-Memory Idempotency) (SELESAI)**: Standardisasi `request_id` pada payload klien dan event `ack` deterministik dari server, eliminasi `outboundQueue.shift()` prematur pada klien PWA/mobile (antrean hanya dibersihkan setelah menerima `ack` atau `receipt`), proteksi deduplikasi pesan server berbasis in-memory TTL 2 menit (`IsDuplicateAndRecord`) dengan presisi nanodetik (`UnixNano`), dan eliminasi siaran duplikat ke anggota room / Redis saat klien seluler melakukan transmisi ulang pesan.
  19. ✅ **Milestone 8.3: Message Management Suite (SELESAI)**: Edit pesan dalam batas 15 menit (`PUT /api/messages/edit`), forward pesan multi-kontak (1–5 room target, `POST /api/messages/forward`, lencana `↪ Diteruskan`), pin chat sidebar per-user (`POST /api/conversations/pin` & `/unpin`), pin pesan dalam obrolan (maks 3 pin per room, FIFO auto-unpin, `POST /api/messages/pin`, `POST /api/messages/unpin`, `GET /api/messages/pinned`, WebSocket event `message_pinned` & `message_unpinned`, banner `PinnedMessageBanner.tsx`, jump-to-message dengan pendaran emas), dan in-chat text search (`GET /api/messages/search`, bar pencarian `StatusBar.tsx`, counter badge, tombol navigasi Atas/Bawah, dan scroll highlight biru). Dilindungi test suite Go komprehensif (100% PASS).
  20. ✅ **Design Debt Batch #3–#7: Token Lengkap, Utility CSS, Unified Modal & DESIGN.md (SELESAI)**: +53 token baru di `:root` (`--color-verified`, `--text-on-accent`, `--color-cyan-neon`, 10× tint aksen, 5× tint error, palet `--wa-*`, 5 dangling var fix, z-index scale `--z-*`); codemod 20 file; `zIndex: 99999` → 0; 120+ utility class (`u-flex`, `u-gap-*`, `u-text-*`, `btn-ghost`); unified modal primitives (`.modal-overlay`, `.modal-card-unified`, dll) menggantikan 26 kelas dari 3 keluarga CSS; `frontend/DESIGN.md` [NEW] sebagai single source of truth design system (173 baris). Build gate PASS 3×.
  21. ✅ **Milestone 8.10: Backend Logout Endpoint, Device-Aware Session Release & Consolidated Encrypted Banner (SELESAI)**: Penambahan endpoint `POST /api/auth/logout` yang merilis/mengosongkan `active_device_id = ''` di database server secara kondisional (*device-aware*) saat logout sukarela (mengeliminasi false conflict HTTP 409 saat login di device baru); proteksi pembatalan konflik (*local-only cancellation* saat *"Batalkan & Keluar"* di modal konflik tanpa menyentuh server); penggantian deretan puluhan bubble `🔒 [Pesan Terenkripsi]` dengan **1 buah banner sistem ringkas** di linimasa chat (`ChatWindow.tsx`); serta optimasi performa single-pass loop $O(N)$ berbasis `useMemo` saat rendering pesan.
  22. ✅ **Milestone 8.11: Anti-Infinite Reset Loop, 30s Server Timeout & Loading Logout UI (SELESAI)**: Memutus siklus ping-pong reset tak berujung antara dua perangkat saat konflik rotasi kunci dengan menerapkan *Synchronous 0ms Local-First Purge* (penghapusan token & profil di `localStorage` dan state React seketika di baris pertama `logout()`), batas waktu jaringan terkelola 30 detik (`AbortController`), status loading (`isLoggingOut`) & tombol disabled dengan label `⏳ Memproses Keluar...` pada modal konflik dan profil, serta proteksi route guard `/login?logout=1` yang memblokir auto-redirect ke `/chat` dan memaksa input kredensial baru.
  23. ✅ **Milestone 8.12: Anti-Stale History Poisoning & `replaceState` Logout URL Sanitizer (SELESAI)**: Mencegah auto-logout tak sengaja saat pengguna menekan tombol *Back* browser setelah login kembali. Menempatkan auth validation di prioritas pertama `useEffect` `/login` untuk langsung memantulkan (*bounce back*) pengguna aktif ke `/chat`, membersihkan parameter `?logout=1` secara instan dari address bar via `window.history.replaceState`, dan menggunakan `router.replace()` / `window.location.replace()` di seluruh alur login/logout.
  24. ✅ **Milestone 8.13: Direct WebSocket Kick on E2EE Key Transfer & Modal Hierarchy Hardening (SELESAI)**: Menendang koneksi WebSocket perangkat lama seketika saat `POST /api/users/transfer/consume` berhasil (`KickClientByUserID` dengan 500ms grace period & Close Code 4001 `SESSION_REPLACED`), mengikat CustomEvent `wuzz:session_replaced` pada `DeviceTransferModal` dan `ProfileModal`, menampilkan kartu transisi sukses & auto-dismiss 1.2 detik. Dilindungi unit test Go & frontend build (100% PASS).
  25. ✅ **Milestone 8.14: Root-Level React Portal Architecture & Z-Index Modal Stacking Hardening (SELESAI)**: Membungkus seluruh modal (ProfileModal, ContactProfileModal, DeviceConflictModal, DeviceTransferModal, CreateGroupModal, GroupPreviewModal, MemberListModal, confirmDeleteConv) dengan `createPortal(..., document.body)` dari `react-dom` untuk membebaskan modal dari stacking context / containing block jebakan `.chat-sidebar` & `.status-bar` (`backdrop-filter: blur`), mengoreksi bug tombol `✕` profil desktop yang tertutup chat pane, serta menyelaraskan z-index hierarki (`var(--z-modal)` 1000 untuk modal dasar, `var(--z-modal-top)` 1100 untuk modal anak DeviceTransferModal) sehingga tombol *"Pindah Kunci via QR / Kode"* di modal konflik perangkat PWA HP tampil normal di lapisan teratas. Dilindungi build Next.js & test Go (100% PASS).
  26. ✅ **Post-Milestone 8: Multi-Node WebSocket Cluster Session Kick via Redis Pub/Sub (SELESAI)**: Sinkronisasi pemutusan koneksi WebSocket (`session_kick` dan `device_kick`) lintas instance multi-node Fly.io. `KickClientByUserID` dan `KickClientByDeviceID` mengeksekusi penutupan soket lokal sekaligus mem-broadcast `ClusterEvent` ke channel Redis `wuzz:cluster:events`. Listener `SetBroker` di node lain langsung menendang soket target dengan Close Code 4001 (`SESSION_REPLACED` / `DEVICE_KICKED`) tanpa duplicate echo loop. Dilindungi unit test suite `hub_cross_instance_kick_test.go` (100% PASS).
- ✅ **Fase 9: Monetisasi & Trust — Avatar Premium & Verified Account System (Core Engine SELESAI ✅ | Marketplace 🔮)** —
  1. ✅ **Milestone 9.1: User Verified Account System (SELESAI)**: Kolom `is_verified` di tabel `users` (Postgres & SQLite), struct field `IsVerified` & `PeerIsVerified` di backend Go `user_store.go`, komponen frontend `VerifiedBadge.tsx` centang biru terintegrasi live di Sidebar, StatusBar, ContactProfileModal, dan ProfileModal.
  2. 🔮 **Milestone 9.2: Avatar Premium Asset System & Marketplace (Direncanakan)**: Tabel katalog avatar, inventori user, dan modal seleksi koleksi premium.
- ✅ **Fase 10: Group Memory AI — Forum Intelligence & Group Knowledge (SELESAI ✅)** —
  1. ✅ **Milestone M1–M7 Penuh**: Engine memori berbasis prinsip *"AI captures. Humans validate. Wuzz remembers."*.
  2. Skema 7 tabel relasional (`forum_memory_jobs`, `memory_drafts`, `memory_artifacts`, `artifact_evidences`, `approved_memories`, `memory_review_actions`, `memory_view_events`).
  3. Worker non-blocking di Go backend dengan pattern queue PostgreSQL `FOR UPDATE SKIP LOCKED`.
  4. Abstraksi interface `AIService` (Gemini & provider fallback) dengan prompt JSON terstruktur, ekstraksi bukti kutipan (*Evidence*), dan confidence scoring.
  5. REST API Review Suite & Admin Review Drawer di frontend Next.js (<30s one-click approval / artifact editor).
  6. Member Knowledge Viewer di arsip forum dan notifikasi push otomatis.
- ✅ **Fase 11: Seamless Continuity & Multi-Device Identity Architecture (Phase 0, 1, 2, 3, 5 SELESAI ✅ | Phase 4 🔮)** —
  1. ✅ **Phase 0 (Identity & Auth Hardening)**: Blacklist token JTI (`revoked_tokens`), re-auth password wajib sebelum reset kunci E2EE, dan endpoint ganti password dengan auto-revocation.
  2. ✅ **Phase 1 (Session Foundation)**: Tabel `sessions`, session inventory API (`GET /api/auth/sessions`), dan remote logout per-sesi.
  3. ✅ **Phase 2 (Device Registry & Reconnect Resilience)**: Tabel `devices`, endpoint manajemen perangkat, pencegahan false HTTP 403, dan auto-rebind atomic UPSERT.
  4. ✅ **Phase 3 (Credential Separation)**: Tabel `user_credentials`, pemisahan password dari tabel `users`, dan dual read/write non-destruktif.
  5. 🔮 **Phase 4 (Passkey / WebAuthn)**: Siap dieksekusi untuk login biometrik tanpa password (W3C WebAuthn).
  6. ✅ **Phase 5 (Multi-Device E2EE Continuity)**: Master key synchronization via transfer QR ephemeral dan multi-device session management.
- 🏛️ **Track B: Transformasi Modular Monolith & DDD Engine (Status: Fase 1, 2, 3 SELESAI ✅ | Menuju Fase 4 🎯)** —
  1. ✅ **Fase 1: Pemisahan GroupStore dari SQLUserStore (SELESAI & DEPLOYED)**: Ekstraksi `SQLGroupStore` mandiri (`sql_group_store.go`), membersihkan ketergantungan `SQLUserStore` dari domain grup, wiring terpisah di `main.go`, lulus test 100%, dan deployed ke Fly.io (`672eca6`).
  2. ✅ **Fase 2: Application Service untuk Auth & Identity (SELESAI & DEPLOYED)**: Ekstraksi `AuthService` (`authz/service.go`) untuk use cases login/register/device limits, memisahkan domain `Identity` dan `Auth`, menjadikan `auth_handler.go` sebagai *thin transport*, dan deployed ke Fly.io (`174f447`).
  3. ✅ **Fase 3: Application Service untuk Messaging & Hub Decoupling (SELESAI)**: Domain `internal/messaging/` (`entity.go`, `repository.go`, `infra/sql_repository.go`), `MessageService` (`service.go`) untuk edit, delete, forward, pin, unpin, receipt, search, get conversations, serta decoupling WebSocket Hub via interface `RoomAuthorizationChecker`.
  4. 🎯 **Fase 4: Group & Forum Service (FOKUS BERIKUTNYA)**: Ekstraksi `GroupService` & `ForumService`, migrasi `SubGroupTTLWorker`.
  5. ⏳ **Fase 5: Memory Engine Generalization (`ContextSource` Abstraction)**.
  6. ⏳ **Fase 6: Cleanup & Slim `main.go` Wiring (`wire.go`)**.

---

## 🛡️ 5. Aturan Wajib untuk AI (Mandatory Rules & Constraints)

1. **Aturan Siklus Hidup Server**:
   - Jika AI menyalakan server sementara untuk verifikasi (misal: `go run main.go` atau `npm run dev`), AI **WAJIB mematikan port tersebut (`fuser -k <port>/tcp`)** sebelum mengakhiri respons, KECUALI user meminta dibiarkan berjalan.
2. **Aturan Arsitektur Frontend Dual-Platform (Mobile & Desktop) (SOP)**:
   - Setiap modifikasi frontend (CSS, komponen React, state management, routing, event handling) **WAJIB** mempertimbangkan dan menguji kompatibilitas untuk KEDUA platform: Mobile (Handphone) dan Desktop (Laptop/PC).
   - Pastikan viewport dengan `interactiveWidget: 'resizes-content'` (bukan `pan`), sticky header, safe area padding `env(safe-area-inset-bottom)`, guard anti-stale lifecycle (`lastHandledMsgIdRef` & clean history reset), dan `window.scrollY` dikunci ke 0 via `visualViewport` listener terpenuhi.
3. **Aturan Keamanan Git, Branching, Dokumentasi & Konfirmasi Commit (SOP)**:
   - **DILARANG KERAS melakukan perubahan, modifikasi kode, atau pengerjaan tugas langsung di branch `main`.**
   - Seluruh pekerjaan wajib dilakukan di branch `dev` atau feature branch baru (`feature/...`).
   - **Langkah Verifikasi**: Setiap kali suatu task/tugas selesai, AI wajib melaporkan rincian hasil pengerjaan BESERTA hasil testing otomatis (`npm run build` & `go test -v ./...`), lalu meminta konfirmasi ke user.
   - **Gerbang Audit Dokumentasi Sebelum Commit**: Setelah user menyatakan **"selesai"**, AI **WAJIB mengecek dan mengupdate seluruh dokumentasi proyek** agar 100% mutakhir dengan kondisi terkini. Dilarang commit sebelum dokumen dipastikan sinkron.
   - **Eksekusi Commit**: Setelah dokumentasi selesai disinkronkan, barulah AI mengeksekusi `git commit` di branch `dev`.
   - **Konfirmasi Pasca-Commit (Merge / Push Gate)**: Setelah commit berhasil dilakukan, AI **WAJIB mengonfirmasi pilihan promosi kepada user**:
     - *Opsi A*: Merge ke branch `main` dan langsung push ke GitHub (`git push origin main`).
     - *Opsi B*: Hanya merge ke branch `main` saja secara lokal (tanpa push ke remote).
     - *Opsi C*: Tetap di branch `dev` saja (tidak perlu merge atau push saat ini).
   - **DILARANG KERAS melakukan `git push`** atau merge ke `main` tanpa pilihan/instruksi tertulis terpisah dari user. Khususnya, **jangan pernah push `dev` ke remote** kecuali diminta secara eksplisit.
4. **Aturan Keamanan Database**:
   - Dilarang menjalankan query destruktif (`DROP TABLE`, `DROP DATABASE`, `TRUNCATE`) tanpa konfirmasi tertulis eksplisit dari pengguna.
5. **Aturan Peringatan & Konfirmasi Deployment Backend (SOP)**:
   - Setiap ada modifikasi kode pada direktori `backend/`, AI **WAJIB** memberikan peringatan dan konfirmasi eksplisit kepada user bahwa server live di Fly.io perlu dideploy ulang (`fly deploy --remote-only`) demi mencegah desinkronisasi protokol/query dengan frontend live.
6. **Kualitas Kode & Testing Otomatis Pasca-Tugas (No Live Browser Required)**:
   - Setiap kali menyelesaikan tugas, AI **WAJIB SELALU melakukan testing otomatis** terlebih dahulu:
     - Frontend: `npm run build` (lulus kompilasi Next.js/Turbopack dan 0 error TypeScript/lint).
     - Backend: `go test -v ./...` (seluruh suite test backend 100% PASS).
   - **TIDAK PERLU live browser testing** (cukup buktikan kebenaran implementasi via automated build & automated test suite).
   - AI wajib menyertakan ringkasan hasil tugas beserta bukti hasil testing tersebut dalam laporannya sebelum meminta konfirmasi selesai.
7. **Aturan Audit & Sinkronisasi Dokumentasi Holistik (SOP)**:
   - Jika user meminta "update dokumentasi" atau saat menyelesaikan fitur/perubahan skema, AI **WAJIB melakukan 360-degree audit ke SEMUA dokumen**: [`README.md`](README.md), [`docs/BACKEND_API.md`](docs/BACKEND_API.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/PROGRESS.md`](docs/PROGRESS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SECURITY_AND_PERFORMANCE.md`](docs/SECURITY_AND_PERFORMANCE.md), [`docs/MOBILE_INTEGRATION_GUIDE.md`](docs/MOBILE_INTEGRATION_GUIDE.md), dan [`PROMPT.md`](PROMPT.md). Dilarang hanya mengaudit sebagian dokumen.
8. **Aturan Ketahanan Server Lambat & Jaringan Flaky (SOP)**:
   - AI **WAJIB selalu bekerja dengan asumsi bahwa server berada dalam kondisi lambat (medium-slow response, latensi 200–800ms+), sering terputus, atau mengalami timeout**. Dilarang mengasumsikan kondisi ideal/instan.
   - Setiap fitur wajib mengantisipasi kegagalan jaringan: State Gatekeeper di handshake HTTP WebSocket (status 403 untuk perangkat usang), jeda flush minimal 500ms + timeout 1000ms pada event pemutusan sesi, Optimistic UI + Write-Through IndexedDB cache, batas waktu terkelola (`AbortController` 15 detik untuk query / 60 detik untuk media upload), exponential backoff dengan terminal close code 4001, dan proteksi disabled button / loading state seketika untuk mencegah race condition klik ganda.
9. **Aturan Kepatuhan Design System & Token-First (SOP)**:
   - Setiap modifikasi UI/UX frontend **WAJIB mematuhi token `:root` di `frontend/app/globals.css` dan panduan `frontend/DESIGN.md`**.
   - **Dilarang keras menggunakan raw hex** (gunakan `var(--token)`), **dilarang literal rgba tint** (gunakan `var(--tint-accent-*)` / `var(--tint-error-*)`), **dilarang magic z-index** (terutama `99999`, wajib pakai `var(--z-modal)` / `var(--z-modal-top)`), **wajib pakai unified modal primitives** (`.modal-overlay` + `.modal-card-unified`), dan inline styles **hanya untuk nilai dinamis runtime**.

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
