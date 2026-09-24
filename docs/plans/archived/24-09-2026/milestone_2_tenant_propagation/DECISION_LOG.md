# Decision Log — WuzzChat Tenant Engine

## [DEC-TENANT-001] Additive Schema Migration & Default Tenant Seeder Strategy (Milestone 1)
- **Status**: APPROVED & IMPLEMENTED
- **Context**: Milestone 1 membutuhkan penambahan skema tabel `tenants` dan `tenant_api_keys` serta kolom `tenant_id` pada tabel data utama (`users`, `conversations`, `forum_memory_jobs`, `memory_drafts`, `approved_memories`).
- **Decision**:
  1. Menggunakan migrasi non-destruktif `ALTER TABLE ... ADD COLUMN ... DEFAULT 'default'`.
  2. Mengotomatisasi seeder tenant default (`id: 'default'`, `slug: 'default'`) saat startup database.
  3. Memisahkan domain `internal/tenant` dan `internal/shared/tenant` untuk Clean Architecture.

## [DEC-TENANT-002] Tenant Context Resolution Precedence & Safe Fallback (Milestone 2)
- **Status**: PROPOSED
- **Context**: Setiap request masuk (HTTP REST dan WebSocket handshake) harus dapat diidentifikasi konteks tenant-nya, namun sistem harus tetap 100% kompatibel dengan traffic legacy/public instance.
- **Decision**:
  1. Urutan prioritas resolusi tenant:
     - Prioritas 1: Header `X-Tenant-ID`.
     - Prioritas 2: JWT Claim `tenant_id` jika Authorization bearer atau query token tersedia.
     - Prioritas 3: Fallback ke `tenant.DefaultTenantID` ("default").
  2. Status keaktifan tenant divalidasi via `TenantService.ValidateTenantActive`. Jika nonaktif, tolak dengan HTTP 403.
  3. Propagasi database menggunakan `tenant.MustFromContext(ctx).TenantID()` sehingga jika `ctx` tidak memiliki tenant (misal unit test legacy tanpa mock context), otomatis menggunakan `"default"` tanpa runtime panic atau query error.
  4. Skema `users` menggunakan composite uniqueness `(tenant_id, username)` agar username yang sama di tenant berbeda tidak saling mengunci.
