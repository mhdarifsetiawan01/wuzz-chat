# Implementation Plan — Milestone M-Mobile-9.2

## 🎯 Sasaran Utama
Membangun fondasi domain, skema relasional, dan API engine Go untuk fitur Community Social Feed di Wuzz Chat sesuai prinsip Clean Architecture / DDD, isolasi multi-tenant ketat, dan kompatibilitas dual-driver (PostgreSQL Supabase & SQLite).

---

## 🏗️ Desain & Arsitektur Teknis

### 1. Spesifikasi Domain DDD (`docs/domains/COMMUNITY_FEED.md`)
- **Entitas**: `FeedPost`, `FeedLike`, `FeedComment`, `FeedAuthor`.
- **Invariants & Business Rules**:
  - Konten teks postingan: 1–1.000 karakter, non-empty setelah sanitasi trim whitespace.
  - Media URLs: Opsional array JSON (maksimal 4 URL gambar/media).
  - Konten teks komentar: 1–500 karakter, non-empty.
  - Like/Unlike: Idempotent toggle; atomic increment/decrement pada `feed_posts.likes_count` (dengan batas bawah 0).
  - Post Delete: Hanya pemilik asli (`post.user_id == caller.user_id`) atau role admin/moderator yang berhak menghapus. Otomatis cascade menghapus likes dan komentar.
  - Cursor Pagination: Menggunakan parameter timestamp/ID (`before`) dan `limit` default 20 (maks 50) dengan urutan `created_at DESC` untuk performa O(1) tanpa pagination offset drift.

### 2. Skema Database Relasional Multi-Tenant (`backend/internal/store/sql.go`)
- **Tabel `feed_posts`**:
  ```sql
  CREATE TABLE IF NOT EXISTS feed_posts (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
      user_id VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      media_urls TEXT NOT NULL DEFAULT '[]',
      likes_count INT NOT NULL DEFAULT 0,
      comments_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feed_posts_tenant_created ON feed_posts(tenant_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feed_posts_tenant_user ON feed_posts(tenant_id, user_id);
  ```
- **Tabel `feed_likes`**:
  ```sql
  CREATE TABLE IF NOT EXISTS feed_likes (
      post_id VARCHAR(64) NOT NULL,
      tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
      user_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL,
      PRIMARY KEY (post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_feed_likes_lookup ON feed_likes(post_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_feed_likes_tenant_user ON feed_likes(tenant_id, user_id);
  ```
- **Tabel `feed_comments`**:
  ```sql
  CREATE TABLE IF NOT EXISTS feed_comments (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
      post_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feed_comments_tenant_post ON feed_comments(tenant_id, post_id, created_at ASC);
  ```
- **Kolom `system_role` di `users` & Keamanan Eskalasi Akses**:
  ```sql
  ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role VARCHAR(32) NOT NULL DEFAULT 'user';
  ```
  - Nilai yang didukung: `'user'` (default) dan `'moderator'` (berhak menghapus postingan milik pengguna lain dalam tenant yang sama).
  - **Security Shield**: Input publik (`PUT /api/auth/profile`, `POST /api/auth/register`) strictly mengabaikan `system_role` agar tidak ada celah privilege escalation.
  - Token JWT (`UserClaims`) memuat `SystemRole string` dari DB yang terverifikasi.


### 3. Backend Go Engine & Domain Package (`backend/internal/feed/`)
- `entity.go`: Definisi tipe data domain, input request struct, dan sentinel errors (`ErrPostNotFound`, `ErrUnauthorizedDelete`, `ErrContentEmpty`, `ErrContentTooLong`, dll).
- `repository.go`: Definisi interface `FeedRepository` yang berorientasi context dan tenant isolation:
  - `CreatePost(ctx context.Context, post *FeedPost) error`
  - `GetPostByID(ctx context.Context, tenantID, postID, currentUserID string) (*FeedPost, error)`
  - `ListTimeline(ctx context.Context, tenantID, currentUserID string, before time.Time, limit int) ([]*FeedPost, string, error)`
  - `ToggleLike(ctx context.Context, tenantID, postID, userID string) (bool, int, error)`
  - `CreateComment(ctx context.Context, comment *FeedComment) error`
  - `ListComments(ctx context.Context, tenantID, postID string, before time.Time, limit int) ([]*FeedComment, string, error)`
  - `DeletePost(ctx context.Context, tenantID, postID, userID string, isAdmin bool) error`
- `infra/sql_repository.go`: Implementasi SQL yang melakukan JOIN dengan tabel `users` untuk menyertakan atribut author (`display_name`, `username`, `avatar_url`, `role`, `is_verified`), LEFT JOIN atau EXISTS subquery pada `feed_likes` untuk menentukan `is_liked: bool`, serta transaksi DB aman untuk atomic counter adjustment.
- `service.go`: Application Service yang mengorkestrasi validasi input (sanitasi, karakter limit), id generation (UUIDv4), timestamping, dan aturan hak akses.
- `service_test.go`: Unit tests komprehensif untuk validasi konten dan logika use case feed.

### 4. REST API Handlers & HTTP Endpoints (`backend/internal/api/feed_handler.go`)
- `GET /api/feed`: Mengambil linimasa feed publik ber-cursor (`before`, `limit=20`), menyertakan profil lengkap author dan flag `is_liked`.
- `POST /api/feed`: Membuat postingan baru dengan validasi teks dan media URLs opsional.
- `POST /api/feed/:id/like`: Toggle atomic like/unlike pada postingan, mengembalikan status `liked: true/false` dan `likes_count`.
- `GET /api/feed/:id/comments`: Mengambil daftar komentar pada postingan dengan cursor pagination.
- `POST /api/feed/:id/comments`: Menambahkan komentar baru dan menaikkan `comments_count`.
- `DELETE /api/feed/:id`: Menghapus postingan sendiri atau oleh admin.
- Integrasi middleware `auth.RequireJWT()`, resolusi `tenant_id` via context/claims, dan wiring di `backend/internal/app/wire.go` serta `backend/internal/app/router.go`.

---

## 🧪 Strategi Verifikasi & Testing
1. **Unit Testing Domain**:
   - Pengujian validasi konten (panjang teks, batasan media, sanitasi) di `backend/internal/feed/`.
2. **Integration / API Testing**:
   - Pengujian HTTP handler feed (`feed_handler_test.go`) mencakup skenario: buat postingan, list timeline dengan flag `is_liked`, toggle like idempotent, buat & list komentar, serta proteksi delete postingan milik pengguna lain.
3. **Automated Regression Suite**:
   - Backend: `go test -v ./...` wajib 100% PASS.
   - Frontend & Mobile: `npm run build` di root/frontend dan `npx tsc --noEmit` di mobile untuk memastikan zero breaking changes.
