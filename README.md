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
│   │   ├── chat/             # Chat UI container, Message bubbles, AudioPlayer, VoiceRecorder, Lightbox
│   │   ├── login/            # Halaman Login
│   │   ├── register/         # Halaman Registrasi
│   │   ├── globals.css       # Dark-mode design system, dynamic waveforms & responsive CSS
│   │   ├── layout.tsx
│   │   └── page.tsx          # Landing page & anonymous nickname entry
│   ├── lib/                  # WebSocket client, API helper, MediaCache (IndexedDB), ImageCompressor
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

- 🗺️ **[ROADMAP.md](docs/ROADMAP.md)** — Rencana jangka panjang, milestone tahapan dari Fase 1 hingga Fase 7 (Auth, Group Chat, Rich Media, Receipts, WebRTC, Scaling).
- 🏛️ **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Spesifikasi desain database relasional (ERD), protokol WebSocket, REST API endpoints, dan Store-and-Forward media lifecycle.
- 📄 **[PROGRESS.md](docs/PROGRESS.md)** — Laporan status pengerjaan detail per fase & milestone.
- 📄 **[PRD-websocket-chat-app.md](PRD-websocket-chat-app.md)** — Dokumen spesifikasi kebutuhan produk awal.

---

## 🚀 Fitur yang Telah Selesai (Fase 1 s/d Fase 6)

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
