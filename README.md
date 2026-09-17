# 💬 Wuzz Chat — Real-Time WebSocket Chat Monorepo

Wuzz Chat adalah aplikasi chat real-time 1-on-1 berbasis WebSocket dengan arsitektur monorepo yang dirancang untuk kemudahan skalabilitas dan deployment terpisah.

---

## 🏗️ Struktur Monorepo

```text
wuzz-chat/
├── backend/                  # WebSocket & REST Backend Service (Golang 1.26)
│   ├── internal/
│   │   ├── api/              # REST Handlers (auth, chat, media upload & ack, config)
│   │   ├── auth/             # JWT helper, claims validation & RequireJWT middleware
│   │   ├── storage/          # Media Storage driver (Supabase, Local disk) & TTL PurgeWorker
│   │   ├── store/            # Data Layer (PostgreSQL Supabase, SQLite, In-Memory)
│   │   └── ws/               # WebSocket Hub, Client Pump, Message Router & Presence
│   ├── go.mod
│   ├── go.sum
│   └── main.go
│
├── frontend/                 # Web Interface (Next.js 16 + React 19 + TypeScript)
│   ├── app/
│   │   ├── chat/             # Chat UI container, Message bubbles, ReceiptIcon, AudioPlayer, VoiceRecorder, Lightbox
│   │   ├── login/            # Halaman Login
│   │   ├── register/         # Halaman Registrasi
│   │   ├── globals.css       # Dark-mode design system, dynamic waveforms & responsive CSS
│   │   ├── layout.tsx
│   │   └── page.tsx          # Landing page & anonymous nickname entry
│   ├── lib/                  # WebSocket client, API helper, MediaCache (IndexedDB), emojis (Modular), avatarColor, ImageCompressor
│   ├── server.js             # Custom server dengan WebSocket proxy & /uploads/ stream proxy
│   └── package.json
│
├── .agents/                  # Workspace configuration & lifecycle rules
├── docs/                     # Dokumentasi Arsitektur, Roadmap, dan Progress
├── PRD-websocket-chat-app.md # Dokumen spesifikasi teknis
├── PROMPT.md                 # Context primer sesi AI
└── README.md
```

---

## 📚 Dokumentasi Proyek

Untuk memahami arah, tujuan, dan detail teknis proyek, silakan baca dokumentasi berikut:

- 🔌 **[BACKEND_API.md](docs/BACKEND_API.md)** — Panduan integrasi teknis REST API, WebSocket event catalog, E2EE wire format, dan siklus hidup media untuk pengembang frontend baru.
- 🛡️ **[SECURITY_AND_PERFORMANCE.md](docs/SECURITY_AND_PERFORMANCE.md)** — Panduan komprehensif arsitektur keamanan (Anti-BOLA/IDOR, Anti-SSRF, IP Pinning) dan optimasi performa backend ($O(1)$ batch CTE query, indexing, SQLite WAL mode).
- 🗺️ **[ROADMAP.md](docs/ROADMAP.md)** — Rencana jangka panjang, milestone tahapan dari Fase 1 hingga Fase 7 (Auth, Group Chat, Rich Media, Receipts, WebRTC, Scaling).
- 🏛️ **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Spesifikasi desain database relasional (ERD), protokol WebSocket, REST API endpoints, dan Store-and-Forward media lifecycle.
- 📱 **[MOBILE_INTEGRATION_GUIDE.md](docs/MOBILE_INTEGRATION_GUIDE.md)** — Panduan teknis arsitektur & implementasi klien mobile (Kotlin Android, Swift iOS, Flutter, React Native).
- 📄 **[PROGRESS.md](docs/PROGRESS.md)** — Laporan status pengerjaan detail per fase & milestone.
- 📄 **[PRD-websocket-chat-app.md](PRD-websocket-chat-app.md)** — Dokumen spesifikasi kebutuhan produk awal.

---

## 🚀 Fitur yang Telah Selesai (Fase 1 s/d Fase 7)

- [x] **Bidirectional WebSocket Engine (Fase 1)**: Arsitektur hub Go dengan goroutine read/write pump dan graceful disconnect.
- [x] **Next.js Reverse Proxy (`server.js`) (Fase 1)**: Menangani WebSocket upgrade event pada custom server dan me-reverse proxy `/api/*` serta `/uploads/*`, mengisolasi URL backend dari browser.
- [x] **Multi-Database Flexible Store (Fase 2)**: Otomatis mendukung **Supabase PostgreSQL**, **Local Postgres**, **SQLite**, dan **In-Memory** fallback.
- [x] **Chat History Persistence (Fase 2)**: Riwayat pesan otomatis tersimpan di cloud database dan dimuat saat pengguna membuka obrolan atau me-refresh tab.
- [x] **User Identity & JWT Authentication (Fase 3)**: Pendaftaran akun dengan password hashing bcrypt, login JWT 7 hari, profil user, dan pencarian kontak instan.
- [x] **Direct Messages & 2-Kolom Layout (Fase 3)**: Obrolan 1-on-1 permanen dengan layout WhatsApp-grade, sidebar Recent Chats, dan standby welcome screen.
- [x] **Sound FX Synthesizer (Fase 4)**: Efek suara prosedural Web Audio API saat kirim/terima pesan dan reaksi tanpa file audio eksternal.
- [x] **Live Typing Indicator (Fase 4)**: Animasi typing indicator real-time saat lawan bicara sedang mengetik.
- [x] **Real-Time 3-Stage Receipts (Fase 4)**: Transisi tanda centang `🕒 Pending` ➔ `✓ Sent` (centang 1 abu) ➔ `✓✓ Delivered` (centang 2 abu saat lawan online) ➔ `✓✓ Read` (centang 2 biru saat dibaca).
- [x] **Sidebar Receipt Icons & Unread Counter (Fase 4)**: Tanda centang di depan cuplikan teks pesan terakhir pada daftar obrolan sidebar dan badge unread counter persisten.
- [x] **Emoji Reactions & Reply/Quote Message (Fase 4)**: Toolbar reaksi emoji cepat (`👍 ❤️ 😂 😮 😢 🙏`), badge interaktif, dan balasan kutipan pesan dengan fitur **Click-to-Scroll & Glow Highlight** ke pesan asli.
- [x] **Clean Anti-Spam Timeline (Fase 4)**: Linimasa pesan bersih tanpa spam status join/leave/welcome.
- [x] **Rich Media & Image Lightbox (Fase 5)**: Upload gambar (JPG, PNG, GIF, WebP), paste gambar clipboard (`Ctrl+V`), drag-and-drop file ke layar chat, dan modal Lightbox preview interaktif dengan keyboard navigation (`Esc`).
- [x] **Document & File Sharing (Fase 5)**: Berbagi file dokumen (PDF, Word, Excel, ZIP, dll.) dengan kartu lampiran terformat, badge ekstensi berwarna, ukuran berkas dinamis, dan tombol unduh instan.
- [x] **Voice Note Recording & Waveform Player (Fase 5)**: Perekaman suara langsung via `MediaRecorder` API dengan timer live, animasi gelombang suara, dan pemutar audio kustom bergaya WhatsApp/Telegram (dynamic waveform scrubber, Play/Pause, speed toggle `1x`/`1.5x`/`2x`, single-active player).
- [x] **WhatsApp-Style Store-and-Forward Media Lifecycle ($0 Server Cost) (Fase 5)**: File di server hanya berfungsi sebagai transit buffer dan otomatis dihapus saat penerima mengunduh berkas (`POST /api/media/ack`).
- [x] **Background TTL Auto-Purge Worker (Fase 5)**: Goroutine pembersih berkas kedaluwarsa yang belum diunduh melebihi `MEDIA_RETENTION_DAYS` (default 7 hari).
- [x] **Client-Side Offline Caching (`IndexedDB`) (Fase 5)**: Berkas media tersimpan di IndexedDB browser klien sehingga pengguna tetap bisa membuka media secara offline meskipun file di server telah dihapus.
- [x] **Client-Side Pre-Upload Image Compressor (Fase 5)**: Kompresi otomatis gambar sebelum diunggah (resize max 1600px, WebP quality 0.82) untuk menghemat kuota dan mempercepat transmisi, dengan tombol toggle on/off di modal Profil.
- [x] **Redis Pub/Sub Layer & Multi-Instance Synchronization (Fase 6)**: Sinkronisasi real-time antar multi-instance Go WebSocket via Upstash Redis (`rediss://...`) dengan anti-echo loop UUID & deduplikasi database write.
- [x] **Dynamic Multi-Origin CORS & WebSocket Whitelist (Fase 6)**: Konfigurasi whitelist dinamis (`*`, exact domain, dan wildcard subdomains seperti `https://*.vercel.app`) untuk REST API dan WebSocket handshake.
- [x] **OpenGraph Rich Link Previewer (Fase 6)**: Ekstraksi metadata URL OpenGraph dengan proteksi Anti-SSRF (blokir IP privat), Redis caching 24 jam, dan komponen kartu thumbnail interaktif.
- [x] **Live Production Backend di Fly.io (Fase 6)**: Container Docker Go Alpine super ringan (< 25MB) aktif di region Singapore (`sin`).
- [x] **Dual-Platform Architecture (Desktop & WhatsApp Mobile Single-Screen)**: Tampilan desktop split 2-kolom dan mobile single-screen flow (Daftar Chat Fullscreen ⇄ Ruang Obrolan Fullscreen dengan tombol `← Back`), Dynamic Viewport `100dvh`, sticky header, safe area padding `env(safe-area-inset-bottom)`, dan sinkronisasi tanda terima `✓✓` biru serta unread counter instan 0ms.
- [x] **End-to-End Encryption (E2EE) (Fase 7)**: Kriptografi standar terbuka (**ECDH NIST P-256 + HKDF-SHA256 + AES-256-GCM**) via Web Crypto API, penyimpanan private key di `IndexedDB` (`wuzz_crypto_db`), verifikasi nomor keamanan 30-digit (*Safety Number Fingerprint*), auto-decryption reaktif pada timeline obrolan dan cuplikan pesan di sidebar, serta zero-knowledge storage pada server database.
- [x] **E2EE Single Active Device & Key Conflict Guard (Fase 7 Milestone 7.5 & 7.7)**: Pelacakan `active_device_id` & `key_version` di database, proteksi HTTP 409 Conflict rejection, rotasi kunci resmi `/api/users/public-key/reset`, **Hard Blocker UI** yang mengunci layar chat secara total saat terjadi konflik, tombol back HP auto-logout, **Single-Session WebSocket Kick** pada backend Go (`SESSION_REPLACED`), dan **Fail-Closed E2EE Guard** untuk menjamin 0% kebocoran plaintext pada direct chat.
- [x] **E2EE Device Migration via QR Code (Fase 7 Milestone 7.6 & 7.7 / Opsi 2)**: Fitur pemindahan keypair E2EE antar perangkat secara Zero-Knowledge menggunakan QR code ephemeral dengan TTL 5 menit (`POST /api/users/transfer/create` & `POST /api/users/transfer/consume`), enkripsi AES-256-GCM berdasar 256-bit entropy PBKDF2, retrieval atomik 1x pakai di database, komponen `DeviceTransferModal.tsx` dengan **In-App Camera Scanner (`html5-qrcode`)** langsung dari web app, smart tab filtering (`hideGenerate=true`) di perangkat baru, fallback kode manual, serta halaman deep link `/transfer?token=...`.
- [x] **1-on-1 Voice / Audio Calling via WebRTC P2P (Fase 7 Milestone 7.2A)**: Panggilan suara real-time antar pengguna dengan backend WebSocket signaling hub, koneksi peer-to-peer latensi rendah dengan STUN + OpenRelay TURN fallback, Web Audio API procedural ringtones, overlay panggilan aktif dengan live timer dan microphone mute, serta modal panggilan masuk interaktif.
- [x] **Universal Push Notification Engine & PWA Install (Fase 8 Milestone 8.1)**: Notifikasi sistem instan di Desktop dan HP Android saat aplikasi ditutup/background via W3C Web Push (VAPID RFC 8292), Service Worker (`sw.js`) dengan **Zero-Knowledge Client-Side Background Decryption** (Web Crypto API + IndexedDB) sehingga teks pesan E2EE tampil terdekripsi di notifikasi OS, toggle notifikasi di modal profil, tombol Header **"📲 Instal App"** dengan auto-hide di mode Standalone, dan arsitektur Multi-Platform Gateway (Web, PWA & Android FCM ready).
- [x] **IndexedDB Message Cache & E2EE Continuity (Fase 8 Milestone 8.4)**: Penyimpanan pesan terdekripsi lokal di browser klien via IndexedDB (`wuzzchat_msg_db`), arsitektur **Cache-First Load** (0ms saat membuka room), **Write-Through Cache** di 6 titik mutasi, perlindungan status tanda terima anti-downgrade, kontinuitas pembacaan pesan lama saat lawan bicara me-reset perangkat & mengganti pasangan kunci kriptografi, serta notifikasi visual pergantian kode keamanan E2EE (`security-notice` amber bubble).
- [x] **Contact Search Persistence & Instant Filter**: Pencarian kontak cepat dengan debounce 300ms, pemisahan state loading API dengan visibilitas hasil pencarian, dan reset filter yang bersih.
- [x] **PWA Android Camera Workaround (Fase 7 DeviceTransfer)**: Tombol **\"📷 Foto via Kamera Native\"** (`<input capture="environment">`) sebagai fallback solid untuk scan QR Code di Android PWA, Pre-Warm `getUserMedia` Permission Strategy, dan deklarasi `"permissions": ["camera"]` di `manifest.json` untuk instalasi WebAPK.
- [x] **Mobile Viewport Stability Fix (Post-Device Transfer)**: Mengunci `.chat-app-container` pada mobile dengan `position: fixed` dan `overscroll-behavior: none`, mengganti `scrollIntoView` dengan `containerRef.scrollTo` di ChatWindow, serta reset `window.scrollTo(0,0)` saat transisi room agar tampilan chat tidak naik ke atas setelah penutupan modal transfer.
- [x] **Android Virtual Keyboard Header Fix**: Viewport metadata `interactiveWidget: 'resizes-content'` memastikan layout di-resize (bukan di-pan) saat keyboard virtual muncul. Listener `visualViewport` di `page.tsx` mengunci `window.scrollY` ke 0 agar header chat tidak pernah tergeser keluar viewport.
- [x] **Soft Tri-Color Glassmorphism Redesign & Modular Avatar Architecture**: Redesain visual berkelas dengan kombinasi 3 warna harmonis (Soft Azure `#3b82f6` utama, Soft Lavender `#818cf8` sekunder, Soft Coral `#f472b6` tersier), utilitas avatar modular deterministik (`avatarColor.ts`) dengan 8 variasi warna pastel bergradien, Slate Frosted Glass pada bubble pesan masuk, penajaman kontras timestamp putih terang & read receipts Electric Cyan, dan ambient depth pada linimasa chat.
- [x] **Ultra-Modern Aurora Glassmorphism Header**: Ambient radial mesh lighting Soft Azure & Soft Lavender di balik frosted glass transparan, avatar profil pengguna terintegrasi langsung di baris brand header atas untuk efisiensi ruang vertikal seluler, dan emblem logo kilat futuristik.
- [x] **Modular Emoji Picker & Flagship Precision Chat Input Bar**: Katalog emoji modular di `frontend/lib/emojis.ts` dengan 5 kategori Unicode native, Frosted Glass Emoji Picker Tray popover, kapsul pil input presisi (`border-radius: 24px`, tinggi 48px) dengan tombol aksi rekam suara / kirim melayang independen (*floating circular button 48x48px*) mandiri standar WhatsApp & Telegram.
- [x] **High-Contrast SVG Read Receipt & Electric Neon Cyan Glow Engine (`ReceiptIcon.tsx`)**: Komponen vektor SVG standar WhatsApp/Telegram (`stroke-width: 2`, sudut paralel 45°) menggantikan karakter teks unicode tipis, dipadukan dengan warna Electric Neon Cyan (`#00f2fe`) dan dual-filter dark drop shadow (`rgba(0, 0, 0, 0.95)`) + pendaran neon untuk kontras tajam di atas bubble pesan keluar biru.
- [x] **Browser History Stack & Mobile Back Navigation Hardening**: Mengeliminasi duplikasi entry browser history (`window.history.pushState` ganda) pada navigasi room di Next.js App Router, menerapkan transisi `router.replace('/chat')` saat kembali ke home, dan memastikan tombol Back pada browser HP/Desktop keluar dari linimasa dengan bersih tanpa berputar-putar dalam history loop.
- [x] **Security Hardening Registration & Anti-Impersonation Filter**: Modul validator terpusat (`auth/validator.go`) dengan filter kata terlarang hybrid 3 lapis (substring, brand-prefix/suffix, exact match), batasan karakter regex `^[a-zA-Z0-9_.-]+$`, body cap 64 KB Anti-DoS (`MaxBytesReader`), Fail-Closed BOLA guard pada `isAuthorizedForRoom`, dan JWT runtime warning via `sync.Once`. Frontend client-side validation real-time di halaman Register.
- [x] **Interactive Profile Studio, Verified Badge & Unified Real-Time Avatar Engine**: Redesain modal profil 3-tab (Profil, Media & Cache, Keamanan), Avatar Studio interaktif dengan kompresi WebP otomatis untuk foto asli, 3D preset emoji, pembuat avatar inisial warna gradien dinamis, lencana centang biru terpercaya (*VerifiedBadge*) di seluruh layar (daftar obrolan sidebar, status bar header chat, modal profil kontak), serta integrasi penuh backend Go SQL query `peer_avatar_url` dan kolom `is_verified` / `peer_is_verified` dengan auto-migration skema database.
- [x] **UUID-First Identity Architecture (Fase 8 Milestone 8.5)**: Standardisasi mutlak kolom `users.id` (UUID) sebagai pembanding/patokan utama tunggal di seluruh alur aplikasi (Backend MessageStore, validasi kepemilikan pesan *Delete for Everyone*, penyimpanan reaksi emoji, filter query SQL unread/delivered receipts, otorisasi broadcast WebSocket, dan penentuan pesan lawan bicara di linimasa). Menjamin integritas data dan hak akses tetap konsisten 100% meskipun pengguna mengganti `display_name` atau `username`.
- [x] **Bugfix — Delete for Everyone Payload Contract Normalization**: Perbaikan bug kritis di mana "Hapus untuk Semua Orang" hanya menghapus pesan di sisi pengirim namun lawan bicara masih dapat melihat pesan aslinya. Root cause: mismatch JSON key frontend (`"type": "for_everyone"`) vs backend Go struct (`delete_for_everyone: bool`). Backend kini menerima format dual fleksibel; frontend mengirim payload redundan ganda. Test suite 4 skenario `chat_handler_delete_test.go` ditambahkan — 100% lulus.

---

## 🛠️ Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| **Backend** | Go (Golang) 1.24+ | Gorilla WebSocket, Lib/PQ, Go-Redis v9, Modernc SQLite |
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript | Vanilla CSS Design System, Responsive Dark Mode |
| **Database** | PostgreSQL (Supabase) / SQLite | Relational schema, auto-migrations, indexing |
| **Pub/Sub & Cache**| Redis (Upstash) / In-Memory Fallback | Multi-node WebSocket sync & link preview cache |
| **Storage** | Supabase Storage (S3 API) / Local Disk | Media transit buffer with Store-and-Forward |
| **Hosting** | Fly.io (Backend) & Vercel (Frontend) | Low-latency Singapore region (`sin`) |
| **Testing** | Go Testing Suite + TypeScript Check | 100% test passing & zero linter errors |

---

## 🌐 Production Endpoints (Fly.io)

- **REST API Base URL**: `https://<your-backend-app>.fly.dev`
- **WebSocket Endpoint**: `wss://<your-backend-app>.fly.dev/ws`
- **Health Check**: `https://<your-backend-app>.fly.dev/health`

---

## 🚀 Menjalankan Secara Lokal

### Prasyarat
- **Go** (v1.22 atau lebih baru)
- **Node.js** (v18 atau lebih baru) & **npm**

### 1. Jalankan Backend Go (Lokal)
```bash
cd backend
go run main.go
```
> Server backend berjalan di `ws://localhost:8080/ws` (Health check: `http://localhost:8080/health`).

### 2. Jalankan Frontend Next.js (Lokal)
```bash
cd frontend
npm install
npm run dev
```
> Aplikasi web berjalan di `http://localhost:3047` (Otomatis membaca `.env.local`).

---

## 🧪 Menjalankan Pengujian Otomatis

**Unit Test Backend (Go):**
```bash
cd backend
go test -v ./...
```

**Type Check Frontend (TypeScript):**
```bash
cd frontend
npx tsc --noEmit
```

---

## 🚢 Deployment Status

- **Backend (Golang)**: Dideploy ke **[Fly.io](https://fly.io)** (Singapore `sin` region, support persistent WebSocket connection).
- **Frontend (Next.js)**: Dideploy ke **[Vercel](https://vercel.com)** dengan environment variable `BACKEND_API_URL` dan `NEXT_PUBLIC_WS_URL`.
