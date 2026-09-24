# Implementation Plan — Milestone 1: Additive Schema Migration & Tenant Registry

## 🎯 1. Ringkasan & Sasaran
Tujuan dari Milestone 1 adalah meletakkan fondasi multi-tenancy pada WuzzChat Engine tanpa merusak satu baris pun data lama atau mengganggu jalannya aplikasi eksisting. Seluruh data lama otomatis terikat ke tenant bawaan (`id: "default"`), skema diperluas secara non-destruktif, dan domain `tenant` dibuat sebagai package terisolasi sesuai prinsip Domain-Driven Design (DDD).

---

## 🏗️ 2. Komponen Arsitektur & Target File

### A. Additive Database Migration & Seeder (`backend/internal/store/sql.go`)
- **Tabel Baru**:
  - `tenants`:
    - `id VARCHAR(64) PRIMARY KEY`
    - `name VARCHAR(128) NOT NULL`
    - `slug VARCHAR(64) UNIQUE NOT NULL`
    - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
    - `created_at TIMESTAMP NOT NULL`
    - `updated_at TIMESTAMP NOT NULL`
  - `tenant_api_keys`:
    - `id VARCHAR(64) PRIMARY KEY`
    - `tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id)`
    - `app_id VARCHAR(64) UNIQUE NOT NULL`
    - `secret_hash VARCHAR(255) NOT NULL`
    - `name VARCHAR(128) DEFAULT ''`
    - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
    - `created_at TIMESTAMP NOT NULL`
    - Indeks: `idx_tenant_keys_app (app_id, is_active)`, `idx_tenant_keys_tenant (tenant_id)`
- **Kolom Aditif (PostgreSQL & SQLite)**:
  - `users`: `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` + indeks komposit `idx_users_tenant_username (tenant_id, username)`
  - `conversations`: `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` + indeks `idx_conversations_tenant (tenant_id)`
  - `forum_memory_jobs`: `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` + indeks `idx_fmj_tenant (tenant_id)`
  - `memory_drafts`: `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` + indeks `idx_md_tenant (tenant_id)`
  - `approved_memories`: `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` + indeks `idx_am_tenant (tenant_id)`
- **Automatic Default Tenant Seeder**:
  - Fungsi seeder saat `autoMigrate` selesai:
    - Mengecek apakah tenant `default` ada di tabel `tenants`.
    - Jika belum ada, lakukan `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ('default', 'Default Tenant', 'default', true, now, now)`.

### B. Domain Package Tenant (`backend/internal/tenant/`)
- `entity.go`: Struct domain `Tenant` dan `TenantAPIKey`.
- `repository.go`: Interface `TenantRepository` (`GetByID`, `GetBySlug`, `Create`, `Update`, `List`, `GetAPIKeyByAppID`, `CreateAPIKey`, `ListAPIKeysByTenantID`) dan sentinel error (`ErrTenantNotFound`, `ErrTenantInactive`, `ErrDuplicateSlug`, `ErrDuplicateAppID`, `ErrAPIKeyNotFound`).
- `infra/sql_repository.go`: Implementasi `SQLTenantRepository` menggunakan `*sql.DB` dengan dukungan dialek SQLite & PostgreSQL.
- `service.go`: `TenantService` interface & implementation untuk validasi tenant aktif, registrasi tenant, dan autentikasi API Key dasar.

### C. Dependency Injection & Wiring (`backend/internal/app/wire.go`)
- Menambahkan field `TenantRepo tenant.TenantRepository` dan `TenantService tenant.TenantService` pada struct `Application`.
- Menginisialisasi `NewSQLTenantRepository` dan `NewTenantService` di Tahap 1 / Tahap 3 di `app.New(cfg)`.

---

## 🧪 3. Verification & Testing Strategy
1. **Unit & Integration Test**:
   - `backend/internal/tenant/tenant_test.go`:
     - Test migrasi skema tabel `tenants` dan `tenant_api_keys` pada in-memory SQLite.
     - Test pembuatan dan pembacaan `Tenant` (GetByID, GetBySlug, List).
     - Test error handling (Tenant Not Found, Inactive Tenant, Duplicate Slug).
     - Test pembuatan dan validasi `TenantAPIKey` (GetAPIKeyByAppID, API Key hashing).
     - Test verifikasi auto-seeder default tenant.
     - Test verifikasi kolom `tenant_id` pada tabel relasional (`users`, `conversations`, `forum_memory_jobs`, `memory_drafts`, `approved_memories`).
2. **Regression & Full Suite Automated Testing**:
   - Menjalankan `go test -v ./internal/tenant/...`
   - Menjalankan seluruh test suite backend: `go test ./...`
   - Menjalankan verifikasi kompilasi frontend: `npm run build` di direktori `frontend/`.
3. **Server Port Cleanup Verification**:
   - Memastikan tidak ada background process server yang tertinggal (`fuser -k <port>/tcp`).
