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
