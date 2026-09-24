# AI Context — Modular Monolith Cleanup & Production Hardening

## 1. Konteks Proyek & Workspace
- **Repository:** `wuzz-chat` (Monorepo Go Backend + Next.js Frontend)
- **Direktori Kerja:** `/home/bms-del112/BMS/personal-project/wuzz-chat/backend/`
- **Branch Aktif:** `dev` *(Strict Dev-Only Rule — Dilarang bekerja di `main`)*
- **Tujuan Utama:** Menuntaskan 3 area fokus pasca-audit arsitektur DDD:
  1. Pembersihan dual-path code debt di HTTP handlers (`internal/api/`).
  2. Routing alur perpesanan WebSocket melalui `messaging.MessageService` (decoupling transport dari database).
  3. Kesiapan Mobile Gateway (React Native readiness: platform device identification & multi-provider push scaffolding).

## 2. Batasan Teknis & Aturan Wajib
- **Prinsip Sederhana & Ramah Junior:** Hindari overengineering; gunakan pola Go idiomatic yang jelas, lurus, dan mudah dipahami.
- **Eksekusi Bertahap Per Milestone:** TIDAK mengerjakan sekaligus. Kerjakan Milestone 1 terlebih dahulu sampai tuntas dan teruji sebelum beralih ke Milestone berikutnya.
- **Strict Verification Gate:** Setiap milestone wajib lolos `go test ./...` dan `npm run build` sebelum dilaporkan ke pengguna.
- **Strict Branch & Server Protection:** Server sementara wajib dimatikan (`fuser -k <port>/tcp`), dilarang commit tanpa persetujuan eksplisit pengguna.
