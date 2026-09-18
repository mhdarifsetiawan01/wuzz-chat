# AI Context: Milestone 8.2 — Group Chat Engine & Member Management

## Project Overview
- **Project Name**: Wuzz Chat
- **Active Branch**: `dev`
- **Current Milestone**: Milestone 8.2 (Group Chat Engine & Member Management)
- **Architecture**: Monorepo (Go WebSocket Backend + Next.js 16 App Router Frontend + PostgreSQL Supabase / SQLite)

## Constraints & Mandatory Rules
1. **Server Lifecycle**: Server lokal hanya untuk verifikasi singkat, wajib dimatikan via `fuser -k <port>/tcp` sebelum respons selesai.
2. **Dual-Platform Architecture**: Kompatibilitas wajib untuk KEDUA platform: Mobile (Single-Screen WhatsApp Flow) dan Desktop (2-Column Split).
3. **Branch & Commit Guard**: DILARANG bekerja/commit di `main`. DILARANG `git commit` tanpa izin "selesai" tertulis dari user. DILARANG `git push` tanpa izin tertulis terpisah.
4. **Database Safety**: Auto-migration non-destruktif (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Dilarang DROP/TRUNCATE.
5. **Backend Deployment Warning**: Ingatkan user perihal `fly deploy --remote-only` setiap ada modifikasi kode backend Go.
6. **Network Resilience**: Asumsikan latensi tinggi / flaky network. Gunakan Optimistic UI, abort timeout, disabled state loading.
7. **Scope Decisions**:
   - Enkripsi Grup: **Opsi C (Hybrid / E2EE-Ready Foundation)** — v1 Server-Relayed terlindungi TLS/WSS, skema disiapkan untuk mulus di-upgrade ke Sender Keys E2EE di fase berikutnya.
   - Bad Words Sensor: **Di-skip untuk saat ini** sesuai arahan pengguna.
