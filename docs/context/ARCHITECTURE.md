# 🏛️ Architecture & Infrastructure Domain Context Primer — Wuzz Chat

Dokumen ini adalah acuan konteks utama untuk desain sistem tingkat tinggi (*High-Level Architecture*), skema basis data (ERD), penskalaan kluster terdistribusi, dan infrastruktur deployment Wuzz Chat.

---

## 🗺️ 1. Diagram Arsitektur Sistem Tingkat Tinggi

```text
               ┌───────────────────────────────┐
               │    Klien Pengguna (Clients)   │
               │  • Web App (Next.js 16 PWA)   │
               │  • Mobile App (React Native)  │
               └───────────────┬───────────────┘
                               │
            HTTPS / WSS        │ (Vercel CDN / Ingress)
                               ▼
               ┌───────────────────────────────┐
               │    Production Edge Ingress    │
               │   nginx Reverse Proxy (VPS)   │
               └───────────────┬───────────────┘
                               │
                               ▼
                   ┌─────────────────────┐
                   │   Go Backend Node   │
                   │    (VPS Instance)   │
                   │ • WebSocket Hub     │
                   │ • Modular Monolith  │
                   └──────────┬──────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│  PostgreSQL Supabase │ │  Upstash Redis   │ │ Supabase S3 Storage  │
│  (PgBouncer Pooler)  │ │  (Pub/Sub Cluster│ │ (Media Store-and-    │
│  • Core Relational   │ │   & Session Kick)│ │  Forward Shared Hub) │
└──────────────────────┘ └──────────────────┘ └──────────────────────┘
```

---

## 🗄️ 2. Skema Entitas Basis Data Utama (Core ERD)

1. **Domain Identitas & Perangkat**:
   - `users`: ID (UUIDv4), `username`, `display_name`, `avatar_url`, `is_verified`, `public_key`, `created_at`.
   - `user_credentials`: `user_id` (FK `users.id`), `password_hash`, `key_salt`.
   - `sessions`: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`.
   - `devices`: `id`, `user_id`, `device_id`, `device_name`, `platform` (`web`/`android`/`ios`), `push_token`, `last_active_at`.
2. **Domain Percakapan & Pesan**:
   - `conversations`: `id` (Direct UUID / `grp_<UUID>` / `sub_<UUID>`), `type` (`direct`/`group`/`subgroup`), `title`, `parent_id` (untuk subgrup), `is_public`, `expires_at`, `status`.
   - `conversation_members`: `conversation_id`, `user_id`, `role` (`creator`/`admin`/`member`), `is_pinned`, `cleared_at`.
   - `messages`: `id` (UUIDv4), `conversation_id`, `sender_id`, `content` (plaintext / ciphertext `e2ee:v1:...`), `type`, `media_url`, `is_deleted`, `is_forwarded`, `reply_to_id`, `created_at`.
3. **Domain Group Memory AI**:
   - `forum_memory_jobs`, `memory_drafts`, `memory_artifacts`, `artifact_evidences`, `approved_memories`.

---

## ⚡ 3. Kluster Terdistribusi & Sinkronisasi Lintas Node (VPS + Redis)

- **Multi-Node WebSocket Sync** (produksi saat ini 1 node di VPS; mekanisme ini aktif otomatis bila node ditambah):
  - Setiap instance backend Go memiliki UUID unik node.
  - Event pemutusan sesi (`session_kick`, `device_kick`) dan siaran cluster di-publish ke channel Redis `wuzz:cluster:events`.
  - Node penerima memproses frame pemutusan soket lokal jika target user/device terhubung di node tersebut, dengan guard **Anti-Echo Loop** (mengabaikan event yang di-publish oleh node UUID dirinya sendiri).
- **Core Optimizations**:
  - $O(M)$ in-memory `roomMembersCache` di WebSocket Hub (menggantikan scan linier $O(N)$ ke seluruh koneksi).
  - $O(1)$ batched CTE window function untuk perolehan metadata obrolan dan pesan terakhir.
  - Deduplikasi pesan in-memory (TTL 2 menit) berpresisi `UnixNano()` untuk melindungi reconnect seluler.

---

## 🛡️ 4. Model Keamanan Zero-Trust
1. **Otorisasi Fail-Closed**: Setiap aksi dibentengi oleh pemeriksaan hak akses (`isAuthorizedForRoom`).
2. **Socket-Level IP Pinning**: Scraper pratinjau tautan memblokir seluruh alamat IP privat dan loopback (14 subnet).
3. **Migrasi Database Non-Destruktif**:
   - Dilarang keras menjalankan `DROP TABLE`, `DROP COLUMN`, atau `TRUNCATE`.
   - Seluruh migrasi skema wajib bersifat aditif (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

---

## 🗺️ 5. Referensi Dokumen Lengkap
- Spesifikasi arsitektur & database: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
- Dokumen keamanan & performa: [`docs/SECURITY_AND_PERFORMANCE.md`](../SECURITY_AND_PERFORMANCE.md)
- Cetak biru evolusi modular monolith: [`docs/context/BACKEND.md`](BACKEND.md)
