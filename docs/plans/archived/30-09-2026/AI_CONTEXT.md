# AI Context — Community Feed Domain & Backend Go Engine (M-Mobile-9.2)

## 📌 Context Snapshot
- **Milestone**: Fase 12 - Tahap 2: M-Mobile-9.2
- **Objective**: Membangun spesifikasi domain DDD Community Feed, skema database multi-tenant (PostgreSQL Supabase & SQLite), lapisan penyimpanan Go berisolasi tenant (`feed_posts`, `feed_likes`, `feed_comments`), serta REST API endpoints Go untuk linimasa feed publik, kreasi postingan, atomic like/unlike, komentar ber-cursor, dan penghapusan postingan.
- **Repository Target**:
  - `docs/domains/COMMUNITY_FEED.md` (Domain DDD)
  - `backend/internal/store/sql.go` (Skema DB & auto-migrations)
  - `backend/internal/feed/` (Entity, Repository, Infra, Service)
  - `backend/internal/api/feed_handler.go` (HTTP Handler & REST Endpoints)
  - `backend/internal/app/wire.go` & `backend/internal/app/router.go` (Wiring & routing)
  - `backend/internal/feed/` & `backend/internal/api/` (Unit & Integration tests)
- **Active Constraints**:
  - Branch aktif: `dev` (Strict Dev-Only Work, terlarang commit/push langsung ke `main`).
  - Strict Multi-Tenant Scoping: Setiap query tabel feed wajib membatasi `tenant_id = ?` demi isolasi data b2b/tenant yang aman.
  - Non-Destructive Migrations: Tabel dan indeks ditambahkan dengan klausa `IF NOT EXISTS` tanpa merusak skema yang sudah berjalan.
  - Dual Database Compatibility: Kode query harus kompatibel dengan PostgreSQL Supabase dan SQLite driver.
  - Quality Gate: `go test -v ./...` wajib 100% PASS; `npm run build` dan `npx tsc --noEmit` wajib 0 error.
