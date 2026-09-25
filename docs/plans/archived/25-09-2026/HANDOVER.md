# Handover Document — Milestone 6: OpenAPI Contract & Headless Integration Guide

- **Date**: 2026-09-24 / 2026-09-25
- **Next Milestone**: **Milestone 6: OpenAPI Contract & Headless Integration Guide**
- **Active Branch**: `dev`
- **Current State**:
  - Milestone 0 hingga Milestone 5 telah **SELESAI 100%**, teruji, di-merge ke `main`, di-deploy ke live production (Fly.io), dan dipush ke GitHub remote.
  - Branch lokal berada di branch `dev` dan dalam keadaan bersih serta stabil.
  - Seluruh dokumen active plan di `docs/plans/active/` telah disusun secara lengkap dan siap dieksekusi.

---

## 🚀 Panduan Eksekusi untuk Sesi Baru (Besok)

Ketika sesi baru dimulai, AI Agent / Developer cukup mengikuti langkah-langkah berikut:

### 1. Verifikasi Lingkungan Awal
1. Pastikan branch aktif adalah `dev`:
   ```bash
   git branch --show-current
   ```
   *(PENTING: Jangan pernah bekerja di branch `main`!)*
2. Pastikan port server lokal dalam kondisi bersih:
   ```bash
   fuser 8080/tcp 3000/tcp
   ```

### 2. Baca Dokumen Rencana Aktif
1. Pelajari ruang lingkup di [`docs/plans/active/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
2. Periksa daftar tugas di [`docs/plans/active/IMPLEMENTATION_PROGRESS.md`](./IMPLEMENTATION_PROGRESS.md).
3. Pahami batasan arsitektur di [`docs/plans/active/AI_CONTEXT.md`](./AI_CONTEXT.md) dan [`docs/plans/active/DECISION_LOG.md`](./DECISION_LOG.md).

### 3. Urutan Eksekusi Bertahap (Phases)
- **Fase 1**: Audit seluruh endpoint di `backend/internal/app/router.go` dan siapkan skema data bersama.
- **Fase 2**: Susun spesifikasi `docs/openapi.yaml` (OpenAPI 3.1.0) dengan cakupan 100% rute aktif dan contoh payload nyata.
- **Fase 3**: Buat panduan komprehensif `docs/HEADLESS_INTEGRATION_GUIDE.md` (JIT Provisioning, WebSocket RFC 6455 wire formats, E2EE, dan retry backoff).
- **Fase 4**: Tambahkan handler `GET /api/openapi.yaml` dan `GET /api/docs` pada `backend/internal/app/router.go`.
- **Fase 5**: Implementasikan unit test `backend/internal/api/openapi_test.go` dan jalankan testing otomatis wajib:
  ```bash
  cd backend && go test -v ./...
  cd ../frontend && npm run build
  ```
- **Fase 6**: Laporkan hasil pengerjaan dan bukti uji kepada pengguna. Tunggu konfirmasi "selesai" sebelum melakukan audit Tier 1 docs, pengarsipan plan, commit ke `dev`, dan penawaran promosi ke `main`.

---

## 🧪 Verification Evidence
1. **Backend Tests (`go test ./...`)**:
   - `github.com/bms-del112/wuzz-chat/internal/api`: PASS (termasuk `TestOpenAPIHandler_ServeOpenAPISpec` & `TestOpenAPIHandler_ServeDocsUI`)
   - Seluruh package (`internal/ai`, `internal/app`, `internal/auth`, `internal/authz`, `internal/group`, `internal/memory`, `internal/messaging`, `internal/push`, `internal/tenant`, `internal/ws`): 100% PASS (0 failure).
2. **Frontend Turbopack Build (`npm run build`)**:
   - Next.js 16.3.5 Turbopack compilation: SUCCESS (0 errors, TypeScript check: PASS).
3. **OpenAPI 3.1.0 Contract Validation**:
   - `docs/openapi.yaml` sintaks YAML valid dan terbukti dapat di-parse dengan sempurna.
4. **Git Status & Branch Safety**:
   - Aktif di branch `dev` (Proteksi `main` terjaga). Belum ada commit sebelum persetujuan pengguna.

---

## ⚠️ Aturan Proteksi Wajib
1. **Server Lifecycle**: Jika server backend atau frontend dijalankan sementara untuk verifikasi, **WAJIB** dimatikan sebelum mengakhiri respons (`fuser -k <port>/tcp`).
2. **Git Commit Protection**: **DILARANG KERAS** melakukan `git commit` sebelum pengguna secara eksplisit mengetikkan kata "selesai".
3. **No Direct `main` Push**: `git push` ke branch apapun memerlukan izin tertulis terpisah.
