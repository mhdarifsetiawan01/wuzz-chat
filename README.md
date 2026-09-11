# 💬 Wuzz Chat — Real-Time WebSocket Chat Monorepo

Wuzz Chat adalah aplikasi chat real-time 1-on-1 berbasis WebSocket dengan arsitektur monorepo yang dirancang untuk kemudahan skalabilitas dan deployment terpisah.

---

## 🏗️ Struktur Monorepo

```text
wuzz-chat/
├── backend/                  # WebSocket Backend Service (Golang)
│   ├── internal/
│   │   ├── auth/             # Middleware & Autentikasi (NoOp fase 1, JWT fase 2)
│   │   ├── store/            # Data Layer (In-Memory fase 1, Redis fase 2)
│   │   └── ws/               # WebSocket Hub, Client Pump, Message Router
│   ├── go.mod
│   ├── go.sum
│   └── main.go
│
├── frontend/                 # Web Interface (Next.js 16 + React 19 + TypeScript)
│   ├── app/
│   │   ├── chat/             # Chat UI container, Message bubbles, Status bar
│   │   ├── globals.css       # Dark-mode design system & animations
│   │   ├── layout.tsx
│   │   └── page.tsx          # Landing page & anonymous nickname entry
│   ├── lib/                  # WebSocket client abstraction & TypeScript types
│   ├── server.js             # Custom server dengan integrated WebSocket proxy
│   └── package.json
│
├── .agents/                  # Workspace configuration & lifecycle rules
├── .gitignore
├── PRD-websocket-chat-app.md # Dokumen spesifikasi teknis
└── README.md
```

---

## 📚 Dokumentasi Proyek

Untuk memahami arah, tujuan, dan detail teknis proyek, silakan baca dokumentasi berikut:

- 🗺️ **[ROADMAP.md](docs/ROADMAP.md)** — Rencana jangka panjang, milestone tahapan dari Fase 1 hingga Fase 7 (Auth, Group Chat, Rich Media, Receipts, WebRTC, Scaling).
- 🏛️ **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Spesifikasi desain database relasional (ERD), protokol WebSocket, dan REST API endpoints.
- 📄 **[PRD-websocket-chat-app.md](PRD-websocket-chat-app.md)** — Dokumen spesifikasi kebutuhan produk awal.

---

## 🚀 Fitur yang Telah Selesai (Fase 1 & 2)

- [x] **Bidirectional WebSocket Engine**: Arsitektur hub Go dengan goroutine read/write pump dan graceful disconnect.
- [x] **Next.js Reverse Proxy**: Menangani WebSocket upgrade event pada custom server (`server.js`), mengisolasi URL backend dari browser.
- [x] **Multi-Database Flexible Store**: Otomatis mendukung **Supabase PostgreSQL**, **Local Postgres**, **SQLite**, dan **In-Memory** fallback.
- [x] **Chat History Persistence**: Riwayat pesan otomatis tersimpan di cloud database dan dimuat saat pengguna membuka obrolan atau me-refresh tab.
- [x] **Room-Based Isolation & Instant Links**: Pembuatan room obrolan (`room-XXXX`) dan tombol *Salin Link* instan.
- [x] **Real-Time Presence Tracking**: Pelacakan status online real-time (`room_users`) dan panel drawer daftar peserta room (`👥 X Online`).
- [x] **Optimistic UI & Auto-Reconnect**: Frontend WebSocket client dengan exponential backoff dan rendering bubble obrolan instan.

---

## 🛠️ Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| **Backend** | Go (Golang) 1.24+ | Gorilla WebSocket, Lib/PQ, Modernc SQLite |
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript | Vanilla CSS Design System, Responsive Dark Mode |
| **Database** | PostgreSQL (Supabase Pooler) / SQLite | Relational schema, auto-migrations, indexing |
| **Testing** | Go Testing Suite + TypeScript Check | 100% test passing & zero linter errors |

---

## 🚀 Menjalankan Secara Lokal

### Prasyarat
- **Go** (v1.22 atau lebih baru)
- **Node.js** (v18 atau lebih baru) & **npm**

### 1. Jalankan Backend Go
```bash
cd backend
go run main.go
```
> Server backend berjalan di `ws://localhost:8080/ws` (Health check: `http://localhost:8080/health`).

### 2. Jalankan Frontend Next.js
```bash
cd frontend
npm install
npm run dev
```
> Aplikasi web berjalan di `http://localhost:3047`.

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

## 🚢 Rencana Deployment

- **Backend (Golang)**: Dideploy ke **[Fly.io](https://fly.io)** (support persistent WebSocket connections).
- **Frontend (Next.js)**: Dideploy ke **[Vercel](https://vercel.com)** dengan environment variable `NEXT_PUBLIC_WS_URL` yang mengarah ke endpoint Fly.io.
