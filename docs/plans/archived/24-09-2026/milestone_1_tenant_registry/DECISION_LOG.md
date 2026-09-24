# Decision Log — WuzzChat Tenant-Aware Engine Initiative

## DEC-014: Prerequisite Gate Before Multi-Tenancy (Eliminate Hub clientsByNick & Encapsulate Identity Search)
- **Status**: APPROVED
- **Date**: 2026-09-24
- **Context**:
  Sebelum mengimplementasikan Multi-Tenancy (Milestone 1–3), audit arsitektur menemukan adanya map in-memory `clientsByNick` di `Hub` WebSocket dan pemotongan langsung (`bypass`) transport layer ke `store.UserStore` pada fitur pencarian kontak `SearchUsers`.
- **Decision**:
  Mewajibkan Milestone 0 (Prerequisite Stabilization) untuk menghapus `clientsByNick` dan mengenkapsulasi fungsi pencarian profil ke dalam `AuthService` sebelum skema tabel tenant dan kolom `tenant_id` diperkenalkan.
- **Consequences**:
  - Positif: Mencegah tabrakan koneksi real-time jika dua tenant memiliki username yang sama; mencegah kebocoran kontak antar-tenant saat fitur pencarian dipanggil.
  - Negatif: Memerlukan sedikit refactoring pada `ChatHandler` dan `Hub`, namun risikonya mendekati nol karena dilindungi oleh test suite yang komprehensif.

## DEC-015: Shared Database with tenant_id Column as Primary Multi-Tenancy Strategy for WuzzChat Engine
- **Status**: APPROVED
- **Date**: 2026-09-24
- **Context**:
  Mengevaluasi 4 strategi isolasi data (Shared DB + `tenant_id`, Schema per Tenant, Database per Tenant, Dedicated Deployment per Customer).
- **Decision**:
  Mengadopsi strategi **Shared Database dengan kolom `tenant_id` + Composite Index** untuk skala WuzzChat saat ini (mendukung SQLite dev & PostgreSQL prod secara seragam), didampingi opsi **Dedicated Deployment (Container Standalone)** untuk klien enterprise yang menuntut isolasi fisik 100%.
- **Consequences**:
- Menjaga biaya infrastruktur di Fly.io/Supabase tetap hemat ($0 tambahan biaya).
  - Menuntut disiplin penulisan query `WHERE tenant_id = ?` di seluruh repository layer yang diproteksi oleh automated testing.

## DEC-016: Additive Schema Migration Strategy & Default Tenant Seeder for Backward Compatibility
- **Status**: APPROVED
- **Date**: 2026-09-24
- **Context**:
  Transisi WuzzChat menuju Multi-Tenant Engine menuntut modifikasi skema database pada tabel utama (`users`, `conversations`, `forum_memory_jobs`, `memory_drafts`, `approved_memories`) serta pengenalan tabel master `tenants` dan `tenant_api_keys`. Seluruh data produksi eksisting WuzzChat tidak boleh terhapus, terganggu, atau mengalami downtime.
- **Decision**:
  1. Seluruh perubahan skema wajib bersifat aditif: kolom baru `tenant_id` disetel dengan nilai bawaan (`DEFAULT 'default'`) sehingga seluruh row eksisting otomatis terasosiasi dengan tenant bawaan.
  2. DDL tabel `tenants` dan `tenant_api_keys` dieksekusi dengan `CREATE TABLE IF NOT EXISTS` dan `ALTER TABLE ... ADD COLUMN ...` yang aman untuk PostgreSQL maupun SQLite.
  3. Mengimplementasikan seeder otomatis saat startup database: jika record tenant `default` belum ada, sistem langsung membuat record dengan ID `'default'`, name `'Default Tenant'`, dan slug `'default'`, menjamin zero-downtime dan integritas data tanpa intervensi manual.
- **Consequences**:
  - Positif: Zero downtime, zero data loss, seluruh relasi database eksisting tetap valid dan kompatibel 100%.
  - Negatif: Kolom `tenant_id` memerlukan penambahan indeks pencarian dan komposit untuk menjaga performa kueri.

