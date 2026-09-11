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
1. 🗺️ **[`docs/ROADMAP.md`](docs/ROADMAP.md)**: Master roadmap dari Fase 1 hingga Fase 7.
2. 🏛️ **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**: Spesifikasi desain database (ERD), skema tabel, dan protokol WebSocket.
3. 📄 **[`docs/PROGRESS.md`](docs/PROGRESS.md)**: Riwayat kemajuan tugas dan catatan handover setiap fase.
4. 📜 **[`PRD-websocket-chat-app.md`](PRD-websocket-chat-app.md)**: Spesifikasi awal produk.

---

## ⚙️ 3. Arsitektur Teknis & Tech Stack

| Layer | Teknologi | Catatan Implementasi |
|---|---|---|
| **Backend** | Go (Golang 1.26+) | `gorilla/websocket`, `golang-jwt/jwt/v5`, `golang.org/x/crypto/bcrypt`, `lib/pq` (PostgreSQL), `modernc.org/sqlite` |
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript | Vanilla CSS Design System, Auth Context (`useAuth`), WebSocket Client (`ws-client.ts`), 2-Kolom Layout |
| **Proxy Layer** | Custom Node.js Server (`server.js`) | Menangani HTTP upgrade `/ws` dan me-reverse proxy `/api/*` ke Go Backend (`http://localhost:8080`) |
| **Database** | PostgreSQL (Supabase Pooler) | Auto-migration tabel `users`, `conversations`, `conversation_members`, `messages` saat backend start |

---

## 📊 4. Status Fase Saat Ini (Current Progress)

- ✅ **Fase 1: Real-Time Engine Foundation (SELESAI)** — Hub WebSocket Go, Read/Write pumps, Custom Server Proxy, Dark Mode CSS.
- ✅ **Fase 2: Persistence & Presence (SELESAI)** — Supabase PostgreSQL integration, room code routing (`room-XXXX`), auto-migration, drawer anggota online (`👥 X Online`).
- ✅ **Fase 3: User Identity, JWT Auth & Direct Messages (SELESAI)** — Register (`bcrypt`), Login JWT 7 hari, profil user, pencarian kontak (`/api/users/search`), obrolan langsung (Direct Message), layout 2-kolom WhatsApp-grade lengkap dengan Standby / Welcome Screen.
- 🎯 **Fase 4: Modern Chat UX & Interactive Dynamics (SEDANG / NEXT)** —
  1. Unread Badge Counter di sidebar & live last message snippet update.
  2. Sound FX (audio notifikasi kirim & terima pesan).
  3. Status tanda terima pesan: `🕒 Pending` ➔ `✓ Sent` ➔ `✓✓ Delivered` ➔ `✓✓ Read Biru`.
  4. Live Typing Indicator (*"User sedang mengetik..."*).
  5. Emoji reactions & Quote/Reply message.

---

## 🛡️ 5. Aturan Wajib untuk AI (Mandatory Rules & Constraints)

1. **Aturan Siklus Hidup Server**:
   - Jika AI menyalakan server sementara untuk verifikasi (misal: `go run main.go` atau `npm run dev`), AI **WAJIB mematikan port tersebut (`fuser -k <port>/tcp`)** sebelum mengakhiri respons, KECUALI user meminta dibiarkan berjalan.
2. **Aturan Keamanan Git**:
   - **Dilarang keras** melakukan `git push` ke remote tanpa instruksi tertulis eksplisit dari pengguna.
   - Semua pekerjaan dilakukan di branch `dev`.
3. **Aturan Keamanan Database**:
   - Dilarang menjalankan query destruktif (`DROP TABLE`, `DROP DATABASE`, `TRUNCATE`) tanpa konfirmasi tertulis eksplisit dari pengguna.
4. **Kualitas Kode**:
   - Pastikan backend selalu lulus `go test -v ./...` dan frontend selalu lulus `npm run build` sebelum menyelesaikan tugas.

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
