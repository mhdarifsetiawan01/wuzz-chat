# PROMPT.md — Master Context Primer & Domain Router

> 💡 **Panduan untuk AI Agent**: Dokumen ini adalah gerbang utama (*Master Router*) sesi kerja Wuzz Chat. AI **WAJIB** membaca dokumen ini terlebih dahulu, lalu langsung membuka **Domain Context Primer** di `docs/context/` yang sesuai dengan tugas yang diperintahkan pengguna sebelum mengeksekusi kode.

---

## 🎯 1. Identitas Proyek & Tech Stack Ringkas
- **Nama Proyek**: Wuzz Chat (Aplikasi chatting real-time kelas industri sekelas WhatsApp & Telegram).
- **Arsitektur**: Monorepo Headless Messaging & Memory Engine:
  - **Backend**: Golang 1.26+ (Modular Monolith DDD: `authz`, `messaging`, `group`, `memory`, `ws`, `push`).
  - **Web Frontend**: Next.js 16 (App Router) + React 19 + TypeScript + Vanilla CSS Design System.
  - **Mobile App**: React Native Expo (`mobile/`) + TypeScript + Android & iOS.
  - **Database & Cache**: PostgreSQL Supabase (Pooler) / SQLite WAL + Upstash Redis Pub/Sub.
- **Branch Kerja Utama**: `dev` *(DILARANG KERAS bekerja atau commit langsung di `main`)*.

---

## 🗺️ 2. Master Domain Router (Peta Acuan Konteks AI)

Sebelum mengeksekusi tugas, AI **HANYA PERLU MEMBACA** dokumen primer yang relevan di bawah ini:

| Kategori Tugas / Topik Fitur | Spesifikasi Domain (DDD) | Konteks Platform | Log Progres |
|---|---|---|---|
| **Autentikasi, JWT, Sesi & Perangkat** | 🔐 **[`docs/domains/AUTH_SESSION.md`](docs/domains/AUTH_SESSION.md)** | [`docs/context/BACKEND.md`](docs/context/BACKEND.md) | [`docs/progress/BACKEND.md`](docs/progress/BACKEND.md) |
| **Profil User, Avatar Studio & Verified** | 👤 **[`docs/domains/PROFILE_IDENTITY.md`](docs/domains/PROFILE_IDENTITY.md)** | [`docs/context/FRONTEND.md`](docs/context/FRONTEND.md) | [`docs/progress/FRONTEND.md`](docs/progress/FRONTEND.md) |
| **Direct Message, E2EE, Receipts, Edit/Del** | 💬 **[`docs/domains/MESSAGING_CHAT.md`](docs/domains/MESSAGING_CHAT.md)** | [`docs/context/BACKEND.md`](docs/context/BACKEND.md) | [`docs/progress/BACKEND.md`](docs/progress/BACKEND.md) |
| **Grup grp_, Forum Topik sub_, RBAC, TTL** | 👥 **[`docs/domains/GROUP_FORUM.md`](docs/domains/GROUP_FORUM.md)** | [`docs/context/BACKEND.md`](docs/context/BACKEND.md) | [`docs/progress/BACKEND.md`](docs/progress/BACKEND.md) |
| **Media Store-and-Forward, Voice Notes** | 📦 **[`docs/domains/MEDIA_LIFECYCLE.md`](docs/domains/MEDIA_LIFECYCLE.md)** | [`docs/context/BACKEND.md`](docs/context/BACKEND.md) | [`docs/progress/FRONTEND.md`](docs/progress/FRONTEND.md) |
| **WebRTC Voice Calling & P2P Audio** | 📞 **[`docs/domains/WEBRTC_CALLING.md`](docs/domains/WEBRTC_CALLING.md)** | [`docs/context/MOBILE.md`](docs/context/MOBILE.md) | [`docs/progress/MOBILE.md`](docs/progress/MOBILE.md) |
| **Group Memory AI, Worker, LLM M1-M7** | 🤖 **[`docs/domains/AI_MEMORY.md`](docs/domains/AI_MEMORY.md)** | [`docs/context/AI_MEMORY.md`](docs/context/AI_MEMORY.md) | [`docs/progress/AI_MEMORY.md`](docs/progress/AI_MEMORY.md) |
| **Multi-Tenancy Engine & Isolasi Data** | 🏢 **[`docs/domains/MULTI_TENANT.md`](docs/domains/MULTI_TENANT.md)** | [`docs/context/MULTI_TENANT.md`](docs/context/MULTI_TENANT.md) | [`docs/progress/MULTI_TENANT.md`](docs/progress/MULTI_TENANT.md) |
| **Push Notification & Kluster Sync** | 🔔 **[`docs/domains/NOTIFICATION_SYNC.md`](docs/domains/NOTIFICATION_SYNC.md)** | [`docs/context/BACKEND.md`](docs/context/BACKEND.md) | [`docs/progress/MOBILE.md`](docs/progress/MOBILE.md) |
| **Arsitektur Global & Skema DB** | 🏛️ **[`docs/context/ARCHITECTURE.md`](docs/context/ARCHITECTURE.md)** | — | [`docs/PROGRESS.md`](docs/PROGRESS.md) |

---

## 🛡️ 3. Aturan Wajib untuk AI (Mandatory Constraints)

1. **Siklus Hidup Server**: Jika menjalankan server untuk pengujian sementara (Go/Next.js), AI **WAJIB mematikan port tersebut (`fuser -k <port>/tcp`)** sebelum mengakhiri respons.
2. **Proteksi Branch `main` & Larangan Auto-Push**:
   - Seluruh pekerjaan wajib di branch `dev` atau feature branch. Dilarang menyentuh `main`.
   - AI **DILARANG KERAS melakukan `git push`** ke remote manapun tanpa instruksi/persetujuan tertulis eksplisit terpisah dari pengguna.
3. **Konfirmasi Sebelum Commit**:
   - Dilarang `git commit` sebelum pengguna menyatakan **"selesai"**.
   - Setelah commit dev berhasil, tawarkan pilihan promosi: (A) merge ke `main` & push, (B) merge ke `main` lokal saja, atau (C) tetap di `dev`.
4. **Wajib Automated Testing Pasca-Tugas (No Live Browser Required)**:
   - Setiap tugas selesai, wajib jalankan automated test sebelum laporan:
     - Frontend: `npm run build` di `frontend/` (0 errors TypeScript & Turbopack).
     - Backend: `go test -v ./...` di `backend/` (100% PASS).
     - Mobile: `npx tsc --noEmit` di `mobile/` (jika mengubah kode mobile).
5. **Peringatan Deployment Backend**: Setiap perubahan kode di `backend/`, wajib sertakan peringatan bahwa server live Fly.io perlu di-deploy ulang (`fly deploy --remote-only`).
6. **Ketahanan Jaringan Lambat & Flaky Server**: Selalu asumsikan latensi 200–800ms+, soket putus, atau timeout. Terapkan `AbortController`, Optimistic UI, dan Write-Through local storage.
7. **Kepatuhan Design System**: Frontend web wajib mematuhi token CSS di `frontend/app/globals.css` dan panduan `frontend/DESIGN.md` (anti raw hex, anti magic z-index `99999`, unified modal primitives).

---

## 🚀 4. Cara Menjalankan Aplikasi Secara Lokal

1. **Backend Go** (Port `8080`):
   ```bash
   cd backend && go run main.go
   ```
2. **Frontend Next.js** (Port `3047`):
   ```bash
   cd frontend && npm run dev
   ```
3. **Mobile React Native** (Metro Bundler):
   ```bash
   cd mobile && npx expo start
   ```
