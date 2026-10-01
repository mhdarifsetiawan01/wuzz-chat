# 🌐 Domain: Community Social Feed (`COMMUNITY_FEED`)

Dokumen ini adalah spesifikasi definitif untuk domain **Community Social Feed & User Acquisition Engine** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Struktur Agregat (*Aggregate Root*)**:
   - `FeedPost` adalah agregat root utama. Setiap postingan memiliki siklus hidup independen dalam lingkup tenant tertentu (`tenant_id`).
   - `FeedLike` dan `FeedComment` adalah entitas bawahan yang terikat kuat ke `FeedPost`.
2. **Validasi Konten Postingan**:
   - `content`: Teks wajib berisi 1–1.000 karakter (setelah proses *trim whitespace*). Postingan hanya spasi kosong akan ditolak (`ErrContentEmpty`).
   - `media_urls`: Opsional, berupa array JSON berisi maksimal **4 tautan URL media** (gambar/video yang sudah diunggah via storage API).
   - Setiap URL media divalidasi server: wajib `http/https` berhost (tanpa `user:pass@`) atau path `/uploads/…`, maks 2048 karakter, tanpa karakter kontrol, dan **ekstensi harus gambar** (`.jpg .jpeg .png .webp .gif .heic .heif`). Selain itu ditolak `400` (`ErrInvalidMediaURL`). Body request dibatasi 64 KB.
   - Upload lampiran feed dari klien baru memakai `?purpose=feed` pada `/api/media/upload` dan `/api/media/signed-upload-url` (hanya gambar asli, divalidasi magic bytes). Klien lama tanpa parameter ini tetap diterima di endpoint upload, namun ditolak saat `POST /api/feed` bila bukan gambar.
   - `post_type`: Mendukung tipe `'standard'`, `'announcement'`, `'article'`, dan `'sponsored'`. Default adalah `'standard'`.
   - `is_pinned`: Menentukan apakah postingan disematkan di puncak linimasa (`true` / `false`).
   - `metadata`: Objek JSON fleksibel untuk informasi tambahan (misal CTA button, deep-link external, banner styling, atau sponsor badge). Default `{}`.
3. **Validasi Konten Komentar**:
   - `content`: Teks wajib berisi 1–500 karakter (setelah *trim whitespace*). Dilarang komentar kosong.
4. **Mekanisme Like & Atomic Counter**:
   - Operasi like bersifat **idempotent toggle**:
     - Jika pengguna belum like ➔ Buat rekaman di `feed_likes` dan naikkan `feed_posts.likes_count` secara atomic (+1).
     - Jika pengguna sudah like ➔ Hapus rekaman dari `feed_likes` dan turunkan `feed_posts.likes_count` secara atomic (-1, dengan batas bawah 0).
5. **Hak Akses & Otorisasi Berjenjang (*RBAC with wuzz_ Prefix*)**:
   - **Hirarki Peran Sistem (`system_role`)**:
     - `user` (Default): Pengguna umum, hanya bisa membuat postingan tipe `standard`, tidak bisa menyematkan (*pin*), dan hanya bisa menghapus postingan miliknya sendiri.
     - `wuzz_moderator`: Petugas penertiban konten, hanya bisa membuat postingan tipe `standard`, tetapi memiliki hak menghapus postingan pelanggaran siapa saja di tenant yang sama (`post.tenant_id == caller.tenant_id`).
     - `wuzz_admin`: Administrator resmi sistem, memiliki hak penuh menerbitkan pengumuman resmi (`announcement`), artikel editorial (`article`), konten promosi (`sponsored`), menyematkan postingan ke puncak linimasa (`is_pinned: true`), menyertakan `metadata` kustom, serta menghapus postingan siapa saja di tenant yang sama.
   - **Role Normalization Guard**: Pembuatan postingan dengan `is_pinned: true`, `post_type != 'standard'`, atau `metadata` kustom dari selain `wuzz_admin` akan dinormalisasi otomatis oleh server ke `standard`, `is_pinned: false`, dan `{}`.
   - **Penghapusan Postingan**: Sebuah postingan HANYA dapat dihapus jika pemanggil adalah pemilik asli postingan (`post.user_id == caller.user_id`) ATAU staf (`wuzz_admin` / `wuzz_moderator`) dalam tenant yang sama (`caller.tenant_id == post.tenant_id`).
   - Upaya penghapusan oleh pihak lain akan ditolak dengan status `403 Forbidden` (`ErrUnauthorizedPostAction`).
   - Penghapusan postingan memicu pembersihan menyeluruh (*cascade delete*) pada `feed_likes` dan `feed_comments` terkait.
6. **Performa & Cursor-Based Pagination**:
   - Linimasa feed publik menggunakan pagination berbasis kursor waktu (`before` timestamp/ID, default `limit=20`, maks `50`).
   - Pengurutan linimasa: `is_pinned DESC, created_at DESC` yang didukung indeks komposit `(tenant_id, is_pinned DESC, created_at DESC)`. Postingan yang di-pin akan selalu berada di urutan teratas.
   - Mengeliminasi *pagination drift* dan duplikasi item saat pengguna melakukan *infinite scroll*.
7. **Isolasi Multi-Tenant Ketat**:
   - Setiap transaksi dan query linimasa, like, maupun komentar dikunci oleh `tenant_id` pemanggil. Data antar tenant terisolasi 100%.

---

## 🗄️ 2. Skema Basis Data Relasional

```sql
-- 1. Tabel Linimasa Postingan Komunitas
CREATE TABLE IF NOT EXISTS feed_posts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    user_id VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,
    media_urls TEXT NOT NULL DEFAULT '[]',
    post_type VARCHAR(32) NOT NULL DEFAULT 'standard',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    metadata TEXT NOT NULL DEFAULT '{}',
    likes_count INT NOT NULL DEFAULT 0,
    comments_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feed_posts_tenant_created ON feed_posts(tenant_id, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_posts_tenant_user ON feed_posts(tenant_id, user_id);

-- 2. Tabel Interaksi Suka (Likes)
CREATE TABLE IF NOT EXISTS feed_likes (
    post_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    user_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_likes_lookup ON feed_likes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_feed_likes_tenant_user ON feed_likes(tenant_id, user_id);

-- 3. Tabel Komentar Postingan
CREATE TABLE IF NOT EXISTS feed_comments (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    post_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feed_comments_tenant_post ON feed_comments(tenant_id, post_id, created_at ASC);

-- 4. Kolom Hak Akses Sistem pada Pengguna (Security RBAC)
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role VARCHAR(32) NOT NULL DEFAULT 'user';
```

---

## 🔌 3. Kontrak REST API

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/api/feed?before={timestamp}&limit=20` | Terproteksi (JWT) | Linimasa feed publik ber-cursor, sticky pinned di atas, menyertakan flag `is_liked` untuk user login |
| `POST` | `/api/feed` | Terproteksi (JWT) | Membuat postingan baru. Khusus `wuzz_admin` dapat mem-pin (`is_pinned: true`), mengatur `post_type`, dan menyertakan `metadata` |
| `POST` | `/api/feed/:id/like` | Terproteksi (JWT) | Toggle atomic like/unlike (mengembalikan `liked: bool`, `likes_count: int`) |
| `GET` | `/api/feed/:id/comments?before={timestamp}&limit=20` | Terproteksi (JWT) | Mengambil daftar komentar pada postingan terurut kronologis |
| `POST` | `/api/feed/:id/comments` | Terproteksi (JWT) | Menambahkan komentar baru (maks 500 karakter) |
| `DELETE` | `/api/feed/:id` | Terproteksi (JWT) | Menghapus postingan oleh pemilik asli atau staf dengan peran `wuzz_admin` / `wuzz_moderator` |

---

## 📦 4. Bentuk Data (Wire Payload Contracts)

### Model Author Profil Publik
```json
{
  "id": "b1b72a08-33e9-4e12-87ff-d1956100c598",
  "username": "budi_wuzz",
  "display_name": "Budi Santoso",
  "avatar_url": "https://.../avatar.webp",
  "role": "Software Engineer",
  "system_role": "user",
  "is_verified": true
}
```

### Model Feed Post Item
```json
{
  "id": "post-uuid-1234",
  "tenant_id": "default",
  "content": "Halo komunitas WuzzChat! Fitur Community Social Feed resmi aktif 🚀",
  "media_urls": ["https://.../photo1.webp"],
  "post_type": "standard",
  "is_pinned": false,
  "metadata": {},
  "likes_count": 12,
  "comments_count": 3,
  "is_liked": true,
  "author": {
    "id": "b1b72a08-33e9-4e12-87ff-d1956100c598",
    "username": "budi_wuzz",
    "display_name": "Budi Santoso",
    "avatar_url": "https://.../avatar.webp",
    "role": "Software Engineer",
    "system_role": "user",
    "is_verified": true
  },
  "created_at": "2026-09-30T14:00:00Z",
  "updated_at": "2026-09-30T14:00:00Z"
}
```
