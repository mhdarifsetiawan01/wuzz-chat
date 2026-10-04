# 🏢 Domain: Multi-Tenancy Engine (`MULTI_TENANT`)

Dokumen ini adalah spesifikasi definitif untuk domain **Multi-Tenancy, Isolasi Data B2B, dan Perutean Tenant** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Model Isolasi Partisi Data**:
   - Berbasis **Shared Database with Discriminator Column (`tenant_id`)**.
   - Setiap baris data pada tabel relasional terikat pada satu penyewa (*tenant*).
2. **Default Tenant Graceful Fallback**:
   - Tenant default bernilai `"default"` (`tenant_default`).
   - Aplikasi klien standar (Web & Mobile) berjalan di atas tenant default ini.
   - Request yang tidak menyertakan header `X-Tenant-ID` otomatis diarahkan ke tenant default tanpa error 400/404.
3. **Keunikan Identitas Komposit**:
   - Kolom `username` bersifat unik per-tenant: `UNIQUE(tenant_id, username)`.
   - Pengguna dengan username sama dapat eksis di tenant yang berbeda tanpa konflik.
4. **Pencegahan Kebocoran Lintas Tenant (*Cross-Tenant Leak Prevention*)**:
   - Seluruh query data (`SELECT`, `UPDATE`, `DELETE`) wajib menyertakan filter `WHERE tenant_id = $1`.
   - Pencarian kontak (`SearchUsers`) dan daftar grup hanya mengembalikan entitas dalam tenant yang sama.

5. **Tenant Sesi Tidak Dapat Dipalsukan**:
   - Jika request membawa JWT valid, `X-Tenant-ID` (bila ada) **wajib sama** dengan `tenant_id` di token; selain itu HTTP 403.
   - Header hanya menentukan tenant untuk request tanpa token (mis. exchange token).
6. **Pendaftaran Publik Hanya Tenant `default`**:
   - `POST /api/auth/register` pada tenant non-default → 403. User tenant B2B masuk lewat provisioning (`/api/v1/auth/provision-token`).
7. **Keanggotaan Satu Tenant**:
   - DM, anggota awal grup, tambah anggota, dan join grup hanya untuk user se-tenant. Pelanggaran DM → 404 (tidak membocorkan keberadaan user).
   - Perangkat (`devices`) tidak boleh berpindah pemilik lintas tenant.
8. **File `/uploads/`**: tidak melayani listing direktori.

> Catatan: `MustFromContext` fallback ke `default` bila context tanpa tenant (bukan fail-closed murni). `TenantMiddleware` selalu terpasang di router.

---

## 📡 2. Layer Perutean & Header Contract

- **Header HTTP**: `X-Tenant-ID: <slug_tenant>`
- **Query Param WebSocket**: `wss://...?token=<JWT>&tenant_id=<slug_tenant>`
- **Middleware Resolusi**: `TenantMiddleware` mengekstrak header, memvalidasi status aktif tenant di `tenants` table, dan menyuntikkan tenant context ke Golang `context.Context`.

---

## 🗄️ 3. Skema Basis Data (Tabel & Partisi)

- `tenants`: `id` (PK, UUID), `name`, `slug` (UNIQUE), `status` (`active`/`suspended`), `created_at`.
- Kolom Aditif Partisi pada Seluruh Tabel:
  ```sql
  ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';
  ```
