# AI Context — Milestone 1: Additive Schema Migration & Tenant Registry

- **Workspace**: WuzzChat Monorepo (`/home/bms-del112/BMS/personal-project/wuzz-chat`)
- **Active Branch**: `dev` (Terproteksi dari `main`)
- **Master Blueprint**: [`docs/TENANT_ENGINE_MASTER_PLAN.md`](../../TENANT_ENGINE_MASTER_PLAN.md)
- **Active Milestone**: Milestone 1 (Additive Schema Migration & Tenant Registry)
- **Core Constraints**:
  1. **Strict Dev-Only**: Semua modifikasi dilakukan di branch `dev`. Dilarang menyentuh `main`.
  2. **Additive & Zero Data Loss**: Dilarang menggunakan `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, atau migrasi destruktif. Kolom `tenant_id` wajib memiliki nilai bawaan `'default'` agar data lama 100% utuh.
  3. **Multi-Database Compatibility**: Mendukung PostgreSQL (produksi Fly.io/Supabase) dan SQLite (development lokal/test).
  4. **Strict Server Lifecycle**: Jika menjalankan port server saat test, wajib di-kill dengan `fuser -k <port>/tcp` sebelum respons selesai.
  5. **Promotion Gate**: Dilarang melakukan `git commit` atau `git push` sebelum ada instruksi "selesai" dari pengguna.
