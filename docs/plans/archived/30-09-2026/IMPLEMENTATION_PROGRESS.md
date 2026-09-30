# Implementation Progress — Milestone M-Mobile-9.2

## 📋 Status Overview
- Total Tasks: 5 Core Tasks
- Progress: 5 / 5 (Completed & Fully Verified)

---

## 🗂️ Task Breakdown

- [x] **Task 1: Spesifikasi Domain DDD (`docs/domains/COMMUNITY_FEED.md`)**
  - [x] Definisikan entitas, aggregate root (`FeedPost`), dan value objects (`FeedAuthor`, `FeedLike`, `FeedComment`).
  - [x] Rinci business invariants: panjang teks, batasan media, aturan like toggle, dan cursor-based pagination format.
  - [x] Dokumentasikan kontrak REST API and response shapes.


- [x] **Task 2: Skema Database Relasional Multi-Tenant (`backend/internal/store/sql.go`)**
  - [x] Tambahkan DDL tabel `feed_posts`, `feed_likes`, dan `feed_comments` pada migrasi database.
  - [x] Tambahkan kolom `system_role VARCHAR(32) NOT NULL DEFAULT 'user'` di tabel `users` (kompatibel SQLite & Postgres).
  - [x] Tambahkan composite indexes untuk pencarian efisien: `(tenant_id, created_at DESC)`, `(post_id, user_id)`, dan `(tenant_id, post_id, created_at ASC)`.
  - [x] Amankan `PUT /api/auth/profile` dan auth register dari privilege escalation (kebal manipulasi body request).
  - [x] Pastikan kompatibilitas penuh SQLite dan PostgreSQL Supabase.



- [x] **Task 3: Backend Domain Engine Modular (`backend/internal/feed/`)**
  - [x] Buat `backend/internal/feed/entity.go` (Domain entities, input DTOs, dan sentinel errors).
  - [x] Buat `backend/internal/feed/repository.go` (Interface `FeedRepository`).
  - [x] Buat `backend/internal/feed/infra/sql_repository.go` (Implementasi query SQL dengan multi-tenant scoping ketat dan JOIN author).
  - [x] Buat `backend/internal/feed/service.go` (Business logic, validasi konten, atomic like counter).
  - [x] Buat `backend/internal/feed/service_test.go` (Unit tests untuk domain validation & logic).


- [x] **Task 4: REST API Endpoints & Wiring (`backend/internal/api/` & `backend/internal/app/`)**
  - [x] Buat `backend/internal/api/feed_handler.go` (`GET /api/feed`, `POST /api/feed`, `POST /api/feed/:id/like`, `GET /api/feed/:id/comments`, `POST /api/feed/:id/comments`, `DELETE /api/feed/:id`).
  - [x] Hubungkan feed service & handler di `backend/internal/app/wire.go`.
  - [x] Daftarkan rute `/api/feed*` di `backend/internal/app/router.go` dengan middleware JWT & tenant resolver.


- [x] **Task 5: Verifikasi, Automated Testing & Quality Gate**
  - [x] Buat integration/handler test `backend/internal/api/feed_handler_test.go`.
  - [x] Eksekusi `go test -v ./...` dan pastikan 100% lulus.
  - [x] Verifikasi `npm run build` dan `npx tsc --noEmit` di mobile.

