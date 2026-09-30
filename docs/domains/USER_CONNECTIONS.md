# 🤝 Domain: User Connections & Private Profile Shield (`USER_CONNECTIONS`)

Dokumen ini adalah spesifikasi definitif untuk domain **User Connections (Pertemanan & Koneksi) & Private Profile Shield** pada Wuzz Chat.

---

## 🎯 1. Prinsip & Batasan Domain

1. **Agregat & Invarian**:
   - `UserConnection` adalah entitas relasi terisolasi per tenant (`tenant_id`).
   - Setiap pasangan pengguna `(requester_id, receiver_id)` hanya boleh memiliki 1 relasi aktif di dalam tenant yang sama (`uq_canonical_connection`).
   - Status relasi mengikuti *Finite State Machine* (FSM):
     - `pending`: Menunggu persetujuan penerima.
     - `accepted`: Sah berteman (*Connected*). Membuka izin Direct Message & Telepon jika akun target privat.
     - `declined`: Permintaan ditolak. Mengaktifkan *cooldown period* terkonfigurasi.
     - `blocked`: Pemblokiran komunikasi penuh.

2. **Karakteristik Akun Privat vs Publik**:
   - **Akun Publik (`is_private_account: false`)**:
     - Profil, bio, role, medsos dapat dilihat oleh siapa saja.
     - Postingan feed komunitas publik.
     - DM dan Panggilan terbuka untuk siapa saja (`allow_direct_messages = 'everyone'`, `allow_calls = 'everyone'`).
   - **Akun Privat (`is_private_account: true`)**:
     - Profil dan postingan feed tetap publik (menjaga discovery komunitas).
     - DM dan Panggilan **HANYA** dapat diinisiasi oleh pengguna yang berstatus `accepted` di `user_connections` (`allow_direct_messages = 'friends'`, `allow_calls = 'friends'`).
     - Jika bukan teman, inisiasi DM atau panggilan ditolak di level API backend (HTTP 403 / Call Rejected).

3. **Future-Ready Connection Types (`source_type`)**:
   - `'in_app_request'`: Permintaan koneksi dalam aplikasi melalui antarmuka WuzzChat (Tahap saat ini).
   - `'phone_contact'`: Koneksi otomatis berdasarkan pencocokan nomor telepon/buku kontak HP (Persiapan masa depan).

---

## ⚙️ 2. Konfigurasi Dinamis (Anti-Hardcode)

Seluruh batasan operasional domain dapat dikonfigurasi melalui *Environment Variables* dengan fallback default yang aman:

| Environment Variable | Tipe | Default | Keterangan |
|---|---|---|---|
| `CONNECTION_RATE_LIMIT_PER_MINUTE` | `int` | `10` | Batas maksimal pengiriman friend request per user per menit |
| `CONNECTION_DAILY_LIMIT` | `int` | `50` | Batas maksimal friend request baru per user per hari |
| `CONNECTION_MAX_PENDING_REQUESTS` | `int` | `100` | Batas maksimal permintaan pending yang belum direspons pada target |
| `CONNECTION_DECLINE_COOLDOWN_HOURS` | `int` | `168` (7 hari) | Jeda waktu sebelum requester bisa kirim ulang ke user yang menolak |
| `CONNECTION_PAGE_DEFAULT_LIMIT` | `int` | `20` | Jumlah data per halaman friendlist |
| `CONNECTION_PAGE_MAX_LIMIT` | `int` | `50` | Batas maksimal data per halaman cursor pagination |
| `CONNECTION_CACHE_TTL_SECONDS` | `int` | `600` (10 mnt) | Masa hidup cache Redis relasi pertemanan |

---

## 🏛️ 3. Skema Relasi Database

```sql
CREATE TABLE IF NOT EXISTS user_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    source_type VARCHAR(20) NOT NULL DEFAULT 'in_app_request',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT chk_no_self_connection CHECK (requester_id != receiver_id),
    CONSTRAINT uq_canonical_connection UNIQUE (tenant_id, LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))
);

-- Indeks komposit untuk Cursor-Based Infinite Scroll performa tinggi (ratusan/ribuan teman)
CREATE INDEX IF NOT EXISTS idx_conn_requester_cursor 
ON user_connections(tenant_id, requester_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_conn_receiver_cursor 
ON user_connections(tenant_id, receiver_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_conn_receiver_pending 
ON user_connections(tenant_id, receiver_id, status, created_at DESC)
WHERE status = 'pending';
```

---

## 🛡️ 4. Mitigasi Skenario Terburuk (*Worst-Case Scenarios*)

1. **User Memiliki Ribuan Teman (High Volume Friends)**:
   - Dilarang menggunakan `OFFSET` (karena O(N) lambat).
   - Seluruh pagination daftar teman menggunakan **Cursor-Based** (`before_timestamp` & `before_id`).
   - Query satu kali `INNER JOIN` dengan proyeksi kolom ramping (`id`, `username`, `display_name`, `avatar_url`, `is_verified`, `status_message`, `last_seen`).
2. **Bot / Spammer Membanjiri Permintaan Pertemanan**:
   - Token-bucket in-memory rate limiter mencegat spam sebelum query menyentuh database connection pooler.
   - Pengecekan kuota `CONNECTION_MAX_PENDING_REQUESTS`: Jika penerima sudah memiliki 100 pending request yang belum ditanggapi, tolak request baru dengan error ramah.
3. **Simultaneous Bilateral Requests (Race Condition)**:
   - Database constraint `LEAST/GREATEST` menjamin hanya ada 1 baris antar 2 user.
   - Jika User A request ke User B, lalu User B request ke User A di milidetik yang sama: sistem melakukan atomic handshake (status langsung menjadi `accepted`).
4. **Mobile Memory Pressure saat Scroll Ribuan Teman**:
   - `FlatList` mobile menerapkan window virtualization: `maxToRenderPerBatch={10}`, `windowSize={7}`, `removeClippedSubviews={true}`.
   - SQLite lokal mobile menyimpan cache dengan batas retensi cerdas dan cursor pagination.
