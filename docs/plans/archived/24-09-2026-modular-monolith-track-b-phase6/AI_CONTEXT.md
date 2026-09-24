# AI Context — Active Milestone

## Workspace Information
- Target Workspace: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- Active Branch: `dev` (Terproteksi dari `main`)
- Tech Stack: Go 1.22+ (Backend Modular Monolith), Next.js 16+ / React 19 / TypeScript (Frontend), SQLite / PostgreSQL (Storage)
- Current Milestone: Track B — Fase 6: Cleanup & Slim Entrypoint Wiring (`wire.go` / `app.go`)

## Active Architectural Constraints
- **Junior Programmer Friendly & Idiomatic Go**: Kode harus mudah dibaca, terstruktur berurutan (single responsibility), memiliki komentar penjelasan bertahap, dan tidak menggunakan framework magic / reflection berlebih.
- **Dockerfile Compatibility**: `Dockerfile` mengeksekusi `go build -ldflags="-w -s" -o /app/wuzz-backend main.go`. Oleh karena itu, entrypoint utama tetap di `backend/main.go` yang memanggil `internal/app`.
- **Zero Breaking Changes**: Seluruh endpoint REST API, WebSocket handshake, middleware CORS, rate limiter, background workers, dan database query wajib mempertahankan kontrak eksisting 100%.
- **Lifecycle Protection**: Dilarang melakukan `git commit` sebelum ada konfirmasi eksplisit ("selesai") dari pengguna.
