# 🏢 Multi-Tenant Progress Log — Wuzz Chat

Dokumen ini mencatat seluruh riwayat pengerjaan, status kapabilitas, dan rencana implementasi arsitektur **Multi-Tenancy Engine** (Tenant-Aware & Headless B2B Engine).

---

## 📊 Status Ringkasan
- **Spesifikasi Domain**: [`docs/domains/MULTI_TENANT.md`](../domains/MULTI_TENANT.md) (SELESAI DITETAPKAN ✅)
- **Milestone 0 (Prerequisite Stabilization)**: SELESAI ✅
- **Status Saat Ini**: Standby persiapan eksekusi **Milestone 1 (Additive Schema & Tenant Registry)** 🎯

---

## 🏆 Riwayat Fitur & Milestone yang Telah Selesai

### Milestone 0: Prerequisite Stabilization & Identity Encapsulation
- [x] **Enkapsulasi Query Pengguna ke AuthService**:
  - Mengisolasi pemanggilan `SearchUsers` dan `GetUserProfile` agar melewati `AuthService`, memutus akses langsung handler ke store SQL global.
- [x] **Preparasi Resolusi Header Tenant**:
  - Menyiapkan parameter fallback `tenant_default` (`"default"`) pada seluruh interface kontrak service layer.
- [x] **Pemisahan Kredensial**:
  - Tabel `user_credentials` telah memisahkan kata sandi dari tabel `users`, memudahkan penerapan composite key di masa depan.

---

## 🎯 Rencana Milestone Berikutnya (What's Next)

### 1. Milestone 1: Additive Schema Migration & Tenant Registry
- [ ] Buat tabel `tenants` (`id`, `name`, `slug`, `status`, `created_at`).
- [ ] Tambahkan kolom `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` pada tabel `users`, `conversations`, `messages`, `conversation_members`, `groups`, `memory_artifacts` secara non-destruktif (`ADD COLUMN IF NOT EXISTS`).
- [ ] Ubah constraint unik `username` menjadi indeks komposit `UNIQUE(tenant_id, username)`.

### 2. Milestone 2: Middleware Resolusi Tenant & WS Ingestion
- [ ] Implementasikan `TenantMiddleware` di HTTP router untuk mengekstrak header `X-Tenant-ID` dan menyuntikkannya ke `context.Context`.
- [ ] Tangani query parameter `?tenant_id=...` saat handshake WebSocket RFC 6455.

### 3. Milestone 3: Scoping Query SQL & Isolasi Hub Real-Time
- [ ] Sertakan klausul `WHERE tenant_id = $1` pada seluruh query operasi data.
- [ ] Partisi channel broadcast Redis Pub/Sub berdasarkan `tenant_id`.
