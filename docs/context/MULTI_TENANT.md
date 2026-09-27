# 🏢 Multi-Tenant Domain Context Primer — Wuzz Chat

Dokumen ini adalah acuan konteks utama untuk desain arsitektur, partisi data, perutean header, dan isolasi tenant pada Wuzz Chat (**Tenant-Aware & Headless B2B Engine**).

---

## 🎯 1. Filosofi & Strategi Isolasi Tenant

Wuzz Chat dirancang bertransformasi dari single-tenant menjadi **Tenant-Aware Engine**:
1. **Model Isolasi**: **Shared Database with Discriminator Column (`tenant_id`)**.
   - Seluruh tabel relasional (`users`, `conversations`, `messages`, `groups`, `memory_artifacts`) memiliki kolom partisi `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'`.
2. **Default Tenant Graceful Fallback**:
   - Tenant default bernilai `"default"` (`tenant_default`).
   - Aplikasi klien resmi Wuzz Chat (Web & Mobile) berjalan pada tenant default ini.
   - Jika request tidak menyertakan header `X-Tenant-ID`, sistem **wajib otomatis mengalirkan ke tenant default tanpa error**.
3. **Unikitas Komposit Identitas**:
   - Kolom `username` tidak lagi unik global, melainkan unik per-tenant: `UNIQUE(tenant_id, username)`.
   - User `alice` di Tenant A tidak akan berbenturan dengan `alice` di Tenant B.

---

## 📡 2. Layer Perutean & Resolusi Header (`X-Tenant-ID`)

```text
HTTP Request / WS Handshake
       │
       ├── Membawa Header `X-Tenant-ID: acme_corp`?
       │         ├── YA  ➔ Resolve `tenant_id = "acme_corp"`
       │         └── TDK ➔ Fallback `tenant_id = "default"`
       │
       ▼
Tenant Context Ingestion (Golang `context.Context`)
       │
       ├── authz.Service (Filter user & lookup)
       ├── messaging.Service (Filter room & pesan)
       ├── group.Service (Filter grup & forum)
       └── ws.Hub (Isolasi broadcast & presensi)
```

1. **REST API**:
   - Resolusi dilakukan di middleware HTTP paling awal (`TenantMiddleware`).
   - Menyuntikkan struct tenant ke dalam `r.Context()`.
2. **WebSocket RFC 6455 Handshake**:
   - Resolusi via query parameter `?tenant_id=...` atau header `X-Tenant-ID`.
   - Client WebSocket di-bind ke bucket tenant tertentu di Hub in-memory.

---

## 🛡️ 3. Boundary & Cross-Tenant Leak Prevention Rules

1. **Fail-Closed Tenant Filtering**:
   - Setiap query SQL data (`SELECT`, `UPDATE`, `DELETE`) **WAJIB MENYERTAKAN** klausul `WHERE tenant_id = $1`.
   - Dilarang keras melakukan pencarian kontak lintas tenant (`SearchUsers` hanya mencari user dalam tenant yang sama).
2. **WebSocket Hub Isolation**:
   - Broadcast channel Redis dan in-memory fanout dipartisi per tenant (misal `wuzz:cluster:events:{tenant_id}`).
   - Pengguna di Tenant A tidak dapat melihat status online atau menerima event typing dari pengguna di Tenant B.
3. **Zero-Destructive Schema Migration**:
   - Penambahan kolom `tenant_id` pada database PostgreSQL live Supabase wajib menggunakan klausa `ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default'`.
   - Dilarang menjatuhkan tabel atau menghapus constraint lama sebelum migrasi data selesai.

---

## 🗺️ 4. Referensi Dokumen Arsitektur Lengkap
- Spesifikasi domain tenant: [`docs/domains/MULTI_TENANT.md`](../domains/MULTI_TENANT.md)
